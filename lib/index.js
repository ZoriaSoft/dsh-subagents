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
 *  - Registrations are view-guarded on a rescan interval as well: in this dsh
 *    composition, a registration made inside the plugin's apply fiber is
 *    rolled back when that fiber ends, while native timers, file-watch
 *    callbacks and HTTP handlers anchor registrations durably.
 *
 * @module dsh-subagents
 */
import { watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { loadDefinitions } from './definitions.js';
import { runCli, runModelBackground, runModelForeground } from './runner.js';

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
    /** slug → definition */ const bySlug = new Map();
    /** tool name → disposer */ const disposers = new Map();
    let diagnostics = [];
    let syncing = false;

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
     * Rescan the agents directory and reconcile registered tools. Also the
     * self-heal anchor: a registration that was rolled back gets re-made on
     * the next scan (native timer/watch callbacks anchor durably).
     */
    async function sync(reason) {
        if (syncing)
            return;
        syncing = true;
        try {
            const { agents, diagnostics: diags } = await loadDefinitions(resolved.agentsDir);
            diagnostics = diags;
            const fresh = new Map(agents.map((def) => [def.slug, def]));
            for (const [slug, def] of bySlug) {
                if (fresh.get(slug) !== def)
                    unregister(toolName(def));
            }
            bySlug.clear();
            for (const def of agents) {
                bySlug.set(def.slug, def);
                const name = toolName(def);
                let visible = false;
                try {
                    visible = disposers.has(name) && ctx.tools.view(undefined).visible.has(name);
                }
                catch { /* registry unavailable — register anyway */ }
                if (!visible) {
                    if (disposers.has(name))
                        unregister(name); // stale/rolled-back registration
                    register(def);
                    ctx.logger?.info?.(`dsh-subagents: registered ${name} (${routeLabel(def)}) [${reason}]`);
                }
            }
        }
        catch (error) {
            ctx.logger?.warn?.(`dsh-subagents: rescan failed: ${String(error?.message ?? error)}`);
        }
        finally {
            syncing = false;
        }
    }

    void sync('boot');
    let rescanTimer = undefined;
    try {
        const watcher = watch(resolved.agentsDir, { persistent: false }, () => {
            clearTimeout(rescanTimer);
            rescanTimer = setTimeout(() => void sync('watch'), 400);
        });
        const interval = setInterval(() => void sync('interval'), resolved.rescanMs);
        ctx.effect(() => {
            clearInterval(interval);
            clearTimeout(rescanTimer);
            watcher.close();
            for (const name of [...disposers.keys()])
                unregister(name);
        });
    }
    catch (error) {
        // An unreadable/missing agents dir must not take the plugin down:
        // the interval keeps retrying, diagnostics explain the state.
        ctx.logger?.warn?.(`dsh-subagents: watching ${resolved.agentsDir} failed: ${String(error?.message ?? error)}`);
        const interval = setInterval(() => void sync('interval'), resolved.rescanMs);
        ctx.effect(() => {
            clearInterval(interval);
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
