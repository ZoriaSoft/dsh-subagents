/** dsh-subagents — role skill loader unit tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSkillBodies, SKILL_NAME_RE } from '../lib/skills.js';

test('loads a bundled skill (name/SKILL.md) and strips frontmatter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-subskills-'));
    try {
        await mkdir(join(dir, 'my-skill'));
        await writeFile(join(dir, 'my-skill', 'SKILL.md'), '---\nname: my-skill\ndescription: d\n---\n\nBody line one.\nLine two.\n', 'utf8');
        const { bodies, missing } = await loadSkillBodies([dir], ['my-skill']);
        assert.deepEqual(missing, []);
        assert.equal(bodies.length, 1);
        assert.equal(bodies[0].name, 'my-skill');
        assert.equal(bodies[0].content, 'Body line one.\nLine two.');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('loads a flat skill (name.md) without frontmatter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-subskills-'));
    try {
        await writeFile(join(dir, 'flat.md'), 'Just instructions.\n', 'utf8');
        const { bodies, missing } = await loadSkillBodies([dir], ['flat']);
        assert.deepEqual(missing, []);
        assert.equal(bodies[0].content, 'Just instructions.');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('user dir wins over the later (bundled) dir', async () => {
    const user = await mkdtemp(join(tmpdir(), 'dsh-subskills-user-'));
    const bundled = await mkdtemp(join(tmpdir(), 'dsh-subskills-bundled-'));
    try {
        await writeFile(join(user, 'proto.md'), 'USER VERSION', 'utf8');
        await mkdir(join(bundled, 'proto'));
        await writeFile(join(bundled, 'proto', 'SKILL.md'), 'BUNDLED VERSION', 'utf8');
        const { bodies } = await loadSkillBodies([user, bundled], ['proto']);
        assert.equal(bodies[0].content, 'USER VERSION');
    }
    finally {
        await Promise.all([rm(user, { recursive: true, force: true }), rm(bundled, { recursive: true, force: true })]);
    }
});

test('unknown, invalid and empty skills are reported missing, never fatal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-subskills-'));
    try {
        await writeFile(join(dir, 'empty.md'), '---\nname: empty\ndescription: d\n---\n', 'utf8');
        const { bodies, missing } = await loadSkillBodies([dir], ['nope', 'Bad_Name', 'empty']);
        assert.deepEqual(bodies, []);
        assert.deepEqual(missing, ['nope', 'Bad_Name', 'empty']);
        // Invalid names are rejected by the grammar, not the filesystem.
        assert.equal(SKILL_NAME_RE.test('Bad_Name'), false);
        assert.equal(SKILL_NAME_RE.test('good-name-2'), true);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('no names / no dirs → empty result', async () => {
    const a = await loadSkillBodies(['/nonexistent'], []);
    assert.deepEqual(a, { bodies: [], missing: [] });
    const b = await loadSkillBodies([], ['x-skill']);
    assert.deepEqual(b.missing, ['x-skill']);
});
