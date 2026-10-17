/**
 * dsh-subagents — Host/Origin fence helpers (pure, unit-testable).
 *
 * Full-origin comparison (scheme + host + port) replaces the previous
 * hostname-only check, which let any port on localhost call the write
 * routes. Allowed origins are the request-Host-derived origin plus an
 * optional operator-configured allowlist (`trustedOrigins` /
 * `DSH_TRUSTED_ORIGINS`). Write requests also require an `Origin`
 * header and `Content-Type: application/json` so browsers cannot send
 * preflightless simple POSTs (`text/plain`, form data).
 */

/** Authorities always trusted without configuration: loopback names. */
export const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True when a Content-Type header value has media type `application/json`
 * (parameters such as `; charset=utf-8` are permitted).
 * @param {string | string[] | undefined} value @returns {boolean}
 */
export function isJsonContentType(value) {
    const raw = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
    const media = raw.split(';')[0].trim().toLowerCase();
    return media === 'application/json';
}

/**
 * Hostname of an authority header value (`Host` / `Origin`), lowercased.
 * Undefined when unparsable.
 * @param {string} value @returns {string | undefined}
 */
export function authorityHost(value) {
    try {
        const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`);
        return url.hostname.toLowerCase() || undefined;
    }
    catch {
        return undefined;
    }
}

/**
 * Normalised origin (`scheme://host[:port]`, default ports stripped,
 * lowercased) or undefined when the value is not an http(s) origin.
 * @param {string} value @returns {string | undefined}
 */
export function normalizeOrigin(value) {
    try {
        const url = new URL(String(value).trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return undefined;
        if (url.hostname === '')
            return undefined;
        return url.origin.toLowerCase();
    }
    catch {
        return undefined;
    }
}

/**
 * Configured extra trusted hostnames: config `trustedHosts` (string
 * array), else `DSH_TRUSTED_HOSTS` (comma-separated), else none.
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @returns {Set<string>}
 */
export function trustedHosts(resolved, env = process.env) {
    const rawHosts = Array.isArray(resolved?.trustedHosts)
        ? resolved.trustedHosts
        : String(env.DSH_TRUSTED_HOSTS ?? '').split(',');
    const rawOrigins = Array.isArray(resolved?.trustedOrigins)
        ? resolved.trustedOrigins
        : String(env.DSH_TRUSTED_ORIGINS ?? '').split(',');
    return new Set([...rawHosts, ...rawOrigins].map((h) => authorityHost(String(h).trim())).filter(Boolean));
}

/**
 * Configured allowlisted origins: config `trustedOrigins`, else
 * `DSH_TRUSTED_ORIGINS` (comma-separated). Bare hostnames trust the
 * Host only; they do not mint extra origins.
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @returns {Set<string>}
 */
export function trustedOrigins(resolved, env = process.env) {
    const fromConfig = Array.isArray(resolved?.trustedOrigins) ? resolved.trustedOrigins.map(String) : [];
    const fromEnv = String(env.DSH_TRUSTED_ORIGINS ?? '').split(',');
    const out = new Set();
    for (const entry of [...fromConfig, ...fromEnv]) {
        const trimmed = entry.trim();
        if (!trimmed.includes('://'))
            continue;
        const origin = normalizeOrigin(trimmed);
        if (origin !== undefined)
            out.add(origin);
    }
    return out;
}

/**
 * Scheme-carrying entries in `trustedHosts` / `DSH_TRUSTED_HOSTS` that
 * match the current request's `Host` hostname (e.g. when a reverse proxy
 * forwards `Host: dsh.zoriasoft.com` without `X-Forwarded-Proto`). Never
 * admits a foreign Origin when `Host` is a different host (such as
 * `localhost`).
 * @param {string | undefined} requestHost
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @returns {Set<string>}
 */
function matchingHostOrigins(requestHost, resolved, env = process.env) {
    const out = new Set();
    if (requestHost === undefined)
        return out;
    const hostEntries = Array.isArray(resolved?.trustedHosts) ? resolved.trustedHosts.map(String) : [];
    const fromEnv = String(env.DSH_TRUSTED_HOSTS ?? '').split(',');
    for (const entry of [...hostEntries, ...fromEnv]) {
        const trimmed = entry.trim();
        if (!trimmed.includes('://'))
            continue;
        const origin = normalizeOrigin(trimmed);
        if (origin !== undefined && authorityHost(origin) === requestHost)
            out.add(origin);
    }
    return out;
}

/**
 * Origin derived from the request Host: scheme is the forwarded proto
 * when present, else TLS-on-socket, else http; authority is the raw Host
 * header so the port must match exactly.
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {boolean} [socketEncrypted]
 * @returns {string | undefined}
 */
export function hostDerivedOrigin(headers, socketEncrypted = false) {
    const host = String(headers?.host ?? '').trim();
    if (host === '' || host.includes('/') || host.includes(' '))
        return undefined;
    const forwarded = String(headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
    const proto = forwarded === 'https' || forwarded === 'http' ? forwarded : (socketEncrypted ? 'https' : 'http');
    return normalizeOrigin(`${proto}://${host}`);
}

/**
 * Full allowed-origin set for one request: Host-derived origin plus the
 * explicitly configured allowlist (empty by default).
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @param {boolean} [socketEncrypted]
 * @returns {Set<string>}
 */
export function allowedOrigins(headers, resolved, env = process.env, socketEncrypted = false) {
    const out = new Set(trustedOrigins(resolved, env));
    const reqHost = authorityHost(String(headers?.host ?? ''));
    for (const origin of matchingHostOrigins(reqHost, resolved, env))
        out.add(origin);
    const derived = hostDerivedOrigin(headers, socketEncrypted);
    if (derived !== undefined)
        out.add(derived);
    return out;
}

/**
 * Evaluate the fence for one request without touching req/res.
 * Present-but-invalid or mismatched Origin is always rejected; a
 * missing Origin is allowed only for GET. Write requests with a
 * non-JSON Content-Type are rejected before body parsing.
 * @param {{ method?: string, headers?: Record<string, string | string[] | undefined>, socketEncrypted?: boolean }} req
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @returns {{ allowed: true } | { allowed: false, error: string }}
 */
export function evaluateFence(req, resolved, env = process.env) {
    const headers = req?.headers ?? {};
    const host = authorityHost(String(headers.host ?? ''));
    const trusted = trustedHosts(resolved, env);
    if (host === undefined || (!LOOPBACK_NAMES.has(host) && !trusted.has(host)))
        return { allowed: false, error: 'untrusted host' };
    const method = String(req?.method ?? 'GET').toUpperCase();
    const rawOrigin = headers.origin;
    const origin = Array.isArray(rawOrigin) ? String(rawOrigin[0] ?? '') : String(rawOrigin ?? '');
    if (origin.trim() !== '') {
        const normalized = normalizeOrigin(origin);
        if (normalized === undefined)
            return { allowed: false, error: 'cross-origin request rejected' };
        if (!allowedOrigins(headers, resolved, env, req?.socketEncrypted === true).has(normalized))
            return { allowed: false, error: 'cross-origin request rejected' };
    }
    else if (method !== 'GET') {
        return { allowed: false, error: 'origin required for write requests' };
    }
    if (method !== 'GET' && headers['content-type'] !== undefined && !isJsonContentType(headers['content-type']))
        return { allowed: false, error: 'content-type must be application/json' };
    return { allowed: true };
}

export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Read and parse a JSON request body. Requires `Content-Type: application/json`
 * before reading or calling `JSON.parse` so preflightless `text/plain` / form
 * POSTs from a browser are rejected immediately.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
export function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        if (!isJsonContentType(req?.headers?.['content-type'])) {
            reject(new Error('content-type must be application/json'));
            return;
        }
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('request body too large'));
                req.destroy?.();
                return;
            }
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw.trim() === '' ? {} : JSON.parse(raw));
            }
            catch {
                reject(new Error('invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
