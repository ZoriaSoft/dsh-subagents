/**
 * dsh-subagents — subagent definition loading.
 *
 * ZCode-style definition files: Markdown with a frontmatter block whose body
 * is the subagent's system prompt. Stored as `<agentsDir>/<name>.md`; a file
 * whose basename starts with `_` is disabled and skipped.
 *
 * Supported frontmatter keys (camelCase, case-sensitive — unknown keys are
 * silently ignored, matching ZCode):
 *   name            required — identifier, e.g. `code-reviewer`
 *   description     required — when the primary agent should pick this role
 *   model           `provider/model`, or `inherit` / omitted to follow the
 *                   calling session's model
 *   cli             run this role through an external CLI instead of a dsh
 *                   model (dsh-subagents extension: cmdc | pi | agy | claude | dsh)
 *   tools           exhaustive allow-list of tool names (omit for all)
 *   disallowedTools deny-list of tool names
 *   color           identity marker (informational)
 *
 * @module dsh-subagents/definitions
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Keys this loader understands; everything else is ignored (ZCode parity). */
const KNOWN_KEYS = new Set([
    'name', 'description', 'model', 'cli', 'tools', 'disallowedTools', 'color',
]);

const SLUG_RE = /^[a-z0-9_-]{1,48}$/;
const ROUTE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_./:+-]*$/;

/** @param {string} raw @returns {string} */
function unquote(raw) {
    const t = raw.trim();
    if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))))
        return t.slice(1, -1);
    return t;
}

/** @param {string} raw */
function parseInlineList(raw) {
    const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
    if (inner.trim() === '')
        return [];
    return inner.split(',').map((x) => unquote(x)).filter((x) => x !== '');
}

/**
 * Minimal frontmatter parser: flat `key: value` scalars, `[a, b]` inline
 * lists, and `- item` block lists. No nested structures by design.
 * @param {string} text
 * @returns {{ attrs: Record<string, string | string[]>, body: string, ignoredKeys: string[] } | null}
 *          null when the file has no frontmatter block.
 */
export function parseFrontmatter(text) {
    if (typeof text !== 'string' || !text.startsWith('---'))
        return null;
    const lines = text.split(/\r?\n/);
    let end = -1;
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') {
            end = i;
            break;
        }
    }
    if (end < 0)
        return null;
    const attrs = {};
    const ignoredKeys = [];
    let lastKey = null;
    for (let i = 1; i < end; i++) {
        const line = lines[i];
        if (line.trim() === '' || line.trimStart().startsWith('#'))
            continue;
        const item = line.trim().match(/^-\s+(.*)$/);
        if (item && lastKey !== null) {
            const current = attrs[lastKey];
            const list = Array.isArray(current) ? current : (current === undefined || current === '' ? [] : [String(current)]);
            const value = unquote(item[1]);
            if (value !== '')
                list.push(value);
            attrs[lastKey] = list;
            continue;
        }
        const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(.*)$/);
        if (!kv)
            continue;
        const key = kv[1];
        const rest = kv[2].trim();
        lastKey = key;
        if (!KNOWN_KEYS.has(key)) {
            ignoredKeys.push(key);
            attrs[key] = rest; // kept for diagnostics; consumers read known keys only
            continue;
        }
        attrs[key] = rest.startsWith('[') ? parseInlineList(rest) : unquote(rest);
    }
    return { attrs, body: lines.slice(end + 1).join('\n').trim(), ignoredKeys };
}

/**
 * Parse one definition file's content into a validated subagent record.
 * @param {string} file basename, for diagnostics
 * @param {string} text file content
 * @returns {{ def: any | null, diagnostics: string[] }}
 */
export function parseDefinition(file, text) {
    const diagnostics = [];
    const parsed = parseFrontmatter(text);
    if (parsed === null) {
        return { def: null, diagnostics: [`${file}: no frontmatter block — skipped`] };
    }
    const { attrs, body, ignoredKeys } = parsed;
    const str = (key) => {
        const v = attrs[key];
        return typeof v === 'string' ? v.trim() : '';
    };
    const list = (key) => {
        const v = attrs[key];
        if (Array.isArray(v))
            return v.map(String);
        if (typeof v === 'string' && v !== '')
            return [v];
        return undefined;
    };
    const name = str('name');
    const description = str('description');
    if (name === '' || description === '')
        return { def: null, diagnostics: [`${file}: "name" and "description" are required — skipped`] };
    const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!SLUG_RE.test(slug))
        return { def: null, diagnostics: [`${file}: unusable slug "${slug}" (a-z, 0-9, -, _) — skipped`] };
    const model = str('model');
    const cli = str('cli');
    if (model !== '' && cli !== '')
        return { def: null, diagnostics: [`${file}: "model" and "cli" are mutually exclusive — skipped`] };
    if (model !== '' && model !== 'inherit' && !ROUTE_RE.test(model))
        diagnostics.push(`${file}: model "${model}" is not provider/model — role inherits the session model`);
    const def = {
        name,
        slug,
        description,
        model: model !== '' && model !== 'inherit' && ROUTE_RE.test(model) ? model : undefined,
        cli: cli !== '' ? cli : undefined,
        tools: list('tools'),
        disallowedTools: list('disallowedTools'),
        color: str('color') || undefined,
        body,
        file,
    };
    if (ignoredKeys.length > 0)
        diagnostics.push(`${file}: ignored unknown keys: ${ignoredKeys.join(', ')}`);
    if (def.body === '')
        diagnostics.push(`${file}: empty system prompt body`);
    return { def, diagnostics };
}

/**
 * Load every enabled definition under a directory.
 * @param {string} dir absolute path
 * @returns {Promise<{ agents: any[], diagnostics: string[] }>}
 */
export async function loadDefinitions(dir) {
    const agents = [];
    const diagnostics = [];
    let entries = [];
    try {
        entries = await readdir(dir);
    }
    catch {
        return { agents, diagnostics: [`agents dir not readable: ${dir}`] };
    }
    for (const file of entries.filter((f) => f.endsWith('.md')).sort()) {
        if (file.startsWith('_') || file.startsWith('.'))
            continue;
        let text = '';
        try {
            text = await readFile(join(dir, file), 'utf8');
        }
        catch (error) {
            diagnostics.push(`${file}: read failed — ${String(error?.message ?? error)}`);
            continue;
        }
        const { def, diagnostics: fileDiag } = parseDefinition(file, text);
        diagnostics.push(...fileDiag);
        if (def !== null)
            agents.push(def);
    }
    const bySlug = new Map();
    for (const def of agents) {
        if (bySlug.has(def.slug)) {
            diagnostics.push(`${def.file}: duplicate name "${def.name}" — ignored (first definition wins)`);
            continue;
        }
        bySlug.set(def.slug, def);
    }
    return { agents: [...bySlug.values()], diagnostics };
}
