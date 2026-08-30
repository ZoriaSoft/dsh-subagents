/**
 * dsh-subagents — host half.
 *
 * ZCode-style custom subagents for DeepSeek Harness: roles defined as
 * frontmatter+prompt Markdown files under `<agentsDir>` (default
 * `$DSH_HOME/agents`). Each definition becomes a model-facing tool
 * (`agent_<name>`) the primary agent picks by description. A role runs either
 * on a pinned dsh model route (`model:`), on the calling session's route
 * (inherit), or — dsh-subagents extension — through an external CLI
 * (`cli: cmdc | pi | agy | claude | dsh`).
 *
 * Design notes:
 *  - No system-prompt sections are registered: discovery happens through the
 *    per-agent tool descriptions alone (zero prompt pollution).
 *  - dsh resolves tools per LLM request, so definition edits hot-reload into
 *    the next turn: file watches rescan the directory and re-register tools.
 *  - Registration anchoring: in this dsh composition a registration made
 *    inside the plugin's apply fiber is rolled back when that fiber ends,
 *    while native timers, file-watch callbacks and HTTP handlers anchor
 *    registrations durably. The rescan interval therefore doubles as a
 *    self-heal loop; `lib/reconcile.js` keeps that logic pure and tested.
 *  - A `/agents` slash command lists roles and diagnostics for humans.
 *
 * @module dsh-subagents
 */
import { watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { loadDefinitions } from './definitions.js';
import { reconcile } from './reconcile.js';
import { runCli, runModelBackground, runModelForeground, Semaphore } from './runner.js';

export const name = 'subagents';
export const inject = ['tools', 'subagents'];

/** Web-server service key candidates, newest first. */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'];
const ROUTE_BASE = '/plugins/dsh-subagents';

/** @param {any} config */
function resolveConfig(config) {
    const positive = (v, d) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
    };
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
    return {
        agentsDir: typeof config?.agentsDir === 'string' && config.agentsDir !== ''
            ? config.agentsDir
            : join(dshHome, 'agents'),
        provider: typeof config?.provider === 'string' && config.provider !== '' ? config.provider : 'spawn',
        cliTimeoutMs: positive(config?.cliTimeoutMs, 300_000),
        modelTimeoutMs: positive(config?.modelTimeoutMs, 600_000),
        maxOutputChars: positive(config?.maxOutputChars, 12_000),
        rescanMs: positive(config?.rescanMs, 15_000),
        maxConcurrentCli: positive(config?.maxConcurrentCli, 3),
    };
}

/** @param {any} def */ function toolName(def) {
    return `agent_${def.slug}`;
}

/** @param {any} def */ function routeLabel(def) {
    if (def.cli !== undefined)
        return `cli: ${def.cli}`;
    return def.model ?? 'inherits session model';
}

