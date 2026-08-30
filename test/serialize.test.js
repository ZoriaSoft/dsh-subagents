/** dsh-subagents — serializer round-trip tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDefinition, serializeDefinition } from '../lib/definitions.js';

const DEFS = [
    {
        name: 'reviewer',
        description: 'Reviews code for bugs.',
        model: 'bai/glm-5.3-flash',
        background: false,
        color: '#d9480f',
        tools: ['bash', 'read'],
        body: 'You are a reviewer.',
    },
    {
        name: 'translator',
        description: 'Translates texts.\nSecond line of description.',
        cli: 'cmdc',
        cliModel: 'glm-5.3',
        cliEffort: 'high',
        body: 'Translate exactly.',
    },
    {
        name: 'researcher',
        description: 'Looks things up.',
        body: 'Research with evidence.',
    },
    {
        name: 'security-auditor',
        description: 'Audits code.',
        model: 'bai/glm-5.3-flash',
        background: true,
        disallowedTools: ['write', 'edit'],
        skills: ['subagent-ground-rules', 'security-review-checklist'],
        body: 'You are an auditor.',
    },
    {
        name: 'minimal',
        description: 'd',
        body: 'b',
    },
];

test('serialize → parse round-trips every field', () => {
    for (const def of DEFS) {
        const text = serializeDefinition(def);
        const { def: back, diagnostics } = parseDefinition(`${def.name}.md`, text);
        assert.notEqual(back, null, `parse failed: ${diagnostics.join('; ')}`);
        assert.equal(back.name, def.name);
        assert.equal(back.description, def.description);
        assert.equal(back.model, def.model);
        assert.equal(back.cli, def.cli);
        assert.equal(back.cliModel, def.cliModel);
        assert.equal(back.cliEffort, def.cliEffort);
        assert.equal(back.background, def.background);
        assert.deepEqual(back.tools, def.tools);
        assert.deepEqual(back.disallowedTools, def.disallowedTools);
        assert.deepEqual(back.skills, def.skills);
        assert.equal(back.body, def.body);
    }
});

test('skills and disallowedTools serialize as inline lists', () => {
    const text = serializeDefinition(DEFS[3]);
    assert.match(text, /^skills: \[subagent-ground-rules, security-review-checklist\]$/m);
    assert.match(text, /^disallowedTools: \[write, edit\]$/m);
});

test('single-line description stays inline', () => {
    assert.match(serializeDefinition(DEFS[0]), /^description: Reviews code for bugs\.$/m);
});

test('multiline description becomes a literal block', () => {
    assert.match(serializeDefinition(DEFS[1]), /^description: \|$/m);
    assert.match(serializeDefinition(DEFS[1]), /^  Second line of description\.$/m);
});

test('color is quoted so the # is preserved', () => {
    assert.match(serializeDefinition(DEFS[0]), /^color: "#d9480f"$/m);
});

test('cliModel and cliEffort serialize next to cli', () => {
    const text = serializeDefinition(DEFS[1]);
    assert.match(text, /^cli: cmdc$/m);
    assert.match(text, /^cliModel: glm-5.3$/m);
    assert.match(text, /^cliEffort: high$/m);
});

test('background serializes for model-backed roles too', () => {
    assert.match(serializeDefinition(DEFS[0]), /^background: false$/m);
    assert.match(serializeDefinition(DEFS[3]), /^background: true$/m);
});
