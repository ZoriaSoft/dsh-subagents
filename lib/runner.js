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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * External CLIs a role can be bound to. `promptFlag` picks the headless task
 * convention; `systemPrompt` says how a role's definition body is delivered:
 *  - 'flag'  — via the CLI's `--append-system-prompt` (kept as a system prompt)
 *  - 'embed' — embedded into the task prompt (CLI has no system-prompt flag)
 *  - 'none'  — not deliverable (documented)
 */
export const CLI_RUNNERS = {
    cmdc: { promptFlag: 'dash-p', systemPrompt: 'embed' },
    pi: { promptFlag: 'dash-p', systemPrompt: 'flag' },
    agy: { promptFlag: 'dash-p', systemPrompt: 'embed' },
    claude: { promptFlag: 'dash-p', systemPrompt: 'flag' },
    dsh: { promptFlag: 'positional', systemPrompt: 'none' },
};

/**
 * Build a CLI's headless argv. Pure — unit tested.
 * @param {string} cli key in CLI_RUNNERS
 * @param {string} prompt the task
 * @param {string | undefined} systemPrompt the role body, if any
 * @returns {string[]}
 */
export function buildCliArgv(cli, prompt, systemPrompt) {
    const spec = CLI_RUNNERS[cli];
    if (spec === undefined)
        throw new Error(`unknown cli "${cli}" (known: ${Object.keys(CLI_RUNNERS).join(', ')})`);
    const base = { cmdc: ['cmdc', '--no-session'], pi: ['pi', '--no-session'], agy: ['agy', '--disable-slash-commands'], claude: ['claude'], dsh: ['dsh', '--profile', 'headless'] }[cli];
    const argv = [...base];
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
 * @param {any} def subagent definition
 * @param {string} prompt
 * @param {{ cliTimeoutMs: number, maxOutputChars: number, semaphore?: Semaphore }} config
 * @returns {Promise<string>} CLI output (stdout + stderr, tailed)
 */
export async function runCli(def, prompt, config) {
    if (CLI_RUNNERS[def.cli] === undefined)
        throw new Error(`unknown cli "${def.cli}" (known: ${Object.keys(CLI_RUNNERS).join(', ')})`);
    const persona = def.body !== undefined && CLI_RUNNERS[def.cli].systemPrompt === 'flag'
        ? personaText(def)
        : def.body; // embed mode wants the raw role text; none-mode is dropped by buildCliArgv
    const argv = buildCliArgv(def.cli, prompt, persona);
    const release = await config.semaphore?.acquire?.();
    try {
        const { stdout, stderr } = await execFileAsync(argv[0], argv.slice(1), {
            timeout: config.cliTimeoutMs,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
        });
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
 * Sanitize a definition's tool filter against the live registry so
 * `tools.restrict` never sees an unknown name.
 * @param {any} ctx plugin context (ctx.tools)
 * @param {any} def
 * @returns {{ allow?: string[], deny?: string[] } | undefined}
 */
export function sanitizeToolFilter(ctx, def) {
    if (def.tools === undefined && def.disallowedTools === undefined)
        return undefined;
    const known = new Set(ctx.tools.view(undefined).knownNames);
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
 * Persona text handed to the child: the definition body, framed by identity.
 * @param {any} def
 * @returns {string}
 */
export function personaText(def) {
    return [
        `You are "${def.name}", a delegated subagent role.`,
        def.body,
        'Finish the delegated task and report your result clearly.',
    ].filter(Boolean).join('\n\n');
}

/**
 * Run a model-backed subagent in the foreground: the tool call waits for the
 * child's final output.
 * @param {any} ctx plugin context (ctx.subagents, ctx.tools, ctx.logger)
 * @param {any} def
 * @param {string} prompt
 * @param {any} exec tool execution (exec.agent = calling agent)
 * @param {any} config resolved plugin config
 * @returns {Promise<{ runId: string, text: string }>}
 */
export async function runModelForeground(ctx, def, prompt, exec, config) {
    const run = await ctx.subagents.start(config.provider, {
        prompt: [{ type: 'text', text: prompt }],
        parent: exec.agent,
        persona: personaText(def),
        toolFilter: sanitizeToolFilter(ctx, def),
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
 * @returns {Promise<{ childId: string }>}
 */
export async function runModelBackground(ctx, def, prompt, exec, config) {
    const { childId } = await ctx.subagents.startContinuable({
        provider: config.provider,
        label: `subagents:${def.name}`,
        signal: new AbortController().signal,
        request: {
            prompt: [{ type: 'text', text: prompt }],
            parent: exec.agent,
            persona: personaText(def),
            toolFilter: sanitizeToolFilter(ctx, def),
            ...(def.model !== undefined ? { agentOptions: parseRoute(def.model) } : {}),
        },
    });
    return { childId };
}
