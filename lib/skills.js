/**
 * dsh-subagents — role skill loading.
 *
 * A definition may name skills (`skills: [code-review-checklist, …]`).
 * Unlike dsh session skills (loaded at the model's discretion through the
 * `skill` tool), role skills are resolved HERE, at spawn time, and inlined
 * into the child's persona. That is deliberate: roles often run on cheap
 * models that cannot be trusted to call the `skill` tool before acting, and
 * the primary agent should not have to remind them. Deterministic preload,
 * zero prompt pollution for the calling session.
 *
 * Skill files are plain Markdown, optionally with the same frontmatter
 * shape as dsh skills (frontmatter is parsed and stripped; the body is the
 * instructions). Resolution order: user override dir first, then the
 * plugin-bundled `skills/` directory — so a user can override a bundled
 * skill without touching the plugin install.
 *
 * Directories here are NOT scanned by @deepseek-ai/dsh-skill-filesystem,
 * so role skills never pollute the session's <available_skills> catalog.
 *
 * @module dsh-subagents/skills
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter } from './definitions.js';

/** Kebab-case skill names, matching dsh's own grammar. */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Candidate file layouts for one skill name, in order. */
const CANDIDATES = (dir, name) => [join(dir, name, 'SKILL.md'), join(dir, `${name}.md`)];

/**
 * Resolve the instruction bodies for the named skills.
 * Pure filesystem reads — no caches, no watchers. Roles spawn rarely and
 * skill files are tiny, so every spawn reads the live files: editing a
 * skill body applies to the very next spawn without any re-registration.
 *
 * @param {string[]} dirs skill directories in precedence order (first wins)
 * @param {string[]} names skill names requested by a definition
 * @returns {Promise<{ bodies: { name: string, content: string }[], missing: string[] }>}
 *          `missing` lists names that resolved nowhere (unknown name, no
 *          file, or an empty body) so callers can surface a diagnostic.
 */
export async function loadSkillBodies(dirs, names) {
    const bodies = [];
    const missing = [];
    for (const raw of names ?? []) {
        const name = String(raw);
        if (!SKILL_NAME_RE.test(name)) {
            missing.push(name);
            continue;
        }
        let text = null;
        for (const dir of dirs ?? []) {
            for (const candidate of CANDIDATES(dir, name)) {
                try {
                    text = await readFile(candidate, 'utf8');
                    break;
                }
                catch { /* try the next layout/directory */ }
            }
            if (text !== null)
                break;
        }
        const parsed = text === null ? null : parseFrontmatter(text);
        const content = (parsed === null ? text ?? '' : parsed.body).trim();
        if (content === '') {
            missing.push(name);
            continue;
        }
        bodies.push({ name, content });
    }
    return { bodies, missing };
}
