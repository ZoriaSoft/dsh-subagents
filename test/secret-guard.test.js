/** dsh-subagents — secret-guard hook must never print the matched secret. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HOOK = fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url));
// Synthetic only, assembled in parts so this test file itself never
// contains a token-shaped literal.
const SYNTHETIC = 'gh' + 'p_' + 'A'.repeat(24);

async function stagedRepo(files) {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-guard-'));
    await run('git', ['init', '-q'], { cwd: dir });
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(dir, name), content, 'utf8');
    }
    await run('git', ['add', '.'], { cwd: dir });
    return dir;
}

async function runHook(dir) {
    try {
        const { stdout, stderr } = await run('sh', [HOOK], { cwd: dir });
        return { code: 0, out: stdout + stderr };
    } catch (err) {
        return { code: err.code ?? 1, out: String(err.stdout ?? '') + String(err.stderr ?? '') };
    }
}

test('hook blocks a staged synthetic token without printing it', async () => {
    const dir = await stagedRepo({ 'leak.txt': `clean line\nconst k = "${SYNTHETIC}";\n` });
    try {
        const { code, out } = await runHook(dir);
        assert.equal(code, 1);
        assert.match(out, /leak\.txt:2 rule=github-token/);
        assert.ok(!out.includes(SYNTHETIC), 'hook output must not contain the synthetic token');
        assert.ok(!out.includes('A'.repeat(24)), 'hook output must not contain the token body');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('hook passes clean staged content', async () => {
    const dir = await stagedRepo({ 'clean.txt': 'nothing sensitive here\n' });
    try {
        const { code } = await runHook(dir);
        assert.equal(code, 0);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
