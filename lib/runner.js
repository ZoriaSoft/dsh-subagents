/**
 * dsh-subagents — subagent execution.
 *
 * Two backends:
 *  - model-backed: a dsh subagent on a pinned route (`model: provider/model`)
 *    or the calling session's route (inherit). Foreground = one-shot run the
 *    tool call waits for; background = continuable child that settles into a
 *    runtime notice to the calling agent.
 *  - cli-backed: the role runs through an external CLI in a shell-less
 *    subprocess and the tool call returns its output (always foreground).
 *
 * Verified against dsh 0.1.1-rc.2: subagents service calls require an
 * AbortSignal (unconditional `signal.throwIfAborted()`), and `tools.restrict`
 * rejects unknown names — allow/deny lists are sanitized against the live
 * registry before spawn.
 *
 * @module dsh-subagents/runner
 */
import { spawn } from 'node:child_process';
import { CLI_EFFORTS, hasEffortToken } from './climodels.js';

/**
 * Run a CLI and collect its output, resolving on the DIRECT child's exit —
 * not on stream close. execFile waits for stdout/stderr to close, and some
 * CLIs (vibe) spawn a detached worker that inherits the pipe write-ends and
 * holds them open indefinitely, turning every call into a timeout. Killing
 * on exit-event is the correct semantic for a headless one-shot: the child's
 * exit status is authoritative; anything still holding the pipes is noise.
 * @param {string} cmd @param {string[]} args
 * @param {{ timeout: number, maxBuffer: number, cwd?: string }} opts
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export function collectCli(cmd, args, opts) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            // Own process group so the timeout can kill the whole tree —
            // grandchildren (CLI-spawned workers) must not outlive the kill.
            detached: process.platform !== 'win32',
            ...(typeof opts.cwd === 'string' && opts.cwd !== '' ? { cwd: opts.cwd } : {}),
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let killed = false;
        child.stdout.on('data', (d) => { if (stdout.length < opts.maxBuffer) stdout += d; });
        child.stderr.on('data', (d) => { if (stderr.length < opts.maxBuffer) stderr += d; });
        const timer = setTimeout(() => {
            killed = true;
            killTree(child);
        }, opts.timeout);
        const finish = (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (killed) {
                const err = new Error(`Command timed out after ${opts.timeout} ms`);
                err.killed = true;
                reject(err);
                return;
            }
            if (code === 0) {
                resolve({ stdout, stderr });
            }
            else {
                const err = new Error(`Command failed with exit code ${code}`);
                err.code = code;
                err.stdout = stdout;
                err.stderr = stderr;
                reject(err);
            }
        };
        child.on('error', (e) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        });
        child.on('exit', (code) => {
            // Grace for trailing pipe data from the dying child, then settle on
            // its exit status regardless of who still holds the write-ends.
            setTimeout(() => finish(code), 250);
        });
    });
}

/**
 * Kill a spawned child and its whole process tree. POSIX: the child runs in
 * its own group (`detached`), so a negative-pid signal reaches the
 * grandchildren a bare `child.kill()` misses; Windows: `taskkill /T /F`.
 * Best effort — falls back to the direct child when the group is gone.
 * @param {import('node:child_process').ChildProcess} child
 */
function killTree(child) {
    if (child.pid === undefined)
        return;
    if (process.platform === 'win32') {
        try {
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
            return;
        }
        catch { /* fall through to the direct kill */ }
    }
    else {
        try {
            process.kill(-child.pid, 'SIGKILL');
            return;
        }
        catch { /* group already exited — kill the child directly */ }
    }
    try {
        child.kill('SIGKILL');
    }
    catch { /* already dead */ }
}

/**
 * External CLIs a role can be bound to. `promptFlag` picks the headless task
 * convention; `systemPrompt` says how a role's definition body is delivered:
 *  - 'flag'  — via the CLI's `--append-system-prompt` (kept as a system prompt)
 *  - 'embed' — embedded into the task prompt (CLI has no system-prompt flag)
 *  - 'none'  — not deliverable (documented)
 */
export const CLI_RUNNERS = {
    agy: { promptFlag: 'dash-p', systemPrompt: 'embed', modelFlag: '--model' },
    vibe: { promptFlag: 'dash-p', systemPrompt: 'embed', modelFlag: '--agent' }, // base argv pins --output text: default output mode blocks on a non-tty stdout pipe
    // devin has no system-prompt flag → embed; headless one-shot via -p
    devin: { promptFlag: 'dash-p', systemPrompt: 'embed', modelFlag: '--model' },
};

