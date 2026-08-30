/**
 * dsh-subagents — live CLI model/effort catalogs.
 *
 * Each supported CLI can list its own models; we parse those listings so the
 * manager editor offers real, current ids instead of free-text guesses.
 * Results are cached briefly (the listings shell out to the CLIs; agy's
 * especially is not free).
 *
 * Listings run with stdin ignored. Several of these CLIs (agy in particular)
 * wait on a piped stdin and never exit, which is why execFile-without-ignore
 * returned empty catalogs after timeout.
 *
 * Verified against this machine's CLIs:
 *  - cmdc  `--list-models`          → "<id>  <description>" sections
 *  - pi    `--list-models`          → "provider model …" table
 *  - agy   `models`                 → "<id>\t<label>" lines (status on stderr)
 *  - claude — no stable listing     → documented static aliases
 *
 * Pure parsers are exported separately for unit tests.
 *
 * @module dsh-subagents/climodels
 */
import { spawn } from 'node:child_process';

const CACHE_TTL_MS = 10 * 60_000;
const LIST_TIMEOUT_MS = 20_000;

/** Reasoning-effort levels per CLI (flag + allowed values). */
export const CLI_EFFORTS = {
    cmdc: { flag: '--effort', levels: ['low', 'medium', 'high'] },
    pi: { flag: '--thinking', levels: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
    agy: { flag: '--effort', levels: ['low', 'medium', 'high'] },
    claude: { flag: '--effort', levels: ['low', 'medium', 'high', 'xhigh', 'max'] },
    dsh: { flag: null, levels: [] },
};

/** claude documents no stable `--list-models`; these are its current aliases. */
const CLAUDE_MODELS = [
    { id: 'fable', note: 'alias — latest Fable' },
    { id: 'opus', note: 'alias — latest Opus' },
    { id: 'sonnet', note: 'alias — latest Sonnet' },
    { id: 'haiku', note: 'alias — latest Haiku' },
    { id: 'latest', note: 'alias' },
];

/**
 * Parse `cmdc --list-models` output: "<id>  <description>" lines under
 * section headers. A model line is "id␣␣+ description" (2+ space gap,
 * non-empty description); header/status lines ("Available models · N",
 * "Open Source") have no such gap-and-description shape.
 * @param {string} text
 * @returns {{ id: string, note?: string }[]}
 */
export function parseCmdcModels(text) {
    const out = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line.includes('·'))
            continue;
        const m = line.match(/^(\S+)\s{2,}(\S.*)$/);
        if (m === undefined || m === null)
            continue;
        const id = m[1];
        const note = m[2].trim();
        out.push(note === '' ? { id } : { id, note });
    }
    return out;
}

/**
 * Parse `pi --list-models` table: header "provider model …", rows
 * whitespace-separated with the route being col0 + "/" + col1.
 * @param {string} text
 * @returns {{ id: string, note?: string }[]}
 */
export function parsePiModels(text) {
    const out = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.trimEnd();
        if (line === '' || /^provider\s+model/i.test(line))
            continue;
        const cols = line.trim().split(/\s{2,}|\t/);
        if (cols.length < 2 || cols[0] === '' || cols[0].includes('─'))
            continue;
        out.push({ id: `${cols[0]}/${cols[1]}` });
    }
    return out;
}

/**
 * Parse `agy models` output: "<id>\t<label>" lines (first line may be a
 * "Fetching…" status).
 * @param {string} text
 * @returns {{ id: string, note?: string }[]}
 */
export function parseAgyModels(text) {
    const out = [];
    for (const raw of String(text ?? '').split(/\r?\n/)) {
        const line = raw.replace(/\t+/, '\t').trim();
        if (line === '' || /^fetching/i.test(line))
            continue;
        const [id, ...rest] = line.split('\t');
        if (id === undefined || id.trim() === '' || id.includes(' '))
            continue;
        const note = rest.join(' ').trim();
        out.push(note === '' ? { id: id.trim() } : { id: id.trim(), note });
    }
    return out;
}

const PARSERS = {
    cmdc: { argv: ['cmdc', '--list-models'], parse: parseCmdcModels },
    pi: { argv: ['pi', '--list-models'], parse: parsePiModels },
    agy: { argv: ['agy', 'models'], parse: parseAgyModels },
    claude: null, // static aliases
};

const cache = new Map(); // cli → { at, models }
const inflight = new Map(); // cli → Promise<models>

/** @param {string} cli @returns {{ models: { id: string, note?: string }[] } | null} cached entry or null */
export function cachedModels(cli) {
    const hit = cache.get(cli);
    return hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS ? hit : null;
}

/** Drop the cache entry (used after a failed refresh and by tests). */
export function invalidate(cli) {
    cache.delete(cli);
}

/**
 * Run a listing command: stdin ignored (agy/cmdc hang on a piped stdin),
 * stdout captured, killed on timeout.
 * @param {string[]} argv
 * @returns {Promise<string>}
 */
function runListing(argv) {
    return new Promise((resolve, reject) => {
        const child = spawn(argv[0], argv.slice(1), {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, PAGER: 'cat', CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' },
            windowsHide: true,
        });
        let stdout = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error(`timeout listing ${argv[0]}`));
        }, LIST_TIMEOUT_MS);
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => { stdout += chunk; });
        child.stderr.resume(); // drain so a full stderr pipe cannot stall the child
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', () => {
            clearTimeout(timer);
            resolve(stdout);
        });
    });
}

/**
 * Models for one CLI: cached when fresh, else fetched (parser failures and
 * CLI errors return [] so the editor degrades to free-text). Concurrent
 * callers share one in-flight listing.
 * @param {string} cli
 * @returns {Promise<{ id: string, note?: string }[]>}
 */
export async function modelsFor(cli) {
    const hit = cachedModels(cli);
    if (hit !== null)
        return hit.models;
    if (cli === 'claude')
        return CLAUDE_MODELS;
    const spec = PARSERS[cli];
    if (spec === undefined || spec === null)
        return [];
    const pending = inflight.get(cli);
    if (pending !== undefined)
        return pending;
    const work = (async () => {
        try {
            const stdout = await runListing(spec.argv);
            const models = spec.parse(stdout);
            if (models.length > 0)
                cache.set(cli, { at: Date.now(), models });
            return models;
        }
        catch {
            return []; // CLI absent or listing failed — editor degrades to free text
        }
    })();
    inflight.set(cli, work);
    try {
        return await work;
    }
    finally {
        inflight.delete(cli);
    }
}

/**
 * All CLI catalogs in parallel (each independent; failures are empty lists).
 * @returns {Promise<Record<string, { models: { id: string, note?: string }[], efforts: string[] }>>}
 */
export async function cliCatalog() {
    const clis = ['cmdc', 'pi', 'agy', 'claude', 'dsh'];
    const settled = await Promise.allSettled(clis.map((c) => modelsFor(c)));
    const out = {};
    clis.forEach((c, i) => {
        out[c] = {
            models: settled[i].status === 'fulfilled' ? settled[i].value : [],
            efforts: CLI_EFFORTS[c]?.levels ?? [],
        };
    });
    return out;
}
