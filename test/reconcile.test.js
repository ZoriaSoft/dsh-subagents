/** dsh-subagents — reconciliation unit tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../lib/reconcile.js';

const def = (slug) => ({ slug, name: slug });

test('new definitions get registered', () => {
    const out = reconcile(new Map(), new Map([['a', def('a')]]), () => false);
    assert.deepEqual(out.unregister, []);
    assert.deepEqual(out.register.map((d) => d.slug), ['a']);
});

test('removed definitions get unregistered', () => {
    const out = reconcile(new Map([['a', def('a')]]), new Map(), () => true);
    assert.deepEqual(out.unregister.map((d) => d.slug), ['a']);
    assert.deepEqual(out.register, []);
});

test('same content under a new object identity is left alone (signature compare)', () => {
    // loadDefinitions() mints fresh objects on every scan; equal content must
    // not churn registrations. Only a content change re-registers.
    const out = reconcile(new Map([['a', def('a')]]), new Map([['a', def('a')]]), () => true);
    assert.deepEqual(out.unregister, []);
    assert.deepEqual(out.register, []);
});

test('changed content is re-registered', () => {
    const edited = { ...def('a'), description: 'new description' };
    const out = reconcile(new Map([['a', def('a')]]), new Map([['a', edited]]), () => true);
    assert.deepEqual(out.unregister.map((d) => d.slug), ['a']);
    assert.deepEqual(out.register.map((d) => d.slug), ['a']);
});

test('unchanged and visible definition is left alone', () => {
    const a = def('a');
    const out = reconcile(new Map([['a', a]]), new Map([['a', a]]), () => true);
    assert.deepEqual(out.unregister, []);
    assert.deepEqual(out.register, []);
});

test('unchanged but rolled-back registration is re-made', () => {
    const a = def('a');
    const out = reconcile(new Map([['a', a]]), new Map([['a', a]]), () => false);
    // The old registration is already gone from the registry (that is why it
    // is not visible); disposing its stale disposer is a harmless no-op, and
    // the uniform unregister+register path keeps both cases identical.
    assert.deepEqual(out.unregister.map((d) => d.slug), ['a']);
    assert.deepEqual(out.register.map((d) => d.slug), ['a']);
});

test('mixed set handles all four cases at once', () => {
    const keep = def('keep');
    const editOld = def('edit');
    const editNew = { ...def('edit'), body: 'changed' };
    const out = reconcile(new Map([['keep', keep], ['edit', editOld], ['gone', def('gone')]]), new Map([['keep', keep], ['edit', editNew], ['added', def('added')]]), (name) => name === 'agent_keep');
    assert.deepEqual(out.unregister.map((d) => d.slug).sort(), ['edit', 'gone']);
    assert.deepEqual(out.register.map((d) => d.slug).sort(), ['added', 'edit']);
});
