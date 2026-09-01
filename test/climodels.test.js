/** dsh-subagents — CLI model listing parser tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCmdcModels, parsePiModels, parseAgyModels, CLI_EFFORTS, modelsFor } from '../lib/climodels.js';

const CMDC = `Available models  ·  99 models

Open Source

deepseek/deepseek-v4-pro                       hybrid-attention long-context reasoning
deepseek/deepseek-v4-flash                     fast hybrid-attention reasoning (default)
moonshotai/kimi-k3                             long-horizon coding & knowledge work with 1M context

Z.ai

glm-5.3                                        flagship GLM
`;

test('cmdc listing: ids with slash kept, section headers and default marker handled', () => {
    const models = parseCmdcModels(CMDC);
    assert.deepEqual(models.map((m) => m.id), [
        'deepseek/deepseek-v4-pro',
        'deepseek/deepseek-v4-flash',
        'moonshotai/kimi-k3',
        'glm-5.3',
    ]);
    assert.match(models[1].note, /default/);
    assert.equal(models[0].note, 'hybrid-attention long-context reasoning');
});

const PI = `provider  model                                      context  max-out  thinking  images
bai       glm-5.3-flash                              1M       131.1K   yes       yes
ts9       hyper/deepseek-v4-flash-0731               1.0M     131.1K   yes       no
`;

test('pi listing: provider/model route from first two columns, header skipped', () => {
    const models = parsePiModels(PI);
    assert.deepEqual(models.map((m) => m.id), ['bai/glm-5.3-flash', 'ts9/hyper/deepseek-v4-flash-0731']);
});

const AGY = `Fetching available models...
gemini-3.7-flash-high\tGemini 3.7 Flash (High)
gemini-3.6-flash-low\tGemini 3.6 Flash (Low)
`;

test('agy listing: tab-separated ids, fetching line skipped', () => {
    const models = parseAgyModels(AGY);
    assert.deepEqual(models.map((m) => m.id), ['gemini-3.7-flash-high', 'gemini-3.6-flash-low']);
    assert.equal(models[0].note, 'Gemini 3.7 Flash (High)');
});

test('effort flags and levels per CLI', () => {
    assert.equal(CLI_EFFORTS.cmdc.flag, '--effort');
    assert.deepEqual(CLI_EFFORTS.cmdc.levels, ['low', 'medium', 'high']);
    assert.equal(CLI_EFFORTS.pi.flag, '--thinking');
    assert.deepEqual(CLI_EFFORTS.pi.levels, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    assert.deepEqual(CLI_EFFORTS.claude.levels, ['low', 'medium', 'high', 'xhigh', 'max']);
    assert.equal(CLI_EFFORTS.dsh.flag, null);
    assert.equal(CLI_EFFORTS.vibe.flag, null);
});

test('static catalogs: vibe resolves without spawning a CLI', async () => {
    assert.deepEqual(await modelsFor('vibe'), [{ id: 'glm', note: 'GLM 5.2 - Mistral hosted (subscription)' }]);
    assert.deepEqual(await modelsFor('nope'), []);
});
