/** dsh-subagents — runner unit tests (argv map, sanitization, output shaping). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLI_RUNNERS, messageText, parseRoute, personaText, sanitizeToolFilter } from '../lib/runner.js';

test('cli argv map uses verified headless flags', () => {
    assert.deepEqual(CLI_RUNNERS.cmdc('p'), ['cmdc', '--no-session', '-p', 'p']);
    assert.deepEqual(CLI_RUNNERS.pi('p'), ['pi', '--no-session', '-p', 'p']);
    assert.deepEqual(CLI_RUNNERS.agy('p'), ['agy', '--disable-slash-commands', '-p', 'p']);
    assert.deepEqual(CLI_RUNNERS.claude('p'), ['claude', '-p', 'p']);
    // dsh headless takes the task positionally — no -p
    assert.deepEqual(CLI_RUNNERS.dsh('p'), ['dsh', '--profile', 'headless', 'p']);
});

test('prompt is a single argv element (no shell, no injection surface)', () => {
    const evil = 'x"; rm -rf /; echo "';
    for (const build of Object.values(CLI_RUNNERS)) {
        const argv = build(evil);
        assert.equal(argv.filter((a) => a === evil).length, 1);
    }
});

test('messageText flattens content blocks', () => {
    assert.equal(messageText('plain'), 'plain');
    assert.equal(messageText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
    assert.equal(messageText([{ type: 'other' }]), '');
    assert.equal(messageText(undefined), '');
});

test('parseRoute splits on the first slash', () => {
    assert.deepEqual(parseRoute('bai/glm-5.3-flash'), { provider: 'bai', model: 'glm-5.3-flash' });
});

test('personaText frames the definition body', () => {
    const p = personaText({ name: 'reviewer', body: 'Be strict.' });
    assert.ok(p.includes('"reviewer"'));
    assert.ok(p.includes('Be strict.'));
});

test('sanitizeToolFilter drops unknown names and keeps known ones', () => {
    const warns = [];
    const ctx = {
        tools: { view: () => ({ knownNames: ['bash', 'read', 'grep'] }) },
        logger: { warn: (m) => warns.push(m) },
    };
    const out = sanitizeToolFilter(ctx, { name: 'r', tools: ['bash', 'nope'] });
    assert.deepEqual(out, { allow: ['bash'] });
    assert.ok(warns.some((w) => w.includes('nope')));
});

test('empty allow-list after sanitization fails loudly', () => {
    const ctx = { tools: { view: () => ({ knownNames: ['bash'] }) }, logger: { warn: () => { } } };
    assert.throws(() => sanitizeToolFilter(ctx, { name: 'r', tools: ['nope'] }), /matches no registered tool/);
});

test('no filter fields → undefined', () => {
    const ctx = { tools: { view: () => ({ knownNames: [] }) }, logger: { warn: () => { } } };
    assert.equal(sanitizeToolFilter(ctx, { name: 'r' }), undefined);
});
