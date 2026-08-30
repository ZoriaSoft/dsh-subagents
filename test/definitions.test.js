/** dsh-subagents — definition loader unit tests (no network, no dsh). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDefinitions, parseDefinition, parseFrontmatter } from '../lib/definitions.js';

const FULL = `---
name: code-reviewer
description: Reviews code for risks.
model: bai/glm-5.3-flash
tools: [bash, read]
color: "#d9480f"
---
You are a meticulous code reviewer.
`;

test('parses scalars, inline lists and the body', () => {
    const { attrs, body } = parseFrontmatter(FULL);
    assert.equal(attrs.name, 'code-reviewer');
    assert.equal(attrs.model, 'bai/glm-5.3-flash');
    assert.deepEqual(attrs.tools, ['bash', 'read']);
    assert.equal(attrs.color, '#d9480f');
    assert.equal(body, 'You are a meticulous code reviewer.');
});

test('block lists with - items accumulate', () => {
    const text = ['---', 'name: x', 'description: d', 'tools:', '  - bash', '  - read', '---', 'body'].join('\n');
    const { attrs } = parseFrontmatter(text);
    assert.deepEqual(attrs.tools, ['bash', 'read']);
});

test('quoted values are unquoted', () => {
    const text = '---\nname: "quoted name"\ndescription: \'single\'\n---\nbody';
    const { attrs } = parseFrontmatter(text);
    assert.equal(attrs.name, 'quoted name');
    assert.equal(attrs.description, 'single');
});

test('no frontmatter block returns null', () => {
    assert.equal(parseFrontmatter('just body'), null);
    assert.equal(parseFrontmatter('---\nunclosed: true\n'), null);
});

test('literal block scalar (|) keeps line breaks', () => {
    const text = ['---', 'name: a', 'description: |', '  line one', '  line two', 'model: bai/x', '---', 'body'].join('\n');
    const { attrs } = parseFrontmatter(text);
    assert.equal(attrs.description, 'line one\nline two');
    assert.equal(attrs.model, 'bai/x');
});

test('folded block scalar (>) joins with spaces', () => {
    const text = ['---', 'name: a', 'description: >', '  line one', '  line two', '---', 'body'].join('\n');
    const { attrs } = parseFrontmatter(text);
    assert.equal(attrs.description, 'line one line two');
});

test('block scalar with chomping indicator and trailing blanks', () => {
    const text = ['---', 'name: a', 'description: |-', '  only line', '', 'model: bai/x', '---', 'body'].join('\n');
    const { attrs } = parseFrontmatter(text);
    assert.equal(attrs.description, 'only line');
    assert.equal(attrs.model, 'bai/x');
});

test('unknown keys are ignored but reported', () => {
    const { def, diagnostics } = parseDefinition('a.md', '---\nname: a\ndescription: d\nthoughtLevel: high\n---\nbody');
    assert.equal(def.name, 'a');
    assert.ok(diagnostics.some((d) => d.includes('thoughtLevel')));
});

test('name and description are required', () => {
    assert.equal(parseDefinition('a.md', '---\ndescription: d\n---\nbody').def, null);
    assert.equal(parseDefinition('a.md', '---\nname: a\n---\nbody').def, null);
});

test('model and cli are mutually exclusive', () => {
    const { def, diagnostics } = parseDefinition('a.md', '---\nname: a\ndescription: d\nmodel: bai/x\ncli: cmdc\n---\nbody');
    assert.equal(def, null);
    assert.ok(diagnostics.some((d) => d.includes('mutually exclusive')));
});

test('model inherit and malformed routes fall back to session model', () => {
    const inherit = parseDefinition('a.md', '---\nname: a\ndescription: d\nmodel: inherit\n---\nbody');
    assert.equal(inherit.def.model, undefined);
    const bad = parseDefinition('a.md', '---\nname: a\ndescription: d\nmodel: just-a-name\n---\nbody');
    assert.equal(bad.def.model, undefined);
    assert.ok(bad.diagnostics.some((d) => d.includes('not provider/model')));
});

test('cliModel rides with cli and is ignored without it', () => {
    const withCli = parseDefinition('a.md', '---\nname: a\ndescription: d\ncli: agy\ncliModel: gemini-2.5-flash\n---\nbody');
    assert.equal(withCli.def.cliModel, 'gemini-2.5-flash');
    const without = parseDefinition('a.md', '---\nname: a\ndescription: d\ncliModel: x\n---\nbody');
    assert.equal(without.def.cliModel, undefined);
    assert.ok(without.diagnostics.some((x) => x.includes('cliModel')));
});

test('cliEffort rides with cli and is ignored without it', () => {
    const withCli = parseDefinition('a.md', '---\nname: a\ndescription: d\ncli: cmdc\ncliEffort: high\n---\nbody');
    assert.equal(withCli.def.cliEffort, 'high');
    const without = parseDefinition('a.md', '---\nname: a\ndescription: d\ncliEffort: high\n---\nbody');
    assert.equal(without.def.cliEffort, undefined);
    assert.ok(without.diagnostics.some((x) => x.includes('cliEffort')));
});

test('slug sanitization rejects empty results', () => {
    const { def } = parseDefinition('a.md', '---\nname: "***"\ndescription: d\n---\nbody');
    assert.equal(def, null);
});

test('skills frontmatter parses as an inline or block list', () => {
    const inline = parseDefinition('a.md', '---\nname: a\ndescription: d\nskills: [one-skill, two-skill]\n---\nbody');
    assert.deepEqual(inline.def.skills, ['one-skill', 'two-skill']);
    const block = parseDefinition('a.md', ['---', 'name: a', 'description: d', 'skills:', '  - one-skill', '  - two-skill', '---', 'body'].join('\n'));
    assert.deepEqual(block.def.skills, ['one-skill', 'two-skill']);
    const none = parseDefinition('a.md', '---\nname: a\ndescription: d\n---\nbody');
    assert.equal(none.def.skills, undefined);
});

test('loadDefinitions skips _disabled files and dedupes by name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-subagents-'));
    try {
        await writeFile(join(dir, 'one.md'), FULL);
        await writeFile(join(dir, '_disabled.md'), FULL.replace('code-reviewer', 'disabled-role'));
        await writeFile(join(dir, 'two.md'), FULL.replace('code-reviewer', 'code-reviewer')); // same name
        await writeFile(join(dir, 'three.md'), '---\nname: cli-role\ndescription: d\ncli: cmdc\n---\nbody');
        const { agents, diagnostics } = await loadDefinitions(dir);
        assert.deepEqual(agents.map((a) => a.slug), ['code-reviewer', 'cli-role']);
        assert.equal(agents[1].cli, 'cmdc');
        assert.ok(diagnostics.some((d) => d.includes('duplicate name')));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
