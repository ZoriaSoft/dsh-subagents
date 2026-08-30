/** dsh-subagents — roster integrity: every example role parses, and every
 * skill referenced by a role exists under skills/. Keeps the bundled roster
 * honest against the bundled skills in CI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefinitions, parseDefinition } from '../lib/definitions.js';
import { loadSkillBodies, SKILL_NAME_RE } from '../lib/skills.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ROLES_DIR = join(ROOT, 'examples');
const SKILLS_DIR = join(ROOT, 'skills');

test('every example role parses with no diagnostics and valid skills names', async () => {
    const { agents, diagnostics } = await loadDefinitions(ROLES_DIR, { includeDisabled: true });
    assert.equal(agents.length, 9, `expected 9 bundled roles, got ${agents.length}`);
    assert.deepEqual(diagnostics, [], `unexpected diagnostics:\n${diagnostics.join('\n')}`);
    for (const def of agents) {
        assert.ok(def.description.length > 20, `${def.file}: description too short`);
        assert.ok(def.body.length > 20, `${def.file}: body too short`);
        for (const s of def.skills ?? [])
            assert.ok(SKILL_NAME_RE.test(s), `${def.file}: bad skill name "${s}"`);
        // Route sanity: model and cli never together (inherit = neither).
        assert.ok(!(def.model !== undefined && def.cli !== undefined), `${def.file}: model and cli are mutually exclusive`);
    }
});

test('every role-referenced skill resolves under skills/', async () => {
    const { agents } = await loadDefinitions(ROLES_DIR, { includeDisabled: true });
    const wanted = [...new Set(agents.flatMap((d) => d.skills ?? []))];
    assert.ok(wanted.length >= 5, `expected several skill references, got ${wanted.length}`);
    const { missing } = await loadSkillBodies([SKILLS_DIR], wanted);
    assert.deepEqual(missing, [], `skills referenced by roles but missing from bundle: ${missing.join(', ')}`);
});

test('every bundled skill file parses and has a non-empty body', async () => {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory() && !entry.name.endsWith('.md')) continue;
        const path = entry.isDirectory() ? join(SKILLS_DIR, entry.name, 'SKILL.md') : join(SKILLS_DIR, entry.name);
        const text = await readFile(path, 'utf8');
        const { def, diagnostics } = parseDefinition(entry.name, text);
        assert.ok(def, `${path}: failed to parse — ${diagnostics.join('; ')}`);
        assert.ok(def.body.length > 30, `${path}: skill body too short`);
    }
});
