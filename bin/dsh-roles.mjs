#!/usr/bin/env node
/**
 * dsh-subagents — headless role runner.
 *
 * Runs a CLI-backed subagent role from any harness or plain shell — the same
 * definitions, skills, argv and output shaping the dsh plugin uses, without a
 * live dsh session:
 *
 *   node bin/dsh-roles.mjs list [--json]
 *   node bin/dsh-roles.mjs run <slug> "<task>" [options]
 *
 * run options:
 *   --cwd DIR         working directory for the child CLI (default: here)
 *   --timeout-ms N    per-call timeout (default 600000)
 *   --max-chars N     output tail limit (default 20000)
 *   --cli-model M     override the role's cliModel (mind the model pins)
 *   --cli-effort E    override the role's cliEffort
 *   --agents-dir DIR  role definitions (default $DSH_HOME/agents)
 *   --skills-dir DIR  extra role-skill dir, repeatable (defaults:
 *                     $DSH_HOME/subagent-skills, then bundled skills/)
 *   --json            list: machine-readable output
 *
 * Model-backed roles (no `cli:`) need a live dsh session — this tool refuses
 * them. `dsh`-CLI roles additionally need the PIAI_* provider keys in the
 * environment (source the dsh-providers env file first).
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefinitions } from '../lib/definitions.js';
import { loadSkillBodies } from '../lib/skills.js';
import { runCli } from '../lib/runner.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `usage: dsh-roles list [--json] [--agents-dir DIR]
       dsh-roles run <slug> "<task>" [--cwd DIR] [--timeout-ms N] [--max-chars N]
                                [--cli-model M] [--cli-effort E]
                                [--agents-dir DIR] [--skills-dir DIR]`;

/**
 * Parse command-line arguments. Pure — unit tested.
 * @param {string[]} argv arguments after the program name
 * @returns {{
 *   cmd: 'help' | 'list' | 'run',
 *   slug?: string, task?: string,
 *   cwd?: string, timeoutMs?: number, maxChars?: number,
 *   cliModel?: string, cliEffort?: string,
 *   agentsDir?: string, skillsDirs: string[],
 *   json: boolean, errors: string[],
 * }}
 */
export function parseArgs(argv) {
    const out = { cmd: 'help', skillsDirs: [], json: false, errors: [] };
    const positional = [];
    const valueFlags = new Map([
        ['--cwd', 'cwd'], ['--timeout-ms', 'timeoutMs'], ['--max-chars', 'maxChars'],
        ['--cli-model', 'cliModel'], ['--cli-effort', 'cliEffort'], ['--agents-dir', 'agentsDir'],
    ]);
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') {
            out.cmd = 'help';
            return out;
        }
        if (a === '--json') {
            out.json = true;
            continue;
        }
        if (a === '--skills-dir') {
            if (i + 1 >= argv.length) {
                out.errors.push('--skills-dir needs a value');
                continue;
            }
            out.skillsDirs.push(argv[++i]);
            continue;
        }
        if (valueFlags.has(a)) {
            const key = valueFlags.get(a);
            if (i + 1 >= argv.length) {
                out.errors.push(`${a} needs a value`);
                continue;
            }
            const raw = argv[++i];
            if (key === 'timeoutMs' || key === 'maxChars') {
                const n = Number(raw);
                if (!Number.isInteger(n) || n <= 0) {
                    out.errors.push(`${a} expects a positive integer, got "${raw}"`);
                    continue;
                }
                out[key] = n;
            } else {
                out[key] = raw;
            }
            continue;
        }
        if (a.startsWith('--')) {
            out.errors.push(`unknown flag ${a}`);
            continue;
        }
        positional.push(a);
    }
    const [cmd, slug, task, extra] = positional;
    if (cmd === undefined)
        return out;
    if (cmd !== 'list' && cmd !== 'run') {
        out.errors.push(`unknown command "${cmd}" (expected list or run)`);
        return out;
    }
    if (cmd === 'list')
        out.cmd = 'list';
    if (cmd === 'run') {
        if (slug === undefined || task === undefined) {
            out.errors.push('run needs <slug> and "<task>"');
            return out;
        }
        if (extra !== undefined)
            out.errors.push(`unexpected extra argument "${extra}" — quote the task`);
        out.cmd = 'run';
        out.slug = slug;
        out.task = task;
    }
    return out;
}

