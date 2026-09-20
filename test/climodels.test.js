/** dsh-subagents — CLI model listing parser tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgyModels, parseDevinModels, hasEffortToken, CLI_EFFORTS, modelsFor } from '../lib/climodels.js';

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
    assert.equal(CLI_EFFORTS.agy.flag, '--effort');
    assert.deepEqual(CLI_EFFORTS.agy.levels, ['low', 'medium', 'high']);
    assert.equal(CLI_EFFORTS.vibe.flag, null);
    assert.deepEqual(CLI_EFFORTS.vibe.levels, ['max']);
});

test('devin effort: no flag, model-suffix composition, five levels', () => {
    assert.equal(CLI_EFFORTS.devin.flag, null);
    assert.equal(CLI_EFFORTS.devin.applies, 'model-suffix');
    assert.deepEqual(CLI_EFFORTS.devin.levels, ['low', 'medium', 'high', 'xhigh', 'max']);
});

test('hasEffortToken spots effort tokens in model ids', () => {
    for (const id of ['claude-opus-5-medium', 'opus-high', 'gpt-5-6-sol-none', 'gemini-3-5-flash-minimal'])
        assert.equal(hasEffortToken(id), true, id);
    for (const id of ['opus', 'claude-opus-5', 'swe-2', 'adaptive'])
        assert.equal(hasEffortToken(id), false, id);
});

const DEVIN = JSON.stringify({
    families: [
        {
            family_label: 'Claude Opus 5',
            family_uid: 'claude-opus-5',
            slug: 'claude-opus-5',
            aliases: ['opus'],
            variants: [
                { model_uid: 'claude-opus-5-low', label: 'Claude Opus 5 Low', cost_tier: 'standard' },
                { model_uid: 'claude-opus-5-high', label: 'Claude Opus 5 High', cost_tier: 'premium' },
            ],
        },
        {
            family_label: 'SWE 2',
            family_uid: 'swe-2',
            slug: 'swe-2',
            aliases: [],
            variants: [{ model_uid: 'swe-2-max', label: 'SWE 2 Max' }],
        },
        {
            family_label: 'Fusion',
            family_uid: 'fusion',
            slug: 'fusion',
            aliases: ['fusion'],
            variants: [{ model_uid: 'fusion-opus-swe-2', label: 'Fusion pairing' }],
        },
    ],
});

test('devin listing: aliases + variants with cost notes, fusion skipped, deduped', () => {
    const models = parseDevinModels(DEVIN);
    assert.deepEqual(models.map((m) => m.id), ['opus', 'claude-opus-5-low', 'claude-opus-5-high', 'swe-2-max']);
    assert.equal(models[0].note, 'alias — Claude Opus 5');
    assert.equal(models[1].note, 'Claude Opus 5 Low · standard');
    assert.equal(models[3].note, 'SWE 2 Max');
});

test('devin listing: non-JSON output degrades to an empty list', () => {
    assert.deepEqual(parseDevinModels('Fetching models… not json'), []);
    assert.deepEqual(parseDevinModels(''), []);
});

test('devin listing: alias note falls back to slug when family_label is missing', () => {
    const models = parseDevinModels(JSON.stringify({
        families: [{ family_uid: 'swe-2', slug: 'swe-2', aliases: ['swe'], variants: [] }],
    }));
    assert.deepEqual(models, [{ id: 'swe', note: 'alias — swe-2' }]);
});

test('static catalogs: vibe resolves without spawning a CLI', async () => {
    assert.deepEqual(await modelsFor('vibe'), [{ id: 'glm', note: 'GLM 5.2 - Mistral hosted (subscription)' }]);
    assert.deepEqual(await modelsFor('nope'), []);
});
