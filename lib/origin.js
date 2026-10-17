/**
 * dsh-subagents — Host/Origin fence helpers (pure, unit-testable).
 *
 * Full-origin comparison (scheme + host + port) replaces the previous
 * hostname-only check, which let any port on localhost call the write
 * routes. Allowed origins are the request-Host-derived origin plus a
 * configurable allowlist; https://dsh.zoriasoft.com always stays allowed
 * so the public panel keeps working. No session/CSRF token is involved.
 */

/** Authorities always trusted without configuration: loopback names. */
export const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Origin that must keep working for the public deployment. */
export const PUBLIC_PANEL_ORIGIN = 'https://dsh.zoriasoft.com';

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
    const raw = Array.isArray(resolved?.trustedHosts)
        ? resolved.trustedHosts
        : String(env.DSH_TRUSTED_HOSTS ?? '').split(',');
    return new Set(raw.map((h) => authorityHost(String(h).trim())).filter(Boolean));
}

/**
 * Configured allowlisted origins: config `trustedOrigins`, else config
 * `trustedHosts` entries that carry a scheme, else
 * `DSH_TRUSTED_ORIGINS` / `DSH_TRUSTED_HOSTS` (comma-separated).
 * Bare hostnames trust the Host only; they do not mint extra origins.
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @returns {Set<string>}
 */
export function trustedOrigins(resolved, env = process.env) {
    const fromConfig = Array.isArray(resolved?.trustedOrigins) ? resolved.trustedOrigins.map(String) : [];
    const hostEntries = Array.isArray(resolved?.trustedHosts) ? resolved.trustedHosts.map(String) : [];
    const fromEnv = [
        ...String(env.DSH_TRUSTED_ORIGINS ?? '').split(','),
        ...String(env.DSH_TRUSTED_HOSTS ?? '').split(','),
    ];
    const out = new Set();
    for (const entry of [...fromConfig, ...hostEntries, ...fromEnv]) {
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
 * Full allowed-origin set for one request: Host-derived origin, the
 * public panel origin, plus the configured allowlist.
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {any} resolved @param {Record<string, string | undefined>} [env]
 * @param {boolean} [socketEncrypted]
 * @returns {Set<string>}
 */
export function allowedOrigins(headers, resolved, env = process.env, socketEncrypted = false) {
    const out = new Set(trustedOrigins(resolved, env));
    out.add(PUBLIC_PANEL_ORIGIN);
    const derived = hostDerivedOrigin(headers, socketEncrypted);
    if (derived !== undefined)
        out.add(derived);
    return out;
}

/**
 * Evaluate the fence for one request without touching req/res.
 * Present-but-invalid or mismatched Origin is always rejected; a
 * missing Origin is allowed only for GET.
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
        return { allowed: true };
    }
    if (method !== 'GET')
        return { allowed: false, error: 'origin required for write requests' };
    return { allowed: true };
}