/** @param {any} def */ function toolDescription(def) {
    return `${def.description} (${routeLabel(def)}). Give a complete, standalone task prompt: the subagent does not see this conversation.`;
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {any} config */
export function apply(ctx, config) {
    const resolved = resolveConfig(config);
    resolved.semaphore = new Semaphore(resolved.maxConcurrentCli);
    /** slug → definition */ const bySlug = new Map();
    /** tool name → disposer */ const disposers = new Map();
    let diagnostics = [];
    let syncing = false;
    let commandDispose = undefined;

    /**
     * Register one agent tool. The definition is captured in the closure;
     * edits re-register with a fresh closure.
     */
    function register(def) {
        const name = toolName(def);
        const dispose = ctx.tools.register(defineTool({
            name,
            description: toolDescription(def),
            timeoutMs: def.cli !== undefined
                ? resolved.cliTimeoutMs + 30_000
                : resolved.modelTimeoutMs + 30_000,
            parameters: {
                prompt: {
                    type: 'string',
                    required: true,
                    description: 'The complete, standalone task for this subagent.',
                },
                run_in_background: {
                    type: 'boolean',
                    description: def.cli !== undefined
                        ? 'Not applicable to CLI-backed subagents (ignored).'
                        : 'Run without waiting: the result returns later as a notice. Defaults to false.',
                },
            },
            output: {
                schema: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        text: { type: 'string', required: true },
                    },
                },
                render: (_args, value) => [{ type: 'text', text: value.text }],
            },
            async execute(args, exec) {
                if (!exec?.agent?.id)
                    throw new Error('agent tools require a calling agent (exec.agent was undefined)');
                const prompt = String(args.prompt ?? '');
                if (prompt.trim() === '')
                    throw new Error('prompt must not be empty');
                if (def.cli !== undefined)
                    return { text: await runCli(def, prompt, resolved) };
                if (args.run_in_background === true) {
                    const { childId } = await runModelBackground(ctx, def, prompt, exec, resolved);
                    return { text: `Subagent "${def.name}" launched in the background (${childId}). Its result arrives as a notice when it settles.` };
                }
                const out = await runModelForeground(ctx, def, prompt, exec, resolved);
                return { text: out.text };
            },
        }));
        disposers.set(name, dispose);
    }

    function unregister(name) {
        const dispose = disposers.get(name);
        if (dispose === undefined)
            return;
        disposers.delete(name);
        try {
            dispose();
        }
        catch { /* best effort */ }
    }

    /**
     * Rescan the agents directory and reconcile registered tools. Runs on
     * durable anchors (native timers, file-watch callbacks, HTTP handlers);
     * reconcile() also re-makes registrations rolled back with the apply
     * fiber.
     */
    async function sync(reason) {
        if (syncing)
            return;
        syncing = true;
        try {
            const { agents, diagnostics: diags } = await loadDefinitions(resolved.agentsDir);
            diagnostics = diags;
            const fresh = new Map(agents.map((def) => [def.slug, def]));
            const isRegistered = (name) => {
                try {
                    return disposers.has(name) && ctx.tools.view(undefined).visible.has(name);
                }
                catch {
                    return false;
                }
            };
            const { unregister: gone, register: added } = reconcile(bySlug, fresh, isRegistered);
            for (const def of gone)
                unregister(toolName(def));
            for (const def of gone)
                bySlug.delete(def.slug);
            for (const def of added) {
                bySlug.set(def.slug, def);
                register(def);
                ctx.logger?.info?.(`dsh-subagents: registered ${toolName(def)} (${routeLabel(def)}) [${reason}]`);
            }
            ensureCommand();
        }
        catch (error) {
            ctx.logger?.warn?.(`dsh-subagents: rescan failed: ${String(error?.message ?? error)}`);
        }
        finally {
            syncing = false;
        }
    }

    /**
     * `/agents` slash command — same durable-anchor + view-probe self-heal as
     * the tools: attempted on every rescan, kept when the registry shows it.
     */
    function ensureCommand() {
        const runtime = ctx.get('commands');
        if (runtime === undefined)
            return;
        try {
            if (runtime.list(undefined).some((c) => c?.name === 'agents'))
                return;
        }
        catch { /* probe best effort — fall through to a duplicate-tolerant try */ }
        try {
            commandDispose = runtime.register({
                name: 'agents',
                description: 'List configured subagent roles (dsh-subagents)',
                handler: async () => {
                    const lines = [...bySlug.values()].map((def) => `- agent_${def.slug} — ${def.description} (${routeLabel(def)})`);
                    const diags = diagnostics.length > 0 ? `\nDiagnostics:\n${diagnostics.map((d) => `- ${d}`).join('\n')}` : '';
                    const text = lines.length > 0
                        ? `Subagent roles (${resolved.agentsDir}):\n${lines.join('\n')}${diags}`
                        : `No subagent roles defined. Drop frontmatter Markdown files into ${resolved.agentsDir}.${diags}`;
                    return { kind: 'success', text };
                },
            });
        }
        catch (error) {
            if (!String(error?.message ?? error).includes('already registered'))
                throw error;
        }
    }

    void sync('boot');
    let rescanTimer = undefined;
    const stopTimers = () => {
        clearInterval(interval);
        clearTimeout(rescanTimer);
    };
    let interval = undefined;
    const startInterval = () => {
        interval = setInterval(() => void sync('interval'), resolved.rescanMs);
    };
    try {
        const watcher = watch(resolved.agentsDir, { persistent: false }, () => {
            clearTimeout(rescanTimer);
            rescanTimer = setTimeout(() => void sync('watch'), 400);
        });
        startInterval();
        ctx.effect(() => {
            stopTimers();
            watcher.close();
            commandDispose?.();
            for (const name of [...disposers.keys()])
                unregister(name);
        });
    }
    catch (error) {
        // An unreadable/missing agents dir must not take the plugin down:
        // the interval keeps retrying, diagnostics explain the state.
        ctx.logger?.warn?.(`dsh-subagents: watching ${resolved.agentsDir} failed: ${String(error?.message ?? error)}`);
        startInterval();
        ctx.effect(() => {
            stopTimers();
            commandDispose?.();
            for (const name of [...disposers.keys()])
                unregister(name);
        });
    }

    // Ops surface — also a durable registration anchor (request fiber).
    let mounted = false;
    const tryMount = () => {
        if (mounted)
            return;
        const webServer = ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]);
        if (webServer === undefined)
            return;
        mounted = true;
        webServer.register({
            kind: 'exact',
            path: `${ROUTE_BASE}/debug`,
            handler: async (_req, res) => {
                await sync('debug');
                let visible = [];
                try {
                    visible = [...ctx.tools.view(undefined).visible.keys()];
                }
                catch { /* registry unavailable */ }
                const body = {
                    agentsDir: resolved.agentsDir,
                    agents: [...bySlug.values()].map((def) => ({
                        name: def.name,
                        tool: toolName(def),
                        route: routeLabel(def),
                        tools: def.tools,
                        disallowedTools: def.disallowedTools,
                        file: def.file,
                    })),
                    registeredAgentTools: visible.filter((n) => n.startsWith('agent_')),
                    diagnostics,
                };
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                res.end(JSON.stringify(body));
            },
        });
    };
    tryMount();
    ctx.on('internal/service', (serviceName) => {
        if (WEB_SERVER_KEYS.includes(serviceName))
            tryMount();
    });
}
