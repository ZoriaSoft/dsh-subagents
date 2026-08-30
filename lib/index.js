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
import { rename, unlink, writeFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { loadDefinitions, serializeDefinition } from './definitions.js';
import { reconcile } from './reconcile.js';
import { CLI_RUNNERS, runCli, runModelBackground, runModelForeground, Semaphore } from './runner.js';

export const name = 'subagents';
export const inject = ['tools', 'subagents', 'llm'];

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
            path: `${ROUTE_BASE}/catalog`,
            handler: async (_req, res) => {
                try {
                    const providers = ctx.llm.listProviders();
                    const grouped = [];
                    for (const provider of providers) {
                        let models = [];
                        try {
                            models = (await ctx.llm.listModels(provider.id)).map((m) => ({ id: m.id, name: m.name }));
                        }
                        catch { /* transient discovery — picker shows empty list */ }
                        grouped.push({ id: provider.id, name: provider.name, models });
                    }
                    json(res, 200, { providers: grouped, clis: Object.keys(CLI_RUNNERS) });
                }
                catch (error) {
                    json(res, 500, { error: String(error?.message ?? error) });
                }
            },
        });
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
                        description: def.description,
                        body: def.body,
                        color: def.color,
                        tools: def.tools,
                        disallowedTools: def.disallowedTools,
                        file: def.file,
                        disabled: false,
                    })),
                    disabledAgents: [],
                    availableTools: visible.filter((n) => !n.startsWith('agent_') && n !== 'run_code'),
                    registeredAgentTools: visible.filter((n) => n.startsWith('agent_')),
                    diagnostics,
                };
                // Panel için devre dışı roller de listelenir (araç olmazlar).
                loadDefinitions(resolved.agentsDir, { includeDisabled: true })
                    .then(({ agents }) => {
                        body.disabledAgents = agents.filter((d) => d.disabled === true).map((d) => ({
                            name: d.name,
                            tool: toolName(d),
                            route: routeLabel(d),
                            description: d.description,
                            body: d.body,
                            color: d.color,
                            tools: d.tools,
                            disallowedTools: d.disallowedTools,
                            file: d.file,
                            disabled: true,
                        }));
                    })
                    .catch(() => { })
                    .finally(() => {
                        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                        res.end(JSON.stringify(body));
                    });
            },
        });
        webServer.register({
            kind: 'exact',
            path: `${ROUTE_BASE}/toggle`,
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    json(res, 405, { error: 'POST only' });
                    return;
                }
                let body;
                try {
                    body = await readJsonBody(req);
                }
                catch (error) {
                    json(res, 400, { error: String(error?.message ?? error) });
                    return;
                }
                const file = String(body?.file ?? '');
                // Yalnız düz dosya adı: yol geçişi yok.
                if (!/^_?[A-Za-z0-9][A-Za-z0-9 ._-]*\.md$/.test(file)) {
                    json(res, 400, { error: 'invalid file name' });
                    return;
                }
                const enabled = !file.startsWith('_');
                const target = enabled ? `_${file}` : file.slice(1);
                try {
                    await rename(join(resolved.agentsDir, file), join(resolved.agentsDir, target));
                }
                catch (error) {
                    json(res, 400, { error: `rename failed: ${String(error?.message ?? error)}` });
                    return;
                }
                await sync('toggle');
                json(res, 200, { file: target, enabled: !enabled });
            },
        });
        // Tanım oluştur/güncelle — dosya yazar, sıcak yükleme kaydeder.
        webServer.register({
            kind: 'exact',
            path: `${ROUTE_BASE}/save`,
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    json(res, 405, { error: 'POST only' });
                    return;
                }
                let payload;
                try {
                    payload = await readJsonBody(req);
                }
                catch (error) {
                    json(res, 400, { error: String(error?.message ?? error) });
                    return;
                }
                const name = String(payload?.name ?? '').trim();
                const description = String(payload?.description ?? '').trim();
                const model = String(payload?.model ?? '').trim();
                const cli = String(payload?.cli ?? '').trim();
                const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                if (name === '' || description === '')
                    return void json(res, 400, { error: 'name and description are required' });
                if (!/^[a-z0-9_-]{1,48}$/.test(slug))
                    return void json(res, 400, { error: `unusable slug "${slug}" (a-z, 0-9, -, _)` });
                if (model !== '' && cli !== '')
                    return void json(res, 400, { error: 'model and cli are mutually exclusive' });
                if (model !== '' && !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_./:+-]*$/.test(model))
                    return void json(res, 400, { error: `invalid model route "${model}" (provider/model)` });
                if (cli !== '' && CLI_RUNNERS[cli] === undefined)
                    return void json(res, 400, { error: `unknown cli "${cli}" (known: ${Object.keys(CLI_RUNNERS).join(', ')})` });
                const originalFile = String(payload?.originalFile ?? '');
                const wasDisabled = originalFile.startsWith('_');
                const file = `${wasDisabled ? '_' : ''}${slug}.md`;
                if (!/^_?[A-Za-z0-9][A-Za-z0-9 ._-]*\.md$/.test(file) || file.includes('/'))
                    return void json(res, 400, { error: 'invalid target file name' });
                const def = {
                    name,
                    description,
                    ...(model !== '' ? { model } : {}),
                    ...(cli !== '' ? { cli } : {}),
                    ...(typeof payload?.color === 'string' && payload.color !== '' ? { color: payload.color } : {}),
                    ...(Array.isArray(payload?.tools) && payload.tools !== null && payload.tools.length > 0
                        ? { tools: payload.tools.map(String) }
                        : {}),
                    ...(Array.isArray(payload?.disallowedTools) && payload.disallowedTools.length > 0
                        ? { disallowedTools: payload.disallowedTools.map(String) }
                        : {}),
                    body: String(payload?.body ?? ''),
                    file,
                };
                try {
                    await writeFile(join(resolved.agentsDir, file), serializeDefinition(def), 'utf8');
                    if (originalFile !== '' && originalFile !== file && /^_?[A-Za-z0-9][A-Za-z0-9 ._-]*\.md$/.test(originalFile)) {
                        await unlink(join(resolved.agentsDir, originalFile)).catch(() => { });
                    }
                }
                catch (error) {
                    return void json(res, 400, { error: `write failed: ${String(error?.message ?? error)}` });
                }
                await sync('save');
                json(res, 200, { file, tool: `agent_${slug}` });
            },
        });
        webServer.register({
            kind: 'exact',
            path: `${ROUTE_BASE}/delete`,
            handler: async (req, res) => {
                if (req.method !== 'POST') {
                    json(res, 405, { error: 'POST only' });
                    return;
                }
                let payload;
                try {
                    payload = await readJsonBody(req);
                }
                catch (error) {
                    json(res, 400, { error: String(error?.message ?? error) });
                    return;
                }
                const file = String(payload?.file ?? '');
                if (!/^_?[A-Za-z0-9][A-Za-z0-9 ._-]*\.md$/.test(file) || file.includes('/'))
                    return void json(res, 400, { error: 'invalid file name' });
                try {
                    await unlink(join(resolved.agentsDir, file));
                }
                catch (error) {
                    return void json(res, 400, { error: `delete failed: ${String(error?.message ?? error)}` });
                }
                await sync('delete');
                json(res, 200, { deleted: file });
            },
        });
    };
    tryMount();
    ctx.on('internal/service', (serviceName) => {
        if (WEB_SERVER_KEYS.includes(serviceName))
            tryMount();
    });
}

// ---------------------------------------------------------------- http ----

/** @param {import('node:http').ServerResponse} res */
function json(res, code, body) {
    res.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 1024 * 1024;

/** @param {import('node:http').IncomingMessage} req */
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('request body too large'));
                req.destroy();
                return;
            }
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw.trim() === '' ? {} : JSON.parse(raw));
            }
            catch {
                reject(new Error('invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
