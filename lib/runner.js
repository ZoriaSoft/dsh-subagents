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
import { CLI_EFFORTS } from './climodels.js';

const execFileAsync = promisify(execFile);

/**
 * External CLIs a role can be bound to. `promptFlag` picks the headless task
 * convention; `systemPrompt` says how a role's definition body is delivered:
 *  - 'flag'  — via the CLI's `--append-system-prompt` (kept as a system prompt)
 *  - 'embed' — embedded into the task prompt (CLI has no system-prompt flag)
 *  - 'none'  — not deliverable (documented)
 */
export const CLI_RUNNERS = {
    cmdc: { promptFlag: 'dash-p', systemPrompt: 'embed', modelFlag: '--model' },
    pi: { promptFlag: 'dash-p', systemPrompt: 'flag', modelFlag: '--model' },
    agy: { promptFlag: 'dash-p', systemPrompt: 'embed', modelFlag: '--model' },
    claude: { promptFlag: 'dash-p', systemPrompt: 'flag', modelFlag: '--model' },
    dsh: { promptFlag: 'positional', systemPrompt: 'none', modelFlag: null },
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
    const base = { cmdc: ['cmdc', '--no-session'], pi: ['pi', '--no-session'], agy: ['agy', '--disable-slash-commands'], claude: ['claude'], dsh: ['dsh', '--profile', 'headless'] }[cli];
    const argv = [...base];
    if (cliModel !== undefined && cliModel !== '' && spec.modelFlag !== null)
        argv.push(spec.modelFlag, cliModel);
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
 * @param {{ cliTimeoutMs: number, maxOutputChars: number, semaphore?: Semaphore, logger?: any }} config
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
        return execFileAsync(argv[0], argv.slice(1), {
            timeout: config.cliTimeoutMs,
            maxBuffer: 16 * 1024 * 1024,
            windowsHide: true,
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
            toolFilter: sanitizeToolFilter(ctx, def),
            ...(def.model !== undefined ? { agentOptions: parseRoute(def.model) } : {}),
        },
    });
    return { childId };
}
