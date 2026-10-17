/** dsh-subagents — editor transition & create-collision regression tests.
 *
 * The browser bundle (lib/client.js) has no Node test harness, so its
 * wiring is guarded here at the source level, while the file-layer
 * behaviour the server relies on (create must not overwrite, edit of B
 * must not touch A) is exercised for real with serializeDefinition + fs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeDefinition, parseDefinition } from '../lib/definitions.js';

const clientSrc = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8');
const indexSrc = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8');

test('client keys Editor by file identity so A→B remounts clean', () => {
    assert.match(clientSrc, /key: editing === "new" \? "__new__" : editing\.file/);
    assert.match(clientSrc, /prevFileRef/);
    assert.match(clientSrc, /original\?\.file \?\? "__new__"/);
});

test('client guards role switches with an unsaved-changes confirm (A→B, A→New)', () => {
    assert.match(clientSrc, /f\.unsaved\.confirm/);
    assert.match(clientSrc, /requestEditing/);
    assert.match(clientSrc, /onDirtyChange/);
    // Both the row edit and the New actions go through the guard.
    assert.match(clientSrc, /onEdit: \(\) => requestEditing\(r\)/);
    assert.match(clientSrc, /onClick: \(\) => requestEditing\("new"\)/);
});

test('server returns 409 when creating onto an existing file', () => {
    assert.match(indexSrc, /409/);
    assert.match(indexSrc, /role file already exists/);
    assert.match(indexSrc, /flag: 'wx'/);
});

test('file layer: create with wx refuses to overwrite, edit-in-place succeeds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-editor-'));
    try {
        const a = { name: 'alpha', description: 'Role A.', body: 'Body A.' };
        const b = { name: 'beta', description: 'Role B.', body: 'Body B.' };
        await writeFile(join(dir, 'alpha.md'), serializeDefinition(a), 'utf8');
        await writeFile(join(dir, 'beta.md'), serializeDefinition(b), 'utf8');

        // Same-name create (what /save now rejects with 409) must fail at
        // the file layer instead of overwriting alpha.
        await assert.rejects(
            writeFile(join(dir, 'alpha.md'), serializeDefinition({ name: 'alpha', description: 'Hijack.', body: 'Hijack.' }), { encoding: 'utf8', flag: 'wx' }),
            (err) => err?.code === 'EEXIST',
        );
        const afterA = await readFile(join(dir, 'alpha.md'), 'utf8');
        assert.equal(parseDefinition('alpha.md', afterA).def.description, 'Role A.');

        // Editing B in place (file === originalFile) overwrites only B.
        const editedB = { name: 'beta', description: 'Role B edited.', body: 'Body B edited.' };
        await writeFile(join(dir, 'beta.md'), serializeDefinition(editedB), 'utf8');
        assert.equal(parseDefinition('beta.md', await readFile(join(dir, 'beta.md'), 'utf8')).def.description, 'Role B edited.');
        assert.equal(parseDefinition('alpha.md', await readFile(join(dir, 'alpha.md'), 'utf8')).def.description, 'Role A.');
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('A→B identity: serialised B carries B file, never A data', () => {
    const roleA = { name: 'alpha', description: 'Role A.', disallowedTools: ['write'], body: 'Body A.', file: 'alpha.md' };
    const roleB = { name: 'beta', description: 'Role B.', tools: ['read'], body: 'Body B.', file: 'beta.md' };
    const textB = serializeDefinition(roleB);
    const { def: backB } = parseDefinition('beta.md', textB);
    assert.equal(backB.name, 'beta');
    assert.deepEqual(backB.tools, ['read']);
    assert.equal(backB.disallowedTools, undefined);
    // A stays intact and distinct.
    const { def: backA } = parseDefinition('alpha.md', serializeDefinition(roleA));
    assert.deepEqual(backA.disallowedTools, ['write']);
    assert.equal(backA.tools, undefined);
});