/**
 * Build a CLI's headless argv. Pure — unit tested.
 * @param {string} cli key in CLI_RUNNERS
 * @param {string} prompt the task
 * @param {string | undefined} systemPrompt the role body, if any
 * @param {string | undefined} cliModel the CLI's own model id, if any
 * @param {string | undefined} cliEffort the CLI's reasoning-effort level, if any
 * @returns {string[]}
 */
export function buildCliArgv(cli, prompt, systemPrompt, cliModel, cliEffort) {
    const spec = CLI_RUNNERS[cli];
    if (spec === undefined)
        throw new Error(`unknown cli "${cli}" (known: ${Object.keys(CLI_RUNNERS).join(', ')})`);
    // devin base argv: print mode (-p) fails in an untrusted directory
    // without the trust bypass, and headless roles cannot answer permission
    // prompts — dangerous mode is the headless default.
    const base = { agy: ['agy', '--disable-slash-commands'], vibe: ['vibe', '--auto-approve', '--output', 'text'], devin: ['devin', '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false'] }[cli];
    const argv = [...base];
    // CLIs whose effort composes into the model id (CLI_EFFORTS `applies:
    // 'model-suffix'`, devin) have no effort flag: the level is suffixed onto
    // the model id. Composed before --model is pushed so argv stays
    // `… --model <composed> … -p <task>`.
    let modelArg = cliModel;
    if (CLI_EFFORTS[cli]?.applies === 'model-suffix' && cliEffort !== undefined && cliEffort !== '') {
        if (cliModel === undefined || cliModel === '')
            throw new Error(`cli "${cli}" applies effort via the model id — cliEffort requires cliModel`);
        if (hasEffortToken(cliModel)) {
            if (!cliModel.endsWith('-' + cliEffort))
                throw new Error(`model "${cliModel}" already carries an effort level — drop cliEffort or pick a base model id`);
        }
        else {
            modelArg = cliModel + '-' + cliEffort;
        }
    }
    if (modelArg !== undefined && modelArg !== '' && spec.modelFlag !== null)
        argv.push(spec.modelFlag, modelArg);
    const effortFlag = CLI_EFFORTS[cli]?.flag;
    if (cliEffort !== undefined && cliEffort !== '' && effortFlag !== null && effortFlag !== undefined)
        argv.push(effortFlag, cliEffort);
    let task = prompt;
    if (systemPrompt !== undefined && systemPrompt !== '') {
        if (spec.systemPrompt === 'flag')
            argv.push('--append-system-prompt', systemPrompt);
        else if (spec.systemPrompt === 'embed')
            task = `[Role instructions]\n${systemPrompt}\n\n[Task]\n${prompt}`;
    }
    if (spec.promptFlag === 'dash-p')
        argv.push('-p', task);
    else
        argv.push(task);
    return argv;
}

/**
 * Resolve how one delegation should run. Precedence: the tool call's explicit
 * `run_in_background` argument, then the definition's `background:` field,
 * then the default — model-backed roles run in the background so the chat
 * stays clean; CLI-backed roles are always foreground (subprocess).
 * Pure — unit tested.
 * @param {any} def subagent definition
 * @param {{ run_in_background?: boolean }} args tool arguments
 * @returns {"background" | "foreground"}
 */
export function resolveRunMode(def, args) {
    if (def?.cli !== undefined)
        return 'foreground'; // subprocess — no background mechanism
    const arg = args?.run_in_background;
    if (typeof arg === 'boolean')
        return arg ? 'background' : 'foreground';
    if (typeof def?.background === 'boolean')
        return def.background ? 'background' : 'foreground';
    return 'background';
}

/**
 * Error text that marks a CLI rejecting the effort flag for the chosen
 * model (e.g. agy's thinking models reject `--effort` outright).
 */
const EFFORT_UNSUPPORTED_RE = /--effort is not supported/i;

/**
 * True when a CLI failure was caused by the effort flag being unsupported
 * for the chosen model. Pure — unit tested.
 * @param {unknown} error
 * @returns {boolean}
 */
export function isEffortUnsupportedError(error) {
    return EFFORT_UNSUPPORTED_RE.test(String(error?.stderr ?? ''))
        || EFFORT_UNSUPPORTED_RE.test(String(error?.message ?? ''));
}

