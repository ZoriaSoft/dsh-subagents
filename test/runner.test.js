/** dsh-subagents — runner unit tests (argv map, sanitization, output shaping). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCliArgv, isEffortUnsupportedError, messageText, parseRoute, personaText, sanitizeToolFilter, resolveRunMode, runModelForeground, runModelBackground, Semaphore } from '../lib/runner.js';

test('cli argv uses verified headless flags', () => {
    assert.deepEqual(buildCliArgv('cmdc', 'p'), ['cmdc', '--no-session', '-p', 'p']);
    assert.deepEqual(buildCliArgv('pi', 'p'), ['pi', '--no-session', '-p', 'p']);
    assert.deepEqual(buildCliArgv('agy', 'p'), ['agy', '--disable-slash-commands', '-p', 'p']);
    assert.deepEqual(buildCliArgv('claude', 'p'), ['claude', '-p', 'p']);
    // dsh headless takes the task positionally — no -p
    assert.deepEqual(buildCliArgv('dsh', 'p'), ['dsh', '--profile', 'headless', 'p']);
    // vibe's default output mode blocks on a non-tty stdout pipe — text is pinned in the base argv
    assert.deepEqual(buildCliArgv('vibe', 'p'), ['vibe', '--auto-approve', '--output', 'text', '-p', 'p']);
});

test('system prompt becomes --append-system-prompt where supported', () => {
    assert.deepEqual(buildCliArgv('pi', 'p', 'ROLE'), ['pi', '--no-session', '--append-system-prompt', 'ROLE', '-p', 'p']);
    assert.deepEqual(buildCliArgv('claude', 'p', 'ROLE'), ['claude', '--append-system-prompt', 'ROLE', '-p', 'p']);
});

test('unsupported CLIs get the role embedded into the task', () => {
    assert.deepEqual(buildCliArgv('cmdc', 'p', 'ROLE'), ['cmdc', '--no-session', '-p', '[Role instructions]\nROLE\n\n[Task]\np']);
    assert.deepEqual(buildCliArgv('agy', 'p', 'ROLE'), ['agy', '--disable-slash-commands', '-p', '[Role instructions]\nROLE\n\n[Task]\np']);
    assert.deepEqual(buildCliArgv('vibe', 'p', 'ROLE'), ['vibe', '--auto-approve', '--output', 'text', '-p', '[Role instructions]\nROLE\n\n[Task]\np']);
});

test('dsh headless ignores an undeliverable system prompt', () => {
    assert.deepEqual(buildCliArgv('dsh', 'p', 'ROLE'), ['dsh', '--profile', 'headless', 'p']);
});

test('cliModel is passed through the CLI model flag', () => {
    assert.deepEqual(buildCliArgv('agy', 'p', undefined, 'gemini-2.5-flash'),
        ['agy', '--disable-slash-commands', '--model', 'gemini-2.5-flash', '-p', 'p']);
    assert.deepEqual(buildCliArgv('cmdc', 'p', undefined, 'minimax/minimax-m3-free'),
        ['cmdc', '--no-session', '--model', 'minimax/minimax-m3-free', '-p', 'p']);
    assert.deepEqual(buildCliArgv('pi', 'p', undefined, 'glm-5.3'),
        ['pi', '--no-session', '--model', 'glm-5.3', '-p', 'p']);
    assert.deepEqual(buildCliArgv('claude', 'p', undefined, 'sonnet'),
        ['claude', '--model', 'sonnet', '-p', 'p']);
    assert.deepEqual(buildCliArgv('vibe', 'p', undefined, 'glm'),
        ['vibe', '--auto-approve', '--output', 'text', '--agent', 'glm', '-p', 'p']);
});

test('dsh headless ignores a cliModel it cannot deliver', () => {
    assert.deepEqual(buildCliArgv('dsh', 'p', undefined, 'x'), ['dsh', '--profile', 'headless', 'p']);
});

test('empty cliModel adds no flag', () => {
    assert.deepEqual(buildCliArgv('agy', 'p', undefined, ''), ['agy', '--disable-slash-commands', '-p', 'p']);
});

test('cliEffort is passed through the CLI effort flag', () => {
    assert.deepEqual(buildCliArgv('agy', 'p', undefined, 'gemini-2.5-flash', 'high'),
        ['agy', '--disable-slash-commands', '--model', 'gemini-2.5-flash', '--effort', 'high', '-p', 'p']);
    assert.deepEqual(buildCliArgv('cmdc', 'p', undefined, undefined, 'medium'),
        ['cmdc', '--no-session', '--effort', 'medium', '-p', 'p']);
    assert.deepEqual(buildCliArgv('pi', 'p', undefined, 'bai/glm-5.3-flash', 'xhigh'),
        ['pi', '--no-session', '--model', 'bai/glm-5.3-flash', '--thinking', 'xhigh', '-p', 'p']);
    assert.deepEqual(buildCliArgv('claude', 'p', undefined, 'sonnet', 'max'),
        ['claude', '--model', 'sonnet', '--effort', 'max', '-p', 'p']);
});

test('dsh headless ignores a cliEffort it cannot deliver', () => {
    assert.deepEqual(buildCliArgv('dsh', 'p', undefined, undefined, 'high'),
        ['dsh', '--profile', 'headless', 'p']);
});

test('vibe has no effort flag to deliver', () => {
    assert.deepEqual(buildCliArgv('vibe', 'p', undefined, undefined, 'high'),
        ['vibe', '--auto-approve', '--output', 'text', '-p', 'p']);
});

test('devin base argv: dangerous mode + workspace-trust bypass, role embedded', () => {
    assert.deepEqual(buildCliArgv('devin', 'task', 'role body', undefined, undefined),
        ['devin', '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false', '-p', '[Role instructions]\nrole body\n\n[Task]\ntask']);
});

test('devin model flag passes through after the base argv', () => {
    assert.deepEqual(buildCliArgv('devin', 'task', undefined, 'opus', undefined),
        ['devin', '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false', '--model', 'opus', '-p', 'task']);
});

test('devin effort composes into the model id', () => {
    // opus + high → opus-high (no --effort flag; devin 3000.10.31)
    assert.deepEqual(buildCliArgv('devin', 'task', undefined, 'opus', 'high'),
        ['devin', '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false', '--model', 'opus-high', '-p', 'task']);
    // already carrying the same level: used unchanged, no double suffix
    assert.deepEqual(buildCliArgv('devin', 'task', undefined, 'opus-high', 'high'),
        ['devin', '--permission-mode', 'dangerous', '--respect-workspace-trust', 'false', '--model', 'opus-high', '-p', 'task']);
    // already carrying a different level: loud failure
    assert.throws(() => buildCliArgv('devin', 'task', undefined, 'swe-2-high', 'low'), /already carries an effort level/);
    // effort without a model cannot compose
    assert.throws(() => buildCliArgv('devin', 'task', undefined, undefined, 'high'), /cliEffort requires cliModel/);
});

test('empty cliEffort adds no flag', () => {
    assert.deepEqual(buildCliArgv('agy', 'p', undefined, 'gemini-2.5-flash', ''),
        ['agy', '--disable-slash-commands', '--model', 'gemini-2.5-flash', '-p', 'p']);
});

test('isEffortUnsupportedError matches the thinking-model rejection, nothing else', () => {
    // Real agy shape: exit-1 with the rejection on stderr.
    const agyRejection = { code: 1, stderr: 'Error: invalid model selection (--model "claude-opus-4-6-thinking" --effort "medium"): --effort is not supported for model "claude-opus-4-6-thinking"' };
    assert.equal(isEffortUnsupportedError(agyRejection), true);
    assert.equal(isEffortUnsupportedError(new Error('--effort is not supported for model "x"')), true);
    assert.equal(isEffortUnsupportedError({ code: 1, stderr: 'Error: model not found' }), false);
    assert.equal(isEffortUnsupportedError(undefined), false);
    assert.equal(isEffortUnsupportedError(''), false);
});

test('resolveRunMode precedence: args > frontmatter > default', () => {
    const modelRole = { name: 'a' };                     // model-backed
    const cliRole = { name: 'a', cli: 'agy' };           // CLI-backed
    const optOut = { name: 'a', background: false };     // model-backed, opt-out
    const optIn = { name: 'a', background: true };
    // explicit argument wins
    assert.equal(resolveRunMode(modelRole, { run_in_background: true }), 'background');
    assert.equal(resolveRunMode(optIn, { run_in_background: false }), 'foreground');
    // frontmatter next
    assert.equal(resolveRunMode(optOut, {}), 'foreground');
    assert.equal(resolveRunMode(optIn, {}), 'background');
    // default: model-backed background, CLI always foreground
    assert.equal(resolveRunMode(modelRole, {}), 'background');
    assert.equal(resolveRunMode(cliRole, {}), 'foreground');
    assert.equal(resolveRunMode(cliRole, { run_in_background: true }), 'foreground');
});

test('unknown cli fails loudly', () => {
    assert.throws(() => buildCliArgv('nope', 'p'), /unknown cli/);
});

test('prompt is a single argv element (no shell, no injection surface)', () => {
    const evil = 'x"; rm -rf /; echo "';
    for (const cli of ['cmdc', 'pi', 'agy', 'claude', 'dsh', 'vibe', 'devin']) {
        const argv = buildCliArgv(cli, evil, undefined);
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

test('no filter fields → undefined without consulting the registry', () => {
    const ctx = { tools: { view: () => assert.fail('unfiltered roles must not query tools') } };
    assert.equal(sanitizeToolFilter(ctx, { name: 'r' }, { id: 'caller' }), undefined);
});

// DSH 0.1.5-rc.1: native tools live in the caller's scope, not the global view.
for (const globalNames of [[], ['agent_reviewer']]) {
    const globalLabel = globalNames.length === 0 ? 'empty' : 'role-only';
    for (const [mode, runModel] of [['foreground', runModelForeground], ['background', runModelBackground]]) {
        for (const [field, key] of [['tools', 'allow'], ['disallowedTools', 'deny']]) {
            test(`${mode} ${key} uses caller scope with ${globalLabel} global registry`, async () => {
                const agent = { id: 'caller', name: 'caller-name' };
                const scopes = [];
                const warns = [];
                let request;
                const ctx = {
                    tools: {
                        view: (scope) => {
                            scopes.push(scope);
                            return { knownNames: scope === agent ? [...globalNames, 'read', 'bash'] : globalNames };
                        },
                    },
                    logger: { warn: (message) => warns.push(message) },
                    subagents: {
                        start: async (_provider, options) => {
                            request = options;
                            return { id: 'run', result: Promise.resolve({ output: 'done' }), dispose: async () => {} };
                        },
                        startContinuable: async (options) => {
                            request = options.request;
                            return { childId: 'child' };
                        },
                    },
                };
                await runModel(ctx, { name: 'r', [field]: ['read', 'bash', 'unknown_tool'] }, 'task',
                    { agent }, { provider: 'spawn', maxOutputChars: 100 });
                assert.deepEqual(request.toolFilter, { [key]: ['read', 'bash'] });
                assert.equal(scopes.length, 1);
                assert.strictEqual(scopes[0], agent, 'view must receive the actual scope object, not its name or a copy');
                assert.strictEqual(request.parent, agent);
                assert.equal(warns.length, 1);
                assert.match(warns[0], /unknown_tool/);
            });
        }
    }
}

test('scoped sanitization rejects empty and entirely unknown allow-lists', () => {
    const agent = { id: 'caller' };
    const ctx = { tools: { view: (scope) => ({ knownNames: scope === agent ? ['read'] : [] }) } };
    for (const tools of [[], ['unknown_tool']]) {
        assert.throws(() => sanitizeToolFilter(ctx, { name: 'r', tools }, agent), /matches no registered tool/);
    }
});

test('semaphore caps concurrency and releases in order', async () => {
    const sem = new Semaphore(2);
    const order = [];
    const r1 = await sem.acquire();
    const r2 = await sem.acquire();
    let r3ticket = undefined;
    const p3 = sem.acquire().then((r) => { order.push('3'); return r; });
    await new Promise((r) => setTimeout(r, 10));
    r1(); // admit 3
    await p3.then((r) => (r3ticket = r));
    r2();
    r3ticket?.();
    assert.deepEqual(order, ['3']);
    assert.equal(sem.active, 0);
});