/**
 * One summary row per role. Pure — unit tested.
 * @param {any[]} agents loaded definitions
 * @returns {{ slug: string, name: string, cli: string, route: string, description: string }[]}
 */
export function roleRows(agents) {
    return agents.map((a) => ({
        slug: a.slug,
        name: a.name,
        cli: a.cli ?? '(model)',
        route: a.cliModel ?? a.model ?? '—',
        description: String(a.description ?? '').split('\n')[0],
    }));
}

/** Fixed-width table for `list`; tolerates wide content by truncating cells. */
function rowsTable(rows) {
    const head = ['slug', 'cli', 'route', 'description'];
    const widths = head.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
    const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
    return [line(head), ...rows.map((r) => line([r.slug, r.cli, r.route, r.description]))].join('\n');
}

/** @returns {Promise<number>} process exit code */
async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.cmd === 'help' || args.errors.length > 0) {
        if (args.errors.length > 0)
            console.error(args.errors.map((e) => `error: ${e}`).join('\n'));
        console.error(USAGE);
        return args.errors.length > 0 ? 2 : 0;
    }
    const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    const agentsDir = args.agentsDir ?? join(dshHome, 'agents');
    const { agents, diagnostics } = await loadDefinitions(agentsDir);
    for (const d of diagnostics ?? [])
        console.error(`# ${d}`);

    if (args.cmd === 'list') {
        const rows = roleRows(agents);
        if (args.json)
            console.log(JSON.stringify(rows, null, 2));
        else if (rows.length === 0)
            console.error(`no roles under ${agentsDir} — drop frontmatter Markdown files there`);
        else
            console.log(rowsTable(rows));
        return 0;
    }

    const wanted = args.slug.toLowerCase();
    const def = agents.find((a) => a.slug === wanted || a.name.toLowerCase() === wanted);
    if (def === undefined) {
        console.error(`unknown role "${args.slug}" — try: dsh-roles list`);
        return 1;
    }
    if (def.cli === undefined) {
        console.error(`role "${def.slug}" is model-backed (no cli:) — it needs a live dsh session, not this runner`);
        return 1;
    }
    const skillsDirs = [...args.skillsDirs, join(dshHome, 'subagent-skills'), join(REPO_ROOT, 'skills')];
    const { bodies, missing } = await loadSkillBodies(skillsDirs, def.skills);
    for (const m of missing)
        console.error(`# missing role skill: ${m}`);
    const eff = { ...def };
    if (args.cliModel !== undefined)
        eff.cliModel = args.cliModel;
    if (args.cliEffort !== undefined)
        eff.cliEffort = args.cliEffort;
    if (eff.cli === 'dsh' && !Object.keys(process.env).some((k) => k.startsWith('PIAI_')))
        console.error('# hint: dsh role needs PIAI_* provider keys — source the dsh-providers env file first');
    if (args.cwd !== undefined)
        process.chdir(resolve(args.cwd));
    try {
        const out = await runCli(eff, args.task, {
            cliTimeoutMs: args.timeoutMs ?? 600_000,
            maxOutputChars: args.maxChars ?? 20_000,
        }, bodies);
        console.log(out);
        return 0;
    }
    catch (error) {
        console.error(String(error?.message ?? error));
        return 1;
    }
}

let invokedDirectly = false;
try {
    invokedDirectly = process.argv[1] !== undefined
        && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch { /* imported as a module */ }
if (invokedDirectly) {
    main().then(
        (code) => process.exit(code),
        (error) => { console.error(error); process.exit(1); },
    );
}
