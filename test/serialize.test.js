/** dsh-subagents — serializer round-trip tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDefinition, serializeDefinition } from '../lib/definitions.js';

const DEFS = [
    {
        name: 'reviewer',
        description: 'Reviews code for bugs.',
        model: 'bai/glm-5.3-flash',
        color: '#d9480f',
        tools: ['bash', 'read'],
        body: 'You are a reviewer.',
    },
    {
        name: 'translator',
        description: 'Translates texts.\nSecond line of description.',
        cli: 'cmdc',
        body: 'Translate exactly.',
    },
    {
        name: 'researcher',
        description: 'Looks things up.',
        body: 'Research with evidence.',
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
        assert.equal(back, null, `parse failed: ${diagnostics.join('; ')}`);
        assert.equal(back.name, def.name);
        assert.equal(back.description, def.description);
        assert.equal(back.model, def.model);
        assert.equal(back.cli, def.cli);
        assert.deepEqual(back.tools, def.tools);
        assert.deepEqual(back.disallowedTools, def.disallowedTools);
        assert.equal(back.body, def.body);
    }
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