/**
 * @param {any} def subagent definition
 * @param {string} prompt
 * @param {{ cliTimeoutMs: number, maxOutputChars: number, cliCwd?: string, semaphore?: Semaphore, logger?: any }} config
 * @param {{ name: string, content: string }[]} skillBodies resolved role skills
 * @returns {Promise<string>} CLI output (stdout + stderr, tailed)
 */
export async function runCli(def, prompt, config, skillBodies = []) {
    if (CLI_RUNNERS[def.cli] === undefined)
        throw new Error(`unknown cli "${def.cli}" (known: ${Object.keys(CLI_RUNNERS).join(', ')})`);
    const persona = CLI_RUNNERS[def.cli].systemPrompt === 'flag'
        ? personaText(def, skillBodies)
        : [def.body, ...skillBlocks(skillBodies)].filter(Boolean).join('\n\n'); // embed wants raw role text + skills
    const attempt = (cliEffort) => {
        const argv = buildCliArgv(def.cli, prompt, persona, def.cliModel, cliEffort);
        return collectCli(argv[0], argv.slice(1), {
            timeout: config.cliTimeoutMs,
            maxBuffer: 16 * 1024 * 1024,
            // Only when a non-empty cliCwd is configured — an absent config
            // must not change the spawn options.
            ...(typeof config.cliCwd === 'string' && config.cliCwd !== '' ? { cwd: config.cliCwd } : {}),
        });
    };
    const release = await config.semaphore?.acquire?.();
    try {
        let result;
        try {
            result = await attempt(def.cliEffort);
        }
        catch (error) {
            // Some models (thinking variants) reject the effort flag. Self-heal
            // once by retrying without it instead of failing the whole task.
            const hasEffort = def.cliEffort !== undefined && def.cliEffort !== '';
            if (hasEffort && isEffortUnsupportedError(error)) {
                config.logger?.warn?.(`dsh-subagents: ${def.name}: model "${def.cliModel ?? def.cli}" rejected --effort ${def.cliEffort}; retrying without it`);
                result = await attempt(undefined);
            }
            else {
                throw error;
            }
        }
        const { stdout, stderr } = result;
        return tail(`${stdout ?? ''}${stderr ? `\n[stderr] ${stderr}` : ''}`, config.maxOutputChars);
    }
    catch (error) {
        if (error?.killed === true || String(error?.message ?? '').includes('TIMED_OUT'))
            throw new Error(`cli "${def.cli}" timed out after ${config.cliTimeoutMs} ms`);
        const partial = `${error?.stdout ?? ''}${error?.stderr ? `\n[stderr] ${error.stderr}` : ''}`;
        throw new Error(`cli "${def.cli}" failed (exit ${error?.code ?? '?'}): ${tail(partial || String(error?.message ?? error), config.maxOutputChars)}`);
    }
    finally {
        release?.();
    }
}

/** Counting semaphore capping concurrent CLI-backed executions. */
export class Semaphore {
    /** @param {number} limit */ constructor(limit) {
        this.limit = Math.max(1, Math.floor(limit));
        this.active = 0;
        this.waiting = [];
    }
    /** @returns {Promise<() => void>} a release ticket */
    acquire() {
        if (this.active < this.limit) {
            this.active++;
            return Promise.resolve(this.makeRelease());
        }
        return new Promise((resolve) => {
            this.waiting.push(() => {
                this.active++;
                resolve(this.makeRelease());
            });
        });
    }
    makeRelease() {
        let done = false;
        return () => {
            if (done)
                return;
            done = true;
            this.active--;
            const next = this.waiting.shift();
            if (next !== undefined)
                next();
        };
    }
}

/** @param {string} text @param {number} max */ function tail(text, max) {
    return text.length > max ? '…' + text.slice(-max) : text;
}

/**
 * lastAssistantMessage / run output content blocks → plain text.
 * @param {unknown} output
 * @returns {string}
 */
export function messageText(output) {
    if (typeof output === 'string')
        return output;
    if (Array.isArray(output))
        return output.map((b) => (typeof b === 'string' ? b : String(b?.text ?? ''))).filter(Boolean).join('\n');
    return output?.text ? String(output.text) : '';
}

/** `provider/model` → agentOptions route; invalid routes were filtered at load. */
export function parseRoute(route) {
    const i = route.indexOf('/');
    return { provider: route.slice(0, i), model: route.slice(i + 1) };
}

/**
 * Sanitize a definition's tool filter against the caller-scoped registry so
 * `tools.restrict` never sees an unknown name.
 * @param {any} ctx plugin context (ctx.tools)
 * @param {any} def
 * @param {any} agent calling agent scope object (exec.agent), not its name
 * @returns {{ allow?: string[], deny?: string[] } | undefined}
 */
