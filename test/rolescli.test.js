/** dsh-subagents — bin/dsh-roles.mjs pure-helper tests (arg parsing, row shaping). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, roleRows } from '../bin/dsh-roles.mjs';

test('list parses with optional flags', () => {
    assert.equal(parseArgs(['list']).cmd, 'list');
    assert.equal(parseArgs(['list', '--json']).json, true);
    const withDir = parseArgs(['list', '--agents-dir', '/tmp/a']);
    assert.equal(withDir.cmd, 'list');
    assert.equal(withDir.agentsDir, '/tmp/a');
});

test('run parses slug, task and every option', () => {
    const a = parseArgs([
        'run', 'code-reviewer', 'review the diff',
        '--cwd', '/home/workspace', '--timeout-ms', '900000', '--max-chars', '5000',
        '--cli-model', 'glm', '--cli-effort', 'high',
        '--skills-dir', '/x', '--skills-dir', '/y',
    ]);
    assert.equal(a.cmd, 'run');
    assert.equal(a.slug, 'code-reviewer');
    assert.equal(a.task, 'review the diff');
    assert.equal(a.cwd, '/home/workspace');
    assert.equal(a.timeoutMs, 900000);
    assert.equal(a.maxChars, 5000);
    assert.equal(a.cliModel, 'glm');
    assert.equal(a.cliEffort, 'high');
    assert.deepEqual(a.skillsDirs, ['/x', '/y']);
});

test('unquoted extra positionals are an error, not silent truncation', () => {
    const a = parseArgs(['run', 'r', 'one', 'two']);
    assert.equal(a.cmd, 'run');
    assert.equal(a.slug, 'r');
    assert.equal(a.task, 'one');
    assert.ok(a.errors.some((e) => e.includes('two')));
});

test('bad values and unknown flags are reported', () => {
    assert.ok(parseArgs(['run', 'r', 't', '--timeout-ms', 'abc']).errors[0].includes('positive integer'));
    assert.ok(parseArgs(['run', 'r', 't', '--max-chars', '0']).errors[0].includes('positive integer'));
    assert.ok(parseArgs(['run', 'r', 't', '--nope']).errors[0].includes('unknown flag'));
    assert.ok(parseArgs(['run', 'r', 't', '--cwd']).errors[0].includes('needs a value'));
    assert.ok(parseArgs(['frobnicate']).errors[0].includes('unknown command'));
});

test('run without slug+task is an error; --help wins anywhere', () => {
    assert.ok(parseArgs(['run', 'r']).errors.some((e) => e.includes('needs <slug>')));
    assert.equal(parseArgs(['run', 'r', 't', '--help']).cmd, 'help');
    assert.equal(parseArgs([]).cmd, 'help');
});

test('roleRows summarize cli-backed and model-backed roles', () => {
    const rows = roleRows([
        { slug: 'code-reviewer', name: 'Code Reviewer', cli: 'agy', cliModel: 'gemini-3.7-flash-medium', description: 'review diffs' },
        { slug: 'ghost', name: 'Ghost', model: 'bai/glm-5.3-flash', description: 'model-backed\nsecond line ignored' },
    ]);
    assert.deepEqual(rows[0], { slug: 'code-reviewer', name: 'Code Reviewer', cli: 'agy', route: 'gemini-3.7-flash-medium', description: 'review diffs' });
    assert.equal(rows[1].cli, '(model)');
    assert.equal(rows[1].route, 'bai/glm-5.3-flash');
    assert.equal(rows[1].description, 'model-backed');
});
