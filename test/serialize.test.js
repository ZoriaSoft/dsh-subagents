/** dsh-subagents — serializer round-trip tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDefinition, serializeDefinition } from '../lib/definitions.js';
import { sanitizeToolFilter } from '../lib/runner.js';

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
        cli: 'agy',
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
    assert.match(text, /^cli: agy$/m);
    assert.match(text, /^cliModel: glm-5.3$/m);
    assert.match(text, /^cliEffort: high$/m);
});

test('background serializes for model-backed roles too', () => {
    assert.match(serializeDefinition(DEFS[0]), /^background: false$/m);
    assert.match(serializeDefinition(DEFS[3]), /^background: true$/m);
});

test('description starting with [ is quoted and round-trips as a scalar', () => {
    const def = { name: 'wip', description: '[WIP] review', body: 'Review it.' };
    const text = serializeDefinition(def);
    assert.match(text, /^description: "\[WIP\] review"$/m);
    const { def: back, diagnostics } = parseDefinition('wip.md', text);
    assert.notEqual(back, null, diagnostics.join('; '));
    assert.equal(back.description, '[WIP] review');
});

test('hand-written quoted [WIP] description parses as scalar, not a list', () => {
    const text = '---\nname: wip\ndescription: "[WIP] review"\n---\n\nBody.\n';
    const { def, diagnostics } = parseDefinition('wip.md', text);
    assert.notEqual(def, null, diagnostics.join('; '));
    assert.equal(def.description, '[WIP] review');
});

test('description with quotes and colon round-trips', () => {
    const descriptions = [
        'He said "hi": review carefully',
        "It's ready: check the 'final' pass",
        'Review: "quoted" and: colon',
    ];
    for (const description of descriptions) {
        const def = { name: 'quoted', description, body: 'Body.' };
        const text = serializeDefinition(def);
        const { def: back, diagnostics } = parseDefinition('quoted.md', text);
        assert.notEqual(back, null, diagnostics.join('; '));
        assert.equal(back.description, description);
    }
});

test('multiline description with brackets, quotes and colons round-trips', () => {
    const description = '[WIP] first: "draft"\nSecond line: still draft\nThird \'line\' here';
    const def = { name: 'multi', description, body: 'Body.' };
    const text = serializeDefinition(def);
    assert.match(text, /^description: \|$/m);
    const { def: back, diagnostics } = parseDefinition('multi.md', text);
    assert.notEqual(back, null, diagnostics.join('; '));
    assert.equal(back.description, description);
});

test('explicit empty tools list stays empty (never becomes filterless)', () => {
    const def = { name: 'locked', description: 'No tools.', tools: [], body: 'Body.' };
    const text = serializeDefinition(def);
    assert.match(text, /^tools: \[\]$/m);
    const { def: back } = parseDefinition('locked.md', text);
    assert.notEqual(back, null);
    assert.deepEqual(back.tools, []);
    assert.notEqual(back.tools, undefined);
    const ctx = { tools: { view: () => ({ knownNames: new Set(['read', 'write', 'edit']) }) } };
    assert.throws(() => sanitizeToolFilter(ctx, back, {}), /matches no registered tool/);
});

test('restricted role keeps its tool restrictions across an unrelated edit', () => {
    const original = {
        name: 'auditor',
        description: 'Audits code.',
        model: 'bai/glm-5.3-flash',
        disallowedTools: ['write', 'edit'],
        tools: undefined,
        body: 'You are an auditor.',
    };
    const first = serializeDefinition(original);
    const { def: loaded } = parseDefinition('auditor.md', first);
    assert.notEqual(loaded, null);
    // Simulate an editor save that only touches description/body but
    // carries the loaded restrictions back (client load → show → send).
    const edited = { ...loaded, description: 'Audits code thoroughly.', body: 'You are a thorough auditor.' };
    const second = serializeDefinition(edited);
    const { def: back } = parseDefinition('auditor.md', second);
    assert.notEqual(back, null);
    assert.equal(back.description, 'Audits code thoroughly.');
    assert.deepEqual(back.disallowedTools, ['write', 'edit']);
    assert.equal(back.tools, undefined);
    const ctx = { tools: { view: () => ({ knownNames: new Set(['read', 'write', 'edit', 'grep']) }) } };
    assert.deepEqual(sanitizeToolFilter(ctx, back, {}), { deny: ['write', 'edit'] });
});

test('allow-listed role keeps its tools across an unrelated edit', () => {
    const original = { name: 'reader', description: 'Reads only.', model: 'bai/glm-5.3-flash', tools: ['read', 'grep'], body: 'Read.' };
    const { def: loaded } = parseDefinition('reader.md', serializeDefinition(original));
    assert.notEqual(loaded, null);
    const edited = { ...loaded, body: 'Read carefully.' };
    const { def: back } = parseDefinition('reader.md', serializeDefinition(edited));
    assert.notEqual(back, null);
    assert.deepEqual(back.tools, ['read', 'grep']);
    const ctx = { tools: { view: () => ({ knownNames: new Set(['read', 'write', 'edit', 'grep']) }) } };
    assert.deepEqual(sanitizeToolFilter(ctx, back, {}), { allow: ['read', 'grep'] });
});
