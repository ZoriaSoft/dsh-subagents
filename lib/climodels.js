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
 *  - agy   `models`                 → "<id>\t<label>" lines (status on stderr)
 *  - devin `models list --format json` → JSON families (aliases + variants;
 *    the text format hangs on a non-tty pipe — always json)
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
    agy: { flag: '--effort', levels: ['low', 'medium', 'high'] },
    // vibe has no effort CLI flag; thinking is baked into the model entry
    // (~/.vibe/config.toml [[models]] thinking = "high"). Listed so the
    // editor shows it; buildCliArgv never emits a flag (flag: null).
    vibe: { flag: null, levels: ['max'] },
    // devin CLI has no effort flag; the reasoning level composes into the
    // model id (`opus` + `high` → `--model opus-high`, verified against
    // devin 3000.10.31). `-none`/`-minimal` variants exist but only the five
    // common levels are offered.
    devin: { flag: null, levels: ['low', 'medium', 'high', 'xhigh', 'max'], applies: 'model-suffix' },
};

/** Effort tokens a model id may already carry as one `-`-separated segment. */
const EFFORT_TOKENS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/**
 * True when a model id already carries an effort level as one of its `-`
 * tokens (`opus-high`, `claude-opus-5-medium`). Used wherever an effort level
 * would compose into a model id, so a leveled id is never suffixed twice.
 * Pure — unit tested.
 * @param {string} modelId
 * @returns {boolean}
 */
export function hasEffortToken(modelId) {
    return String(modelId ?? '').split('-').some((token) => EFFORT_TOKENS.has(token));
}

/** vibe has no --list-models; model = a ~/.vibe/agents/<id>.toml (default config = glm-5-2). */
const VIBE_MODELS = [
    { id: 'glm', note: 'GLM 5.2 - Mistral hosted (subscription)' },
];

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

/**
 * Parse `devin models list --format json`: `{families: [{family_label,
 * slug, aliases, variants: [{model_uid, label, cost_tier}]}]}`. Aliases and
 * variants share one id namespace (dedup keeps the first occurrence). The
 * `fusion` family is skipped — it carries ~150 composed lead-sidekick
 * pairings, pure picker noise (pin one explicitly via free text if ever
 * needed). Any parse error returns [] so the editor degrades to free text.
 * @param {string} text
 * @returns {{ id: string, note?: string }[]}
 */
export function parseDevinModels(text) {
    let data;
    try {
        data = JSON.parse(String(text ?? ''));
    }
    catch {
        return [];
    }
    const out = [];
    const seen = new Set();
    const emit = (id, note) => {
        if (id === '' || seen.has(id))
            return;
        seen.add(id);
        out.push(note === '' ? { id } : { id, note });
    };
    for (const family of Array.isArray(data?.families) ? data.families : []) {
        if (family?.slug === 'fusion')
            continue;
        for (const alias of Array.isArray(family?.aliases) ? family.aliases : [])
            emit(String(alias ?? '').trim(), 'alias — ' + String(family?.family_label || family?.slug || ''));
        for (const variant of Array.isArray(family?.variants) ? family.variants : []) {
            const label = String(variant?.label ?? '').trim();
            const cost = variant?.cost_tier ? ' · ' + String(variant.cost_tier) : '';
            emit(String(variant?.model_uid ?? '').trim(), `${label}${cost}`);
        }
    }
    return out;
}

const PARSERS = {
    agy: { argv: ['agy', 'models'], parse: parseAgyModels },
    vibe: null, // static list — model via ~/.vibe/agents/<id>.toml
    devin: { argv: ['devin', 'models', 'list', '--format', 'json'], parse: parseDevinModels },
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
 * Run a listing command: stdin ignored (agy hangs on a piped stdin),
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
        child.stdout.on('data', (chunk) => { if (stdout.length < 8 * 1024 * 1024) stdout += chunk; }); // cap like collectCli's maxBuffer (devin's JSON is large); keep draining so the pipe never stalls
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
    if (cli === 'vibe')
        return VIBE_MODELS;
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
    const clis = ['agy', 'vibe', 'devin'];
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
