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
    'name', 'description', 'model', 'cli', 'cliModel', 'tools', 'disallowedTools', 'color', 'skills',
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
 * lists, `- item` block lists, and `key: |` / `key: >` block scalars
 * (literal / folded, `-`/`+` chomping indicators tolerated). No nested
 * structures by design — a practical YAML subset, zero dependencies.
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
        const blockScalar = rest.match(/^([|>])([-+]?)$/);
        if (blockScalar !== null) {
            const folded = blockScalar[1] === '>';
            const keep = blockScalar[2] === '+';
            const raw = [];
            let j = i + 1;
            while (j < end) {
                const next = lines[j];
                if (next.trim() === '')
                    raw.push('');
                else if (/^\s+/.test(next))
                    raw.push(next.replace(/^\s+/, ''));
                else
                    break;
                j++;
            }
            i = j - 1;
            while (raw.length > 0 && raw[raw.length - 1] === '')
                raw.pop();
            attrs[key] = raw.join(folded ? ' ' : '\n') + (keep && raw.length > 0 ? '\n' : '');
            continue;
        }
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
    const cliModel = str('cliModel');
    if (model !== '' && cli !== '')
        return { def: null, diagnostics: [`${file}: "model" and "cli" are mutually exclusive — skipped`] };
    if (cliModel !== '' && cli === '') {
        diagnostics.push(`${file}: "cliModel" without "cli" — ignored`);
    }
    if (model !== '' && model !== 'inherit' && !ROUTE_RE.test(model))
        diagnostics.push(`${file}: model "${model}" is not provider/model — role inherits the session model`);
    const def = {
        name,
        slug,
        description,
        model: model !== '' && model !== 'inherit' && ROUTE_RE.test(model) ? model : undefined,
        cli: cli !== '' ? cli : undefined,
        cliModel: cliModel !== '' && cli !== '' ? cliModel : undefined,
        tools: list('tools'),
        disallowedTools: list('disallowedTools'),
        skills: list('skills'),
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
 * A stable content signature for one definition. Two parses of an unchanged
 * file produce different object identities but equal signatures — the hot-
 * reload reconciler compares signatures, not identities, so an untouched
 * role is never pointlessly re-registered. `file` and `disabled` are
 * deliberately excluded: renaming or toggling a file must not churn tools.
 * @param {any} def
 * @returns {string}
 */
export function definitionSignature(def) {
    if (def === undefined || def === null)
        return '';
    return JSON.stringify([
        def.name, def.description, def.model, def.cli, def.cliModel,
        def.tools ?? null, def.disallowedTools ?? null,
        def.skills ?? null, def.color, def.body,
    ]);
}

/**
 * Serialize a definition back to its Markdown file form (the inverse of
 * parseDefinition for the keys this loader owns). Multiline scalars use a
 * literal block so round-trips keep their line breaks.
 * @param {any} def
 * @returns {string}
 */
export function serializeDefinition(def) {
    const lines = ['---'];
    lines.push(`name: ${def.name}`);
    if (def.description !== undefined)
        lines.push(...blockScalar('description', def.description));
    if (def.model !== undefined)
        lines.push(`model: ${def.model}`);
    if (def.cli !== undefined) {
        lines.push(`cli: ${def.cli}`);
        if (def.cliModel !== undefined)
            lines.push(`cliModel: ${def.cliModel}`);
    }
    if (def.color !== undefined)
        lines.push(`color: "${def.color}"`);
    if (def.tools !== undefined && def.tools !== null)
        lines.push(`tools: [${def.tools.join(', ')}]`);
    if (def.disallowedTools !== undefined && def.disallowedTools !== null && def.disallowedTools.length > 0)
        lines.push(`disallowedTools: [${def.disallowedTools.join(', ')}]`);
    if (def.skills !== undefined && def.skills !== null && def.skills.length > 0)
        lines.push(`skills: [${def.skills.join(', ')}]`);
    lines.push('---', '', def.body ?? '', '');
    return lines.join('\n');
}

/** `key: |` + indented lines; single-line values stay inline. */
function blockScalar(key, value) {
    const text = String(value);
    if (!text.includes('\n') && text.trim() !== '')
        return [`${key}: ${text}`];
    return [`${key}: |`, ...text.split('\n').map((l) => (l === '' ? '' : `  ${l}`))];
}

/**
 * Load definitions under a directory. Files whose basename starts with `_` or
 * `.` are disabled: parsed and validated, flagged `disabled: true`, and
 * returned only when `opts.includeDisabled` is set (for management surfaces);
 * they never become tools.
 * @param {string} dir absolute path
 * @param {{ includeDisabled?: boolean }} [opts]
 * @returns {Promise<{ agents: any[], diagnostics: string[] }>}
 */
export async function loadDefinitions(dir, opts = {}) {
    const agents = [];
    const disabled = [];
    const diagnostics = [];
    let entries = [];
    try {
        entries = await readdir(dir);
    }
    catch {
        return { agents, diagnostics: [`agents dir not readable: ${dir}`] };
    }
    for (const file of entries.filter((f) => f.endsWith('.md')).sort()) {
        const isDisabled = file.startsWith('_') || file.startsWith('.');
        if (isDisabled && !opts.includeDisabled)
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
        if (def === null)
            continue;
        if (isDisabled)
            def.disabled = true;
        (isDisabled ? disabled : agents).push(def);
    }
    const dedupe = (list, label) => {
        const bySlug = new Map();
        for (const def of list) {
            if (bySlug.has(def.slug)) {
                diagnostics.push(`${def.file}: duplicate name "${def.name}" — ignored (first definition wins)`);
                continue;
            }
            bySlug.set(def.slug, def);
        }
        return [...bySlug.values()];
    };
    const enabledAgents = dedupe(agents);
    const enabledSlugs = new Set(enabledAgents.map((d) => d.slug));
    const disabledAgents = dedupe(disabled).filter((d) => {
        if (enabledSlugs.has(d.slug)) {
            diagnostics.push(`${d.file}: duplicate name "${d.name}" with an enabled role — disabled copy ignored`);
            return false;
        }
        return true;
    });
    return { agents: opts.includeDisabled ? [...enabledAgents, ...disabledAgents] : enabledAgents, diagnostics };
}
