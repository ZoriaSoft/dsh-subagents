/* dsh-subagents — client half (browser bundle, __ModuleLoader__ factory format).
 *
 * Registers:
 *  - sidebar.footer.action → launcher button
 *  - shell.overlay         → full-screen Subagents panel
 *
 * Data plane: polls this plugin's own /debug route (roles, routes, tool
 * registration state, diagnostics). Toggling a role POSTs /toggle, which
 * renames the definition file with the `_` disable prefix; hot reload picks
 * the change up on the next scan.
 */
window.__ModuleLoader__.load({
	id: "dsh-subagents",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const h = react.createElement;

		const inject = ["slots"];
		const OWN = "/plugins/dsh-subagents";

		// ------------------------------------------------------------- i18n ----
		const STRINGS = {
			tr: {
				"brand": "Subagents",
				"close": "kapat (Esc)",
				"empty.title": "Rol tanımlı değil.",
				"empty.hint": "Frontmatter'lı Markdown dosyalarını şu klasöre bırak:",
				"poll.error": "Panele ulaşılamadı — dsh-web yeniden başlatılmış olmalı.",
				"route.model": "model",
				"route.cli": "cli",
				"route.inherit": "oturum modeli",
				"state.enabled": "etkin",
				"state.disabled": "devre dışı",
				"state.tool": "araç",
				"act.copy": "Test istemi kopyala",
				"act.copied": "Kopyalandı ✓",
				"act.disable": "Devre dışı bırak",
				"act.enable": "Etkinleştir",
				"act.refresh": "Yenile",
				"diag.title": "Tanı dosyaları teşhisleri",
				"disabled.title": "Devre dışı roller",
				"copy.template": "Bu görevi {name} subagent'ına delege et: ",
			},
			en: {
				"brand": "Subagents",
				"close": "close (Esc)",
				"empty.title": "No roles defined.",
				"empty.hint": "Drop frontmatter Markdown files into:",
				"poll.error": "Cannot reach the panel — dsh-web must have been restarted.",
				"route.model": "model",
				"route.cli": "cli",
				"route.inherit": "session model",
				"state.enabled": "enabled",
				"state.disabled": "disabled",
				"state.tool": "tool",
				"act.copy": "Copy test prompt",
				"act.copied": "Copied ✓",
				"act.disable": "Disable",
				"act.enable": "Enable",
				"act.refresh": "Refresh",
				"diag.title": "Definition file diagnostics",
				"disabled.title": "Disabled roles",
				"copy.template": "Delegate this task to the {name} subagent: ",
			},
		};

		function initialLang() {
			try {
				const saved = localStorage.getItem("subagents-lang");
				if (saved === "tr" || saved === "en") return saved;
				return (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en";
			}
			catch { return "tr"; }
		}

		// ------------------------------------------------------------- css ----
		/* surfaces ride the host theme; brand accent is signal orange on slate */
		const css = [
			".sa-root{--sa-accent:#d9480f;--sa-accent-soft:color-mix(in srgb,#d9480f 12%,transparent);--sa-done:#2b6a3f;--sa-dim:#6b7280}",
			".sa-backdrop{position:fixed;inset:0;z-index:900;background:rgba(10,10,12,.6);backdrop-filter:blur(4px);display:grid;place-items:center;padding:24px}",
			".sa-panel{box-sizing:border-box;width:min(980px,100%);height:min(760px,92vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.5);overflow:hidden;color:var(--dsw-alias-label-primary)}",
			".sa-head{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".sa-brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:14px;letter-spacing:1.2px;text-transform:uppercase}",
			".sa-brand svg{color:#d9480f}",
			".sa-lang{margin-left:auto;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;font-weight:700;border-radius:6px;padding:4px 8px;cursor:pointer}",
			".sa-lang:hover{color:#d9480f;border-color:#d9480f}",
			".sa-close{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:20px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}",
			".sa-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}",
			".sa-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:14px}",
			".sa-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}",
			".sa-card{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:8px}",
			".sa-card.off{opacity:.55}",
			".sa-card-head{display:flex;align-items:center;gap:8px}",
			".sa-dot{width:9px;height:9px;border-radius:50%;flex:none;background:#6b7280}",
			".sa-name{font-weight:700;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".sa-badge{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border-radius:999px;padding:2px 8px;flex:none}",
			".sa-badge-model{background:var(--sa-accent-soft);color:#d9480f}",
			".sa-badge-cli{background:color-mix(in srgb,#b8860b 15%,transparent);color:#8a6508}",
			".sa-badge-inherit{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}",
			".sa-badge-off{background:color-mix(in srgb,#c92a2a 12%,transparent);color:#c92a2a}",
			".sa-desc{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
			".sa-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font:500 11px ui-monospace,SFMono-Regular,Menlo,monospace}",
			".sa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}",
			".sa-btn{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:600;border-radius:7px;padding:5px 11px;cursor:pointer}",
			".sa-btn:hover{border-color:var(--dsw-alias-label-secondary)}",
			".sa-btn-accent{border-color:#d9480f;color:#d9480f}",
			".sa-btn-accent:hover{background:var(--sa-accent-soft)}",
			".sa-btn:disabled{opacity:.5;cursor:default}",
			".sa-sec{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-top:6px}",
			".sa-diag{background:color-mix(in srgb,#b8860b 8%,transparent);border:1px dashed color-mix(in srgb,#b8860b 40%,transparent);border-radius:8px;padding:10px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;display:flex;flex-direction:column;gap:4px}",
			".sa-empty{color:var(--dsw-alias-label-secondary);text-align:center;padding:48px 16px;font-size:13px;display:flex;flex-direction:column;gap:8px;align-items:center}",
			".sa-skel{height:140px;border-radius:12px;background:linear-gradient(100deg,var(--dsw-alias-bg-layer-2) 40%,var(--dsw-alias-bg-layer-1) 50%,var(--dsw-alias-bg-layer-2) 60%);background-size:200% 100%;animation:sa-shimmer 1.3s linear infinite}",
			"@keyframes sa-shimmer{to{background-position:-200% 0}}",
			".sa-launcher{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:600;border-radius:8px;padding:7px 9px;cursor:pointer}",
			".sa-launcher:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".sa-launcher svg{flex:none;color:#d9480f}",
			"@media (prefers-reduced-motion: reduce){.sa-skel{animation:none}}",
		].join("");

		function ensureStyle() {
			if (typeof document === "undefined") return;
			if (document.getElementById("sa-style")) return;
			const s = document.createElement("style");
			s.id = "sa-style";
			s.textContent = css;
			document.head.appendChild(s);
		}

		// ------------------------------------------------------------ util ----
		async function getJSON(url) {
			const r = await fetch(url, { headers: { accept: "application/json" } });
			if (!r.ok) throw new Error(url + " → " + r.status);
			return r.json();
		}
		async function postJSON(url, body) {
			const r = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
			return j;
		}

		/**
		 * Fetch-on-demand state: loads on mount, on `nonce` bumps (toggles) and
		 * from the Refresh button. No long-lived timers — a management panel
		 * needs fresh data when the user acts, not a live feed.
		 */
		function usePanelData(nonce) {
			const [state, setState] = react.useState({ data: null, error: null, loading: true });
			const load = react.useCallback(async () => {
				setState((s) => ({ ...s, loading: true }));
				try {
					const data = await getJSON(OWN + "/debug");
					setState({ data, error: null, loading: false });
				}
				catch (error) {
					setState((s) => ({ ...s, error: String(error?.message ?? error), loading: false }));
				}
			}, []);
			react.useEffect(() => { void load(); }, [load, nonce]);
			return { state, reload: load };
		}

		function routeKind(route) {
			if (route === undefined) return "inherit";
			return String(route).startsWith("cli:") ? "cli" : "model";
		}
		function routeText(route) {
			if (route === undefined) return "";
			return String(route).replace(/^cli:\s*/, "");
		}

		// ------------------------------------------------------------- card ----
		function RoleCard({ role, t, onChanged }) {
			const [copied, setCopied] = react.useState(false);
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const kind = routeKind(role.route);
			const off = role.disabled === true;
			const copy = async () => {
				const text = t("copy.template").replace("{name}", role.name);
				try {
					await navigator.clipboard.writeText(text);
					setCopied(true);
					setTimeout(() => setCopied(false), 1600);
				}
				catch { /* clipboard unavailable */ }
			};
			return h("div", { className: "sa-card" + (off ? " off" : "") },
				h("div", { className: "sa-card-head" },
					h("span", { className: "sa-dot", style: { background: kind === "cli" ? "#b8860b" : kind === "model" ? "#d9480f" : "#6b7280" } }),
					h("span", { className: "sa-name" }, role.name),
					off
						? h("span", { className: "sa-badge sa-badge-off" }, t("state.disabled"))
						: h("span", { className: "sa-badge sa-badge-" + kind, title: role.route },
							t("route." + kind) + (routeText(role.route) ? " · " + routeText(role.route) : "")),
				),
				h("div", { className: "sa-desc" }, role.description || ""),
				h("div", { className: "sa-meta" },
					h("span", null, t("state.tool") + ": " + role.tool),
					h("span", null, role.file),
					role.tools ? h("span", null, "tools: " + role.tools.join(", ")) : null,
				),
				error ? h("div", { className: "sa-meta", style: { color: "#c92a2a" } }, error) : null,
				h("div", { className: "sa-actions" },
					h("button", { className: "sa-btn sa-btn-accent", onClick: copy }, copied ? t("act.copied") : t("act.copy")),
					h("button", {
						className: "sa-btn", disabled: busy,
						onClick: async () => {
							setBusy(true); setError(null);
							try {
								await postJSON(OWN + "/toggle", { file: role.file });
								onChanged?.();
							}
							catch (e) { setError(String(e?.message ?? e)); }
							finally { setBusy(false); }
						},
					}, off ? t("act.enable") : t("act.disable")),
				),
			);
		}

		function Panel({ t }) {
			const [nonce, setNonce] = react.useState(0);
			const { state, reload } = usePanelData(nonce);
			if (state.error && state.data === null)
				return h("div", { className: "sa-empty" }, h("div", null, t("poll.error")));
			if (state.loading && !state.data)
				return h("div", { className: "sa-grid" }, h("div", { className: "sa-skel" }), h("div", { className: "sa-skel" }));
			const d = state.data ?? { agents: [], disabledAgents: [], diagnostics: [] };
			const disabled = d.disabledAgents ?? [];
			if (d.agents.length === 0 && disabled.length === 0)
				return h("div", { className: "sa-empty" },
					h("div", { style: { fontWeight: 700 } }, t("empty.title")),
					h("div", null, t("empty.hint")),
					h("code", { style: { fontSize: 12 } }, d.agentsDir));
			return h("div", { style: { display: "contents" } },
				h("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
					h("span", { className: "sa-meta", style: { fontSize: 11.5, flex: 1 } }, d.agentsDir),
					h("button", { className: "sa-btn", onClick: () => void reload() }, t("act.refresh")),
				),
				h("div", { className: "sa-grid" },
					...d.agents.map((r) => h(RoleCard, { role: r, t, key: r.tool, onChanged: () => setNonce((n) => n + 1) })),
					...disabled.map((r) => h(RoleCard, { role: r, t, key: r.tool, onChanged: () => setNonce((n) => n + 1) })),
				),
				(d.diagnostics ?? []).length > 0 ? h("div", null,
					h("div", { className: "sa-sec" }, t("diag.title")),
					h("div", { className: "sa-diag" }, ...(d.diagnostics ?? []).map((x, i) => h("div", { key: i }, "• ", x))),
				) : null,
			);
		}

		// ---------------------------------------------------------- overlay ----
		function Overlay() {
			const [lang, setLang] = react.useState(initialLang);
			const t = react.useCallback((key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key, [lang]);
			const [open, setOpen] = react.useState(false);
			react.useEffect(() => {
				const toggle = () => setOpen((v) => !v);
				const close = () => setOpen(false);
				const esc = (e) => { if (e.key === "Escape") setOpen(false); };
				window.addEventListener("subagents:toggle", toggle);
				window.addEventListener("subagents:close", close);
				window.addEventListener("keydown", esc);
				return () => {
					window.removeEventListener("subagents:toggle", toggle);
					window.removeEventListener("subagents:close", close);
					window.removeEventListener("keydown", esc);
				};
			}, []);
			react.useEffect(() => {
				try { localStorage.setItem("subagents-lang", lang); } catch {}
			}, [lang]);
			if (!open) return null;
			return h("div", { className: "sa-root sa-backdrop", onMouseDown: (e) => { if (e.target === e.currentTarget) setOpen(false); } },
				h("div", { className: "sa-panel" },
					h("div", { className: "sa-head" },
						h("div", { className: "sa-brand" },
							h("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none" },
								h("circle", { cx: 5, cy: 5, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
								h("circle", { cx: 11, cy: 11, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
								h("path", { d: "M6.6 6.6l2.8 2.8", stroke: "currentColor", strokeWidth: 1.4 })),
							t("brand")),
						h("button", { className: "sa-lang", onClick: () => setLang(lang === "tr" ? "en" : "tr") }, lang === "tr" ? "EN" : "TR"),
						h("button", { className: "sa-close", onClick: () => setOpen(false), title: t("close") }, "×"),
					),
					h("div", { className: "sa-body" }, h(Panel, { t })),
				),
			);
		}

		function SidebarButton({ wide }) {
			return h("button", {
				className: "sa-launcher",
				title: "Subagents",
				onClick: () => window.dispatchEvent(new CustomEvent("subagents:toggle")),
			},
				h("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none" },
					h("circle", { cx: 5, cy: 5, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
					h("circle", { cx: 11, cy: 11, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
					h("path", { d: "M6.6 6.6l2.8 2.8", stroke: "currentColor", strokeWidth: 1.4 }),
				),
				wide ? h("span", null, "Subagents") : null,
			);
		}

		// ------------------------------------------------------------ apply ----
		function apply(ctx) {
			ensureStyle();
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-subagents-launcher",
				order: 55,
				label: "Subagents",
			}, SidebarButton));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-subagents",
				order: 85,
				label: "Subagents panel",
			}, Overlay));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
