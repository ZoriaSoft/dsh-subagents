/**
 * dsh-subagents — pure reconciliation between the registered agent tools and
 * a freshly loaded set of definitions.
 *
 * Kept free of dsh/cordis imports so it is unit-testable in isolation.
 *
 * @module dsh-subagents/reconcile
 */
import { definitionSignature } from './definitions.js';

/**
 * Compute the registration changes needed to move from `current` to `fresh`.
 * Comparison is by CONTENT SIGNATURE, not object identity: loadDefinitions()
 * mints new objects on every scan, so identity would re-register every role
 * on every rescan. An unchanged definition (equal signature) is left alone
 * unless its registration is no longer visible in the live registry.
 *
 * @param {Map<string, any>} current slug → currently registered definition
 * @param {Map<string, any>} fresh slug → freshly loaded definition
 * @param {(toolName: string) => boolean} isRegistered live-registry probe
 * @returns {{ unregister: any[], register: any[] }}
 */
export function reconcile(current, fresh, isRegistered) {
    const unregister = [];
    const register = [];
    const currentSig = new Map();
    for (const [slug, def] of current)
        currentSig.set(slug, definitionSignature(def));
    for (const [slug, def] of current) {
        if (currentSig.get(slug) !== definitionSignature(fresh.get(slug)))
            unregister.push(def);
    }
    for (const [slug, def] of fresh) {
        const changed = definitionSignature(current.get(slug)) !== definitionSignature(def);
        const visible = isRegistered(`agent_${slug}`) === true;
        // changed → re-register for the fresh closure; unchanged but not
        // visible → the registration was rolled back (apply-fiber anchor
        // caveat) and must be re-made on a durable anchor.
        if (changed || !visible)
            register.push(def);
    }
    // Changed tools must be unregistered too (their closure went stale).
    for (const def of register) {
        if (current.has(def.slug))
            unregister.push(def);
    }
    return { unregister: dedupe(unregister), register: dedupe(register) };
}

/** @param {any[]} defs */ function dedupe(defs) {
    const seen = new Set();
    return defs.filter((def) => (seen.has(def.slug) ? false : (seen.add(def.slug), true)));
}
