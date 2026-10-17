/** dsh-subagents — full-origin & content-type fence tests (scheme + host + port). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as originMod from '../lib/origin.js';
import { evaluateFence, normalizeOrigin, hostDerivedOrigin, isJsonContentType, readJsonBody } from '../lib/origin.js';

const NO_ENV = { DSH_TRUSTED_HOSTS: '', DSH_TRUSTED_ORIGINS: '' };
const fence = (req, resolved = {}) => evaluateFence(req, resolved, NO_ENV);

test('same origin (scheme+host+port) passes for writes', () => {
    const v = fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'application/json' } });
    assert.equal(v.allowed, true);
});

test('different port on localhost is rejected (hostname-only check would pass)', () => {
    const v = fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://localhost:9999' } });
    assert.equal(v.allowed, false);
    assert.match(v.error, /cross-origin/);
});

test('different scheme is rejected even with same host and port', () => {
    const v = fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'https://localhost:5173' } });
    assert.equal(v.allowed, false);
});

test('https public host works via trustedHosts + X-Forwarded-Proto, never hardcoded on localhost', () => {
    assert.equal('PUBLIC_PANEL_ORIGIN' in originMod, false);
    const viaProxy = fence({
        method: 'POST',
        headers: { host: 'dsh.zoriasoft.com', 'x-forwarded-proto': 'https', origin: 'https://dsh.zoriasoft.com', 'content-type': 'application/json' },
    }, { trustedHosts: ['dsh.zoriasoft.com'] });
    assert.equal(viaProxy.allowed, true);
    // Unconfigured remote origin must NOT be allowed against a local Host.
    const remoteToLocal = fence({
        method: 'POST',
        headers: { host: 'localhost:5173', origin: 'https://dsh.zoriasoft.com', 'content-type': 'application/json' },
    });
    assert.equal(remoteToLocal.allowed, false);
    // Even when trustedHosts includes the public host (with or without scheme),
    // a cross-origin request targeting Host: localhost must still be rejected.
    const trustedHostToLocal = fence({
        method: 'POST',
        headers: { host: 'localhost:5173', origin: 'https://dsh.zoriasoft.com', 'content-type': 'application/json' },
    }, { trustedHosts: ['https://dsh.zoriasoft.com'] });
    assert.equal(trustedHostToLocal.allowed, false);
    // Plain http for the public host must not pass when proxy reports https.
    const httpPublic = fence({
        method: 'POST',
        headers: { host: 'dsh.zoriasoft.com', 'x-forwarded-proto': 'https', origin: 'http://dsh.zoriasoft.com' },
    }, { trustedHosts: ['dsh.zoriasoft.com'] });
    assert.equal(httpPublic.allowed, false);
});

test('configurable allowlist admits an extra origin, port-sensitively', () => {
    const resolved = { trustedOrigins: ['https://panel.example.com:8443'] };
    assert.equal(fence({ method: 'POST', headers: { host: 'panel.example.com:8443', origin: 'https://panel.example.com:8443' } }, resolved).allowed, true);
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'https://panel.example.com:8443' } }, resolved).allowed, true);
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'https://panel.example.com' } }, resolved).allowed, false);
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://panel.example.com:8443' } }, resolved).allowed, false);
});

test('write without Origin is rejected; GET without Origin is allowed', () => {
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173' } }).allowed, false);
    assert.equal(fence({ method: 'DELETE', headers: { host: 'localhost:5173' } }).allowed, false);
    assert.equal(fence({ method: 'GET', headers: { host: 'localhost:5173' } }).allowed, true);
});

test('invalid Origin values are rejected, including for GET', () => {
    assert.equal(fence({ method: 'GET', headers: { host: 'localhost:5173', origin: 'null' } }).allowed, false);
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'not a url' } }).allowed, false);
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost:5173', origin: 'http://evil.example.com' } }).allowed, false);
});

test('untrusted Host is rejected before Origin is considered', () => {
    const v = fence({ method: 'GET', headers: { host: 'evil.example.com', origin: 'http://evil.example.com' } });
    assert.equal(v.allowed, false);
    assert.match(v.error, /untrusted host/);
});

test('default ports normalise away, explicit non-default ports do not', () => {
    assert.equal(normalizeOrigin('http://localhost:80'), 'http://localhost');
    assert.equal(normalizeOrigin('https://dsh.zoriasoft.com:443'), 'https://dsh.zoriasoft.com');
    assert.equal(hostDerivedOrigin({ host: 'localhost:5173' }), 'http://localhost:5173');
    assert.equal(fence({ method: 'POST', headers: { host: 'localhost', origin: 'http://localhost:80' } }).allowed, true);
});

test('write requests reject text/plain and form content-types (preflightless POST defense)', async () => {
    assert.equal(isJsonContentType('application/json'), true);
    assert.equal(isJsonContentType('application/json; charset=utf-8'), true);
    assert.equal(isJsonContentType('text/plain'), false);
    assert.equal(isJsonContentType('application/x-www-form-urlencoded'), false);
    assert.equal(isJsonContentType(undefined), false);

    const textPlain = fence({
        method: 'POST',
        headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'content-type': 'text/plain' },
    });
    assert.equal(textPlain.allowed, false);
    assert.match(textPlain.error, /application\/json/);

    const makeReq = (headers, body) => Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', headers });
    await assert.rejects(
        readJsonBody(makeReq({ 'content-type': 'text/plain' }, '{"file":"a.md"}')),
        /content-type must be application\/json/,
    );
    await assert.rejects(
        readJsonBody(makeReq({}, '{"file":"a.md"}')),
        /content-type must be application\/json/,
    );
    const parsed = await readJsonBody(makeReq({ 'content-type': 'application/json; charset=utf-8' }, '{"file":"a.md"}'));
    assert.deepEqual(parsed, { file: 'a.md' });
});