export function sanitizeToolFilter(ctx, def, agent) {
    if (def.tools === undefined && def.disallowedTools === undefined)
        return undefined;
    const known = new Set(ctx.tools.view(agent).knownNames);
    const clean = (list, kind) => {
        const kept = (list ?? []).filter((name) => known.has(name));
        const dropped = (list ?? []).filter((name) => !known.has(name));
        if (dropped.length > 0)
            ctx.logger?.warn?.(`dsh-subagents: ${def.name}: unknown ${kind} entries ignored: ${dropped.join(', ')}`);
        return kept;
    };
    if (def.tools !== undefined) {
        const allow = clean(def.tools, 'tools');
        if (allow.length === 0)
            throw new Error(`${def.name}: its "tools" allow-list matches no registered tool — fix the definition`);
        return { allow };
    }
    const deny = clean(def.disallowedTools, 'disallowedTools');
    return deny.length > 0 ? { deny } : undefined;
}

/**
 * Persona text handed to the child: the definition body plus any resolved
 * role skills, framed by identity. Skills ride inside the persona so a
 * cheap model receives them deterministically — no reliance on the child
 * choosing to call the `skill` tool first.
 * @param {any} def
 * @param {{ name: string, content: string }[]} skillBodies
 * @returns {string}
 */
export function personaText(def, skillBodies = []) {
    return [
        `You are "${def.name}", a delegated subagent role.`,
        def.body,
        ...skillBlocks(skillBodies),
        'Finish the delegated task and report your result clearly.',
    ].filter(Boolean).join('\n\n');
}

/** Skill instructions wrapped in the canonical skill-content frame. */
function skillBlocks(skillBodies) {
    return (skillBodies ?? []).map(({ name, content }) => `<skill_instructions name="${name}">\n${content}\n</skill_instructions>`);
}

/**
 * Run a model-backed subagent in the foreground: the tool call waits for the
 * child's final output.
 * @param {any} ctx plugin context (ctx.subagents, ctx.tools, ctx.logger)
 * @param {any} def
 * @param {string} prompt
 * @param {any} exec tool execution (exec.agent = calling agent)
 * @param {any} config resolved plugin config
 * @param {{ name: string, content: string }[]} skillBodies resolved role skills
 * @returns {Promise<{ runId: string, text: string }>}
 */
export async function runModelForeground(ctx, def, prompt, exec, config, skillBodies = []) {
    const run = await ctx.subagents.start(config.provider, {
        prompt: [{ type: 'text', text: prompt }],
        parent: exec.agent,
        persona: personaText(def, skillBodies),
        toolFilter: sanitizeToolFilter(ctx, def, exec.agent),
        ...(def.model !== undefined ? { agentOptions: parseRoute(def.model) } : {}),
        signal: new AbortController().signal,
    });
    let result;
    try {
        result = await run.result;
    }
    finally {
        try {
            await run.dispose();
        }
        catch { /* disposal best effort */ }
    }
    if (result?.stopReason !== undefined && result.stopReason !== 'completed')
        throw new Error(`subagent "${def.name}" stopped: ${result.stopReason}${result.output ? `\n${tail(messageText(result.output), config.maxOutputChars)}` : ''}`);
    return { runId: run.id, text: tail(messageText(result?.output), config.maxOutputChars) };
}

/**
 * Launch a model-backed subagent in the background: a continuable child whose
 * settlement reaches the calling agent as a runtime notice.
 * @param {any} ctx plugin context
 * @param {any} def
 * @param {string} prompt
 * @param {any} exec tool execution
 * @param {any} config resolved plugin config
 * @param {{ name: string, content: string }[]} skillBodies resolved role skills
 * @returns {Promise<{ childId: string }>}
 */
export async function runModelBackground(ctx, def, prompt, exec, config, skillBodies = []) {
    const { childId } = await ctx.subagents.startContinuable({
        provider: config.provider,
        label: `subagents:${def.name}`,
        signal: new AbortController().signal,
        request: {
            prompt: [{ type: 'text', text: prompt }],
            parent: exec.agent,
            persona: personaText(def, skillBodies),
            toolFilter: sanitizeToolFilter(ctx, def, exec.agent),
            ...(def.model !== undefined ? { agentOptions: parseRoute(def.model) } : {}),
        },
    });
    return { childId };
}
