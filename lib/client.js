/* dsh-subagents — client half (browser bundle, __ModuleLoader__ factory format).
 *
 * Registers:
 *  - sidebar.footer.action → launcher button
 *  - shell.overlay         → full-screen Subagents manager
 *
 * Two-pane settings surface: the roles list on the left, the editor on the
 * right (New / Edit). Creating or editing POSTs /save, which writes the
 * definition file; hot reload registers the tool on the next turn.
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

		const COLORS = ["#d9480f", "#b8860b", "#2b6a3f", "#1f6feb", "#862d9c", "#6b7280"];

		// ------------------------------------------------------------- i18n ----
		const STRINGS = {
			tr: {
				"brand": "Subagents",
				"close": "kapat (Esc)",
				"roles": "Roller",
				"new": "Yeni rol",
				"refresh": "Yenile",
				"search.ph": "Rol ara…",
				"empty.title": "Henüz rol yok.",
				"empty.hint": "İlk subagent rolünü oluştur — pahalı modelle çalışırken küçük işleri ucuz beyinlere devret.",
				"empty.cta": "İlk rolü oluştur",
				"poll.error": "Veri alınamadı — dsh-web yeniden başlatılmış olmalı.",
				"route.model": "model",
				"route.cli": "cli",
				"route.inherit": "oturum modeli",
				"disabled.tag": "devre dışı",
				"tools.count": "araç",
				"form.new": "Yeni rol",
				"form.edit": "Rolü düzenle",
				"f.name": "İsim",
				"f.name.ph": "örn. code-reviewer",
				"f.tool.hint": "araç adı:",
				"f.color": "Renk",
				"f.route": "Beyin",
				"f.route.inherit": "Oturum modeli",
				"f.route.model": "Dsh modeli",
				"f.route.cli": "CLI",
				"f.model": "Model",
				"f.model.ph": "— model seç —",
				"f.cli": "CLI",
				"f.cliModel": "CLI modeli",
				"f.cliModel.ph": "CLI modeli (örn. minimax/minimax-m3-free) — boş = CLI varsayılanı",
				"f.cliModel.blank": "CLI varsayılanı",
				"f.cliModel.hint": "Görev bu CLI'da seçtiğin modelle koşar (--model bayrağıyla). Liste CLI'dan canlı çekilir.",
				"f.cliModel.dshHint": "dsh headless modeli profile bağlıdır — model seçimi desteklenmez.",
				"f.cliEffort": "Effort",
				"f.cliEffort.blank": "CLI varsayılanı",
				"f.cliEffort.hint": "Akıl yürütme eforu — cmdc/agy/claude --effort, pi --thinking.",
				"f.model.hint": "Görev bu ucuz/uygun modelde koşar; sohbetin modeli değişmez.",
				"f.desc": "Açıklama",
				"f.desc.ph": "Ana ajan bu metne göre rolü seçer — ne zaman kullanılacağını net yaz.",
				"f.tools": "Araçlar",
				"f.tools.all": "Tümü (varsayılan)",
				"f.tools.hint": "Seçim tükenendir:listedekiler dışında hiçbir araç verilemez.",
				"f.prompt": "System prompt",
				"f.prompt.ph": "Rolün kişiliği, sınırları ve kuralları…",
				"f.preview": "Tanım dosyası önizlemesi",
				"f.cancel": "Vazgeç",
				"f.save": "Kaydet",
				"f.saving": "Kaydediliyor…",
				"f.delete": "Sil",
				"f.delete.confirm": "“{name}” rolü silinsin mi?",
				"saved.flash": "Kaydedildi — bir sonraki turda etkin",
				"act.copy": "Test istemi kopyala",
				"diag.title": "Teşhisler",
				"act.enable": "Etkinleştir",
				"act.disable": "Devre dışı bırak",
				"copy.template": "Bu görevi {name} subagent'ına delege et: ",
				"f.skills": "Skill'ler",
				"f.skills.ph": "örn. subagent-ground-rules, code-review-checklist",
				"f.skills.hint": "Virgülle ayrılmış skill adları; rol her başlatılışında persona'ya gömülür (düşük kapasiteli modeller için deterministik).",
			},
			en: {
				"brand": "Subagents",
				"close": "close (Esc)",
				"roles": "Roles",
				"new": "New role",
				"refresh": "Refresh",
				"search.ph": "Search roles…",
				"empty.title": "No roles yet.",
				"empty.hint": "Create your first subagent role — keep the expensive model for yourself and delegate the small work.",
				"empty.cta": "Create the first role",
				"poll.error": "Cannot fetch data — dsh-web must have been restarted.",
				"route.model": "model",
				"route.cli": "cli",
				"route.inherit": "session model",
				"disabled.tag": "disabled",
				"tools.count": "tools",
				"form.new": "New role",
				"form.edit": "Edit role",
				"f.name": "Name",
				"f.name.ph": "e.g. code-reviewer",
				"f.tool.hint": "tool name:",
				"f.color": "Color",
				"f.route": "Brain",
				"f.route.inherit": "Session model",
				"f.route.model": "Dsh model",
				"f.route.cli": "CLI",
				"f.model": "Model",
				"f.model.ph": "— pick a model —",
				"f.cli": "CLI",
				"f.cliModel": "CLI model",
				"f.cliModel.ph": "CLI model (e.g. minimax/minimax-m3-free) — empty = CLI default",
				"f.cliModel.blank": "CLI default",
				"f.cliModel.hint": "The task runs on this CLI with the model you pick (via its --model flag). The list is live from the CLI.",
				"f.cliModel.dshHint": "The dsh headless model is profile-bound — model selection is not supported.",
				"f.cliEffort": "Effort",
				"f.cliEffort.blank": "CLI default",
				"f.cliEffort.hint": "Reasoning effort — cmdc/agy/claude --effort, pi --thinking.",
				"f.model.hint": "The task runs on this model; your session model stays unchanged.",
				"f.desc": "Description",
				"f.desc.ph": "The primary agent picks this role from this text — say when to use it.",
				"f.tools": "Tools",
				"f.tools.all": "All (default)",
				"f.tools.hint": "The list is exhaustive: no tool outside it is available.",
				"f.prompt": "System prompt",
				"f.prompt.ph": "The role's persona, boundaries and rules…",
				"f.preview": "Definition file preview",
				"f.cancel": "Cancel",
				"f.save": "Save",
				"f.saving": "Saving…",
				"f.delete": "Delete",
				"f.delete.confirm": "Delete role “{name}”?",
				"saved.flash": "Saved — effective on the next turn",
				"act.copy": "Copy test prompt",
				"diag.title": "Diagnostics",
				"act.enable": "Enable",
				"act.disable": "Disable",
				"copy.template": "Delegate this task to the {name} subagent: ",
				"f.skills": "Skills",
				"f.skills.ph": "e.g. subagent-ground-rules, code-review-checklist",
				"f.skills.hint": "Comma-separated skill names; inlined into the persona on every spawn (deterministic for low-capability models).",
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
		const css = [
			".sa{--sa:#d9480f;--sa-soft:color-mix(in srgb,#d9480f 12%,transparent);--sa-line:color-mix(in srgb,#d9480f 35%,transparent);--sa-ok:#2b6a3f;--sa-bad:#c92a2a;--sa-warn:#8a6508;--sa-r:10px}",
			".sa *{box-sizing:border-box}",
			".sa-backdrop{position:fixed;inset:0;z-index:900;background:rgba(8,8,10,.62);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}",
			".sa-panel{width:min(1120px,100%);height:min(780px,94vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 28px 80px rgba(0,0,0,.55);overflow:hidden;color:var(--dsw-alias-label-primary);animation:sa-in .18s ease}",
			"@keyframes sa-in{from{opacity:0;transform:translateY(6px) scale(.995)}to{opacity:1;transform:none}}",
			"@media (prefers-reduced-motion: reduce){.sa-panel{animation:none}}",
			".sa-head{display:flex;align-items:center;gap:10px;padding:0 16px;height:52px;flex:none;border-bottom:1px solid var(--dsw-alias-border-l1)}",
			".sa-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:12.5px;letter-spacing:1.4px;text-transform:uppercase}",
			".sa-brand svg{color:var(--sa)}",
			".sa-saved{margin-left:10px;font-size:11.5px;color:var(--sa-ok);opacity:0;transition:opacity .3s}",
			".sa-saved.on{opacity:1}",
			".sa-spacer{flex:1}",
			".sa-hbtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:650;border-radius:8px;height:30px;padding:0 11px;cursor:pointer;white-space:nowrap}",
			".sa-hbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-secondary)}",
			".sa-hbtn.primary{background:var(--sa);border-color:var(--sa);color:#fff}",
			".sa-hbtn.primary:hover{background:#c4571f;color:#fff}",
			".sa-hbtn.ghost{border-color:transparent}",
			".sa-shell{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr)}",
			".sa-shell.editing{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}",
			"@media (max-width:860px){.sa-shell.editing{grid-template-columns:minmax(0,1fr)}.sa-list{display:none}}",
			".sa-list{min-height:0;overflow-y:auto;padding:14px 16px 20px}",
			".sa-list-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}",
			".sa-list-title{font-size:10.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}",
			".sa-count{font:600 10.5px ui-monospace,monospace;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2);border-radius:99px;padding:1px 7px}",
			".sa-search{flex:1;min-width:0;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:inherit;font:inherit;font-size:12.5px;height:28px;padding:0 9px;outline:none}",
			".sa-search:focus{border-color:var(--sa)}",
			".sa-row{display:flex;align-items:center;gap:10px;padding:11px 8px 11px 10px;border-radius:var(--sa-r);cursor:default;border:1px solid transparent}",
			".sa-row:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}",
			".sa-row.sel{background:var(--sa-soft);border-color:var(--sa-line)}",
			".sa-row.off .sa-rname{color:var(--dsw-alias-label-secondary)}",
			".sa-rdot{width:9px;height:9px;border-radius:50%;flex:none}",
			".sa-rmain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
			".sa-rname{font-weight:700;font-size:13.5px;line-height:1.2;display:flex;align-items:center;gap:7px}",
			".sa-rtool{font:500 10.5px ui-monospace,monospace;color:var(--dsw-alias-label-tertiary)}",
			".sa-rdesc{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".sa-badge{font-size:9.5px;font-weight:750;letter-spacing:.4px;text-transform:uppercase;border-radius:99px;padding:2px 7px;flex:none;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".sa-b-model{background:var(--sa-soft);color:var(--sa)}",
			".sa-b-cli{background:color-mix(in srgb,#b8860b 14%,transparent);color:var(--sa-warn);text-transform:none;letter-spacing:0}",
			".sa-b-inherit{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
			".sa-b-off{background:color-mix(in srgb,#c92a2a 11%,transparent);color:var(--sa-bad)}",
			".sa-racts{display:flex;gap:2px;opacity:.45;transition:opacity .15s}",
			".sa-row:hover .sa-racts,.sa-row.sel .sa-racts{opacity:1}",
			".sa-ib{display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;cursor:pointer}",
			".sa-ib:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}",
			".sa-ib.danger:hover{color:var(--sa-bad)}",
			".sa-diag{margin-top:14px;border:1px dashed color-mix(in srgb,#b8860b 40%,transparent);background:color-mix(in srgb,#b8860b 7%,transparent);border-radius:var(--sa-r);padding:10px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);display:flex;flex-direction:column;gap:3px}",
			".sa-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:34px 18px;display:flex;flex-direction:column;align-items:center;gap:9px;color:var(--dsw-alias-label-secondary);text-align:center}",
			".sa-empty b{font-size:13.5px;color:var(--dsw-alias-label-primary)}",
			".sa-empty span{font-size:12.5px;max-width:340px;line-height:1.5}",
			"/* ---------- editor ---------- */",
			".sa-editor{min-height:0;overflow-y:auto;border-left:1px solid var(--dsw-alias-border-l1);padding:16px 18px 18px;display:flex;flex-direction:column;gap:14px}",
			".sa-ehead{display:flex;align-items:center;gap:8px}",
			".sa-etitle{font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--sa)}",
			".sa-field>label{display:block;font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-bottom:5px}",
			".sa-input,.sa-select,.sa-textarea{width:100%;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:inherit;font:inherit;font-size:13px;padding:8px 10px;outline:none}",
			".sa-input:focus,.sa-select:focus,.sa-textarea:focus{border-color:var(--sa);box-shadow:0 0 0 3px var(--sa-soft)}",
			".sa-textarea{resize:vertical;line-height:1.5}",
			".sa-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:5px;line-height:1.45}",
			".sa-toolname{font:600 11px ui-monospace,monospace;color:var(--sa);margin-top:5px}",
			".sa-swatches{display:flex;gap:7px}",
			".sa-sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}",
			".sa-sw.on{border-color:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1),0 0 0 4px var(--sa-soft)}",
			".sa-seg{display:flex;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:3px;gap:2px}",
			".sa-seg button{flex:1;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;font-weight:650;padding:6px 4px;border-radius:6px;cursor:pointer}",
			".sa-seg button.on{background:var(--sa);color:#fff}",
			".sa-chips{display:flex;flex-wrap:wrap;gap:6px}",
			".sa-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);border-radius:99px;padding:4px 10px 4px 8px;font:500 11.5px ui-monospace,monospace;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}",
			".sa-chip.on{border-color:var(--sa);color:var(--sa);background:var(--sa-soft)}",
			".sa-chip .box{width:11px;height:11px;border-radius:3px;border:1.5px solid currentColor;display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#fff}",
			".sa-chip.on .box{background:var(--sa);border-color:var(--sa)}",
			".sa-preview{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--sa-r);background:var(--dsw-alias-bg-layer-2)}",
			".sa-preview summary{padding:8px 12px;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px}",
			".sa-preview summary::before{content:'▸';transition:transform .15s}",
			".sa-preview[open] summary::before{transform:rotate(90deg)}",
			".sa-preview pre{margin:0;padding:0 14px 12px;font:400 11px/1.55 ui-monospace,monospace;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}",
			".sa-ebar{display:flex;gap:8px;align-items:center;margin:auto -18px -18px;position:sticky;bottom:0;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l1);padding:12px 18px}",
			".sa-err{color:var(--sa-bad);font-size:12px;flex:1;min-width:0}",
			".sa-skel{height:52px;border-radius:var(--sa-r);background:linear-gradient(100deg,var(--dsw-alias-bg-layer-2) 40%,var(--dsw-alias-bg-layer-1) 50%,var(--dsw-alias-bg-layer-2) 60%);background-size:200% 100%;animation:sa-sh 1.3s linear infinite;margin-bottom:8px}",
			"@keyframes sa-sh{to{background-position:-200% 0}}",
			".sa-launcher{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:600;border-radius:8px;padding:7px 9px;cursor:pointer}",
			".sa-launcher:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".sa-launcher svg{flex:none;color:var(--sa)}",
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
			const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			const j = await r.json().catch(() => ({}));
			if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
			return j;
		}
		function slugify(name) {
			return String(name ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		function routeKindOf(route) {
			if (route === undefined || route === "") return "inherit";
			return String(route).startsWith("cli:") ? "cli" : "model";
		}
		const Icon = {
			copy: h("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none" }, h("rect", { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: "currentColor", strokeWidth: 1.4 }), h("path", { d: "M10.5 3.5h-6a1 1 0 0 0-1 1v6", stroke: "currentColor", strokeWidth: 1.4 })),
			power: h("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M8 2v5", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }), h("path", { d: "M4.5 5a5 5 0 1 0 7 0", stroke: "currentColor", strokeWidth: 1.4 })),
			pen: h("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M2.5 13.5l1-3.5 7-7 2.5 2.5-7 7-3.5 1z", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })),
			trash: h("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none" }, h("path", { d: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5", stroke: "currentColor", strokeWidth: 1.3, strokeLinejoin: "round" })),
		};

		// --------------------------------------------------------- row list ----
		function RoleRow({ role, t, selected, onEdit, onToggle, onDelete, onCopy }) {
			const kind = routeKindOf(role.route);
			const off = role.disabled === true;
			const badgeText = off ? t("disabled.tag") : (kind === "inherit" ? t("route.inherit") : String(role.routeLabel ?? role.route).replace(/^cli:\s*/, ""));
			return h("div", { className: "sa-row" + (off ? " off" : "") + (selected ? " sel" : "") },
				h("span", { className: "sa-rdot", style: { background: role.color || "#6b7280" } }),
				h("div", { className: "sa-rmain" },
					h("div", { className: "sa-rname" }, role.name,
						off ? h("span", { className: "sa-badge sa-b-off" }, badgeText)
							: h("span", { className: "sa-badge sa-b-" + kind, title: role.routeLabel || role.route }, badgeText)),
					h("div", { className: "sa-rtool" }, role.tool
						+ (role.tools ? " · " + role.tools.length + " " + t("tools.count") : "")
						+ (role.skills && role.skills.length ? " · " + role.skills.length + " skills" : "")),
					h("div", { className: "sa-rdesc" }, role.description || "")),
				h("div", { className: "sa-racts" },
					h("button", { className: "sa-ib", title: t("act.copy"), onClick: onCopy }, Icon.copy),
					h("button", { className: "sa-ib", title: off ? t("act.enable") : t("act.disable"), onClick: onToggle }, Icon.power),
					h("button", { className: "sa-ib", title: t("form.edit"), onClick: onEdit }, Icon.pen),
					h("button", { className: "sa-ib danger", title: t("f.delete"), onClick: onDelete }, Icon.trash)),
			);
		}

		// ----------------------------------------------------------- editor ----
		function Editor({ t, data, catalog, original, onDone, onSaved }) {
			const isEdit = original !== null;
			const [name, setName] = react.useState(original?.name ?? "");
			const [description, setDescription] = react.useState(original?.description ?? "");
			const [color, setColor] = react.useState(original?.color ?? COLORS[0]);
			const [kind, setKind] = react.useState(routeKindOf(original?.route));
			const [modelRoute, setModelRoute] = react.useState(original && routeKindOf(original.route) === "model" ? original.route : "");
			const [cli, setCli] = react.useState(original && routeKindOf(original.route) === "cli" ? String(original.route).replace(/^cli:\s*/, "") : "cmdc");
			const [cliModel, setCliModel] = react.useState(original?.cliModel ?? "");
			const [cliEffort, setCliEffort] = react.useState(original?.cliEffort ?? "");
			const [allTools, setAllTools] = react.useState(!original?.tools);
			const [picked, setPicked] = react.useState(new Set(original?.tools ?? []));
			const [skills, setSkills] = react.useState((original?.skills ?? []).join(", "));
			const [body, setBody] = react.useState(original?.body ?? "");
			const [busy, setBusy] = react.useState(false);
			const [error, setError] = react.useState(null);
			const invalid = name.trim() === "" || description.trim() === "" || (kind === "model" && modelRoute === "");

			const toggleTool = (toolNameX) => {
				setPicked((prev) => {
					const next = new Set(prev);
				 if (next.has(toolNameX)) next.delete(toolNameX); else next.add(toolNameX);
					return next;
				});
			};
			const save = async () => {
				setBusy(true); setError(null);
				try {
					await postJSON(OWN + "/save", {
						originalFile: original?.file ?? "",
						name: name.trim(),
						description: description.trim(),
						color,
						model: kind === "model" ? modelRoute : "",
						cli: kind === "cli" ? cli : "",
						cliModel: kind === "cli" ? cliModel.trim() : "",
						cliEffort: kind === "cli" ? cliEffort : "",
						tools: allTools ? null : [...picked],
						skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
						body,
					});
					onSaved?.();
					onDone();
				}
				catch (e) { setError(String(e?.message ?? e)); }
				finally { setBusy(false); }
			};
			const skillsList = skills.split(",").map((s) => s.trim()).filter(Boolean);
			const cliModels = kind === "cli" ? ((catalog?.cliCatalog ?? {})[cli]?.models ?? []) : [];
			const cliEfforts = kind === "cli" ? ((catalog?.cliCatalog ?? {})[cli]?.efforts ?? []) : [];
			const preview = [
				"---",
				`name: ${name || "…"}`,
				description.includes("\n") ? "description: |" : `description: ${description || "…"}`,
				...(description.includes("\n") ? description.split("\n").map((l) => "  " + l) : []),
				...(kind === "model" ? [`model: ${modelRoute || "…"}`] : []),
				...(kind === "cli" ? [`cli: ${cli}`, ...(cliModel.trim() !== "" && cli !== "dsh" ? [`cliModel: ${cliModel.trim()}`] : []), ...(cliEffort !== "" && cli !== "dsh" ? [`cliEffort: ${cliEffort}`] : [])] : []),
				`color: "${color}"`,
				...(!allTools && picked.size > 0 ? [`tools: [${[...picked].join(", ")}]`] : []),
				...(skillsList.length > 0 ? [`skills: [${skillsList.join(", ")}]`] : []),
				"---",
				"",
				body || "…",
			].join("\n");

			return h("div", { className: "sa-editor" },
				h("div", { className: "sa-ehead" }, h("span", { className: "sa-etitle" }, isEdit ? t("form.edit") : t("form.new"))),
				h("div", { className: "sa-field" },
					h("label", null, t("f.name")),
					h("input", { className: "sa-input", value: name, placeholder: t("f.name.ph"), autoFocus: !isEdit, onChange: (e) => setName(e.target.value) }),
					h("div", { className: "sa-toolname" }, t("f.tool.hint") + " agent_" + (slugify(name) || "…")),
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.color")),
					h("div", { className: "sa-swatches" }, COLORS.map((c) => h("button", { key: c, className: "sa-sw" + (color === c ? " on" : ""), style: { background: c }, onClick: () => setColor(c), "aria-label": c }))),
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.route")),
					h("div", { className: "sa-seg" },
						h("button", { className: kind === "inherit" ? "on" : "", onClick: () => setKind("inherit") }, t("f.route.inherit")),
						h("button", { className: kind === "model" ? "on" : "", onClick: () => setKind("model") }, t("f.route.model")),
						h("button", { className: kind === "cli" ? "on" : "", onClick: () => setKind("cli") }, t("f.route.cli"))),
					kind === "model" ? h("div", { style: { marginTop: 8 } },
						h("select", { className: "sa-select", value: modelRoute, onChange: (e) => setModelRoute(e.target.value) },
							h("option", { value: "", key: "blank" }, t("f.model.ph")),
							...(catalog?.providers ?? []).map((p) => h("optgroup", { label: p.name || p.id, key: p.id },
								p.models.map((m) => h("option", { value: p.id + "/" + m.id, key: p.id + "/" + m.id }, (m.name === m.id ? m.id : m.name + " (" + m.id + ")")))))),
						h("div", { className: "sa-hint" }, t("f.model.hint"))) : null,
					kind === "cli" ? h("div", { style: { marginTop: 8 } },
						h("select", { className: "sa-select sa-cli", value: cli, onChange: (e) => { setCli(e.target.value); setCliModel(""); setCliEffort(""); } },
							...(catalog?.clis ?? ["cmdc", "pi", "agy", "claude", "dsh"]).map((c) => h("option", { value: c, key: c }, c))),
						cli !== "dsh" ? h("div", { style: { marginTop: 8 } },
							h("label", null, t("f.cliModel")),
							cliModels.length === 0
								? h("input", { className: "sa-input sa-cli-model", value: cliModel, placeholder: t("f.cliModel.ph"), onChange: (e) => setCliModel(e.target.value) })
								: h("select", { className: "sa-select sa-cli-model", value: cliModel, onChange: (e) => setCliModel(e.target.value) },
									h("option", { value: "", key: "blank" }, t("f.cliModel.blank")),
									...(cliModel !== "" && !cliModels.some((m) => m.id === cliModel) ? [h("option", { value: cliModel, key: "current" }, cliModel)] : []),
									...cliModels.map((m) => h("option", { value: m.id, key: m.id }, m.note ? m.id + " — " + m.note : m.id)))) : null,
						cli !== "dsh" && cliEfforts.length > 0 ? h("div", { style: { marginTop: 8 } },
							h("label", null, t("f.cliEffort")),
							h("select", { className: "sa-select sa-cli-effort", value: cliEffort, onChange: (e) => setCliEffort(e.target.value) },
								h("option", { value: "", key: "blank" }, t("f.cliEffort.blank")),
								...cliEfforts.map((lv) => h("option", { value: lv, key: lv }, lv))),
							h("div", { className: "sa-hint" }, t("f.cliEffort.hint"))) : null,
						h("div", { className: "sa-hint" }, cli === "dsh" ? t("f.cliModel.dshHint") : t("f.cliModel.hint"))) : null,
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.desc")),
					h("textarea", { className: "sa-textarea", rows: 2, value: description, placeholder: t("f.desc.ph"), onChange: (e) => setDescription(e.target.value) }),
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.tools")),
					h("div", { className: "sa-chips" },
						h("button", { className: "sa-chip" + (allTools ? " on" : ""), onClick: () => setAllTools(true) }, t("f.tools.all")),
						...(data.availableTools ?? []).map((x) => h("button", {
							key: x, className: "sa-chip" + (!allTools && picked.has(x) ? " on" : ""),
							onClick: () => { if (allTools) { setAllTools(false); setPicked(new Set([x])); } else toggleTool(x); },
						}, h("span", { className: "box" }), x)),
					),
					h("div", { className: "sa-hint" }, t("f.tools.hint")),
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.skills")),
					h("input", { className: "sa-input", value: skills, placeholder: t("f.skills.ph"), onChange: (e) => setSkills(e.target.value) }),
					h("div", { className: "sa-hint" }, t("f.skills.hint")),
				),
				h("div", { className: "sa-field" },
					h("label", null, t("f.prompt")),
					h("textarea", { className: "sa-textarea", rows: 6, value: body, placeholder: t("f.prompt.ph"), onChange: (e) => setBody(e.target.value) }),
				),
				h("details", { className: "sa-preview" },
					h("summary", null, t("f.preview")),
					h("pre", null, preview),
				),
				h("div", { className: "sa-ebar" },
					isEdit ? h("button", {
						className: "sa-hbtn", disabled: busy,
						onClick: async () => {
							if (!window.confirm(t("f.delete.confirm").replace("{name}", original.name))) return;
							setBusy(true);
							try { await postJSON(OWN + "/delete", { file: original.file }); onDone(); }
							catch (e) { setError(String(e?.message ?? e)); }
							finally { setBusy(false); }
						},
					}, t("f.delete")) : null,
					h("div", { className: "sa-spacer" }),
					error ? h("div", { className: "sa-err" }, error) : null,
					h("button", { className: "sa-hbtn ghost", onClick: onDone }, t("f.cancel")),
					h("button", { className: "sa-hbtn primary", disabled: busy || invalid, onClick: save }, busy ? t("f.saving") : t("f.save")),
				),
			);
		}

		// ---------------------------------------------------------- manager ----
		function Manager({ t, data, catalog, reload, savedFlash, editing, setEditing }) {
			const [q, setQ] = react.useState("");
			const roles = [...(data.agents ?? []), ...(data.disabledAgents ?? [])];
			const filtered = roles.filter((r) => q === "" || (r.name + " " + (r.description ?? "")).toLowerCase().includes(q.toLowerCase()));
			const toggle = async (role) => { try { await postJSON(OWN + "/toggle", { file: role.file }); reload(); } catch { reload(); } };
			const copy = async (role) => {
				try { await navigator.clipboard.writeText(t("copy.template").replace("{name}", role.name)); } catch { }
			};
			return h(react.Fragment, null,
				h("div", { className: "sa-list" },
					h("div", { className: "sa-list-h" },
						h("span", { className: "sa-list-title" }, t("roles")),
						h("span", { className: "sa-count" }, String(roles.length)),
						h("input", { className: "sa-search", placeholder: t("search.ph"), value: q, onChange: (e) => setQ(e.target.value) }),
						h("button", { className: "sa-hbtn primary", style: { height: 28, padding: "0 10px", flex: "none" }, onClick: () => setEditing("new") }, "+ " + t("new")),
					),
					roles.length === 0 ? h("div", { className: "sa-empty" },
						h("b", null, t("empty.title")),
						h("span", null, t("empty.hint")),
						h("button", { className: "sa-hbtn primary", onClick: () => setEditing("new") }, t("empty.cta")),
					) : h("div", null,
						...filtered.map((r) => h(RoleRow, {
							key: r.tool, role: r, t,
							selected: editing !== null && editing !== "new" && editing.tool === r.tool,
							onEdit: () => setEditing(r),
							onToggle: () => void toggle(r),
							onDelete: async () => {
								if (!window.confirm(t("f.delete.confirm").replace("{name}", r.name))) return;
								try { await postJSON(OWN + "/delete", { file: r.file }); } catch { }
								reload();
							},
							onCopy: () => void copy(r),
						})),
					),
					(data.diagnostics ?? []).length > 0 ? h("div", { className: "sa-diag" },
						h("b", { style: { fontSize: 10.5, letterSpacing: ".7px", textTransform: "uppercase" } }, t("diag.title")),
						...(data.diagnostics ?? []).map((x, i) => h("div", { key: i }, "• ", x)),
					) : null,
				),
				editing !== null ? h(Editor, {
					t, data, catalog,
					original: editing === "new" ? null : editing,
					onDone: () => setEditing(null),
					onSaved: savedFlash,
				}) : null,
			);
		}

		function usePanelData() {
			const [state, setState] = react.useState({ data: null, catalog: null, error: null, loading: true });
			const load = react.useCallback(async () => {
				setState((s) => ({ ...s, loading: true }));
				try {
					const [data, catalog] = await Promise.all([getJSON(OWN + "/debug"), getJSON(OWN + "/catalog").catch(() => null)]);
					setState({ data, catalog, error: null, loading: false });
				}
				catch (error) {
					setState((s) => ({ ...s, error: String(error?.message ?? error), loading: false }));
				}
			}, []);
			react.useEffect(() => { void load(); }, [load]);
			return { state, reload: load };
		}

		function Overlay() {
			const [lang, setLang] = react.useState(initialLang);
			const t = react.useCallback((key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key, [lang]);
			const [open, setOpen] = react.useState(false);
			const [flash, setFlash] = react.useState(false);
			const [editing, setEditing] = react.useState(null); // null | "new" | role
			const { state, reload } = usePanelData();
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
			react.useEffect(() => { try { localStorage.setItem("subagents-lang", lang); } catch {} }, [lang]);
			react.useEffect(() => {
				if (!flash) return;
				const iv = setTimeout(() => setFlash(false), 2200);
				return () => clearTimeout(iv);
			}, [flash]);
			if (!open) return null;
			return h("div", { className: "sa", onMouseDown: (e) => { if (e.target === e.currentTarget) setOpen(false); }, style: { position: "fixed", inset: 0, zIndex: 900, background: "rgba(8,8,10,.62)", backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 20 } },
				h("div", { className: "sa-panel" },
					h("div", { className: "sa-head" },
						h("div", { className: "sa-brand" },
							h("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none" },
								h("circle", { cx: 5, cy: 5, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
								h("circle", { cx: 11, cy: 11, r: 2.6, stroke: "currentColor", strokeWidth: 1.4 }),
								h("path", { d: "M6.6 6.6l2.8 2.8", stroke: "currentColor", strokeWidth: 1.4 })),
							t("brand")),
						h("span", { className: "sa-saved" + (flash ? " on" : "") }, "✓ " + t("saved.flash")),
						h("div", { className: "sa-spacer" }),
						h("button", { className: "sa-hbtn", onClick: () => void reload() }, t("refresh")),
						h("button", { className: "sa-hbtn ghost", onClick: () => setLang(lang === "tr" ? "en" : "tr") }, lang === "tr" ? "EN" : "TR"),
						h("button", { className: "sa-hbtn ghost", onClick: () => setOpen(false), title: t("close") }, "×"),
					),
					h("div", { className: "sa-shell" + (editing !== null ? " editing" : "") },
						state.error && state.data === null
							? h("div", { className: "sa-list" }, h("div", { className: "sa-empty" }, h("span", null, t("poll.error"))))
							: state.loading && !state.data
								? h("div", { className: "sa-list" }, h("div", { className: "sa-skel" }), h("div", { className: "sa-skel" }), h("div", { className: "sa-skel" }))
								: h(Manager, { t, data: state.data ?? { agents: [], disabledAgents: [], diagnostics: [] }, catalog: state.catalog, reload: () => void reload(), savedFlash: () => { setFlash(true); void reload(); }, editing, setEditing }),
					),
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
				label: "Subagents manager",
			}, Overlay));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
