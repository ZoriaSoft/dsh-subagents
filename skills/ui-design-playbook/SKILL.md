---
name: ui-design-playbook
description: Distilled Zoria design DNA for delegated UI/UX subagents — hard bans, aesthetic direction, composition, web platform discipline and quality gates.
---

# UI design playbook (distilled Zoria DNA)

You design, implement or review interfaces. This playbook carries the taste
rules of the parent workspace. It is not a process suggestion — violations
are findings, and the bans below are disqualifying.

## 0. Register first: brand or product

Before any visual decision, determine the register:

- **Brand** — the interface IS the experience (landing, campaign, portfolio,
  editorial). Every visual decision is a creative choice; arrival feeling is
  a deliverable. Per-section art direction is legitimate.
- **Product** — the interface is an instrument (app UI, dashboard, admin).
  Consistency and speed win; an operator must move without thinking.

A landing page is BRAND register. Treating it with product-register reflexes
(terminal dashboard look, status-panel aesthetics) is a category error.

## 1. Hard bans (disqualifying — the slop catalog)

- **Category reflexes.** The look must NOT be predictable from the category
  name: SaaS = purple-cream, devtool = dark terminal + mono, fintech = navy
  serif, health = white-teal. If your direction can be guessed from
  "hosting/dev/SaaS", rebuild it. (Yes: dark-charcoal + amber + monospace
  "terminal aesthetic" for an infra product is exactly this reflex.)
- **Font reflexes.** No Inter / Roboto / Arial as identity; no "new Inter"
  wave either (Geist, Outfit, Satoshi, Cabinet Grotesk, Plus Jakarta) as
  display. System font stacks are legitimate for BODY in product UI; identity
  lives in the display choice. Offline projects: a distinctive system stack
  (mono, serif, condensed) committed fully beats a lazy sans.
- **Color reflexes.** No purple-blue-violet AI gradients, no generic
  blue-violet CTA. Tone must be justified by the product's domain.
- **Banned Zoria repeat combos:** `#0A0A0F` bg + `#F5F1E8` text ·
  amber+emerald+teal trio · Instrument Serif+DM Sans+JetBrains Mono trio ·
  soft amber→peach gradient · green-teal mesh.
- **Composition reflexes.** Centered hero + equal card grid + pill CTA only
  when the work pattern genuinely requires it. Never card-in-card. No
  reasonless wrapper shells.
- **Copy slop.** No em-dash, no exclamation marks, no "Loading...",
  OK/Confirm buttons, no fabricated metrics ("+38% shipped", "10k+ users",
  "99.99%" without a source). Every action = one verb + one concrete object.
- **Motion slop.** No uniform stagger, no bounce/elastic ease, no
  layout-triggering animation, no decorative motion without
  `prefers-reduced-motion` fallback.
- **A11y floor (HIGH on sight):** color-as-only-meaning, placeholder labels,
  invisible focus, 320px / 200% zoom breakage.

## 2. Direction: commit to a current explicitly

For any NEW surface, pick ONE aesthetic current from this table and name it
in your report. "Modern dark + premium" is NOT a direction.

| Current | One line | Ground language |
|---|---|---|
| Brutally Minimal | Space and type speak, no decoration | white / pure black |
| Maximalist Chaos | Overlap, high density, clashing color | mesh + grain |
| Retro-Futuristic | CRT, scan-line, arcade nostalgia | soft black / deep tone |
| Organic / Natural | Hand-drawn curve, natural texture | cream / clay / dune |
| Luxury / Refined | Editorial type, hairline, golden ratio | obsidian / ivory |
| Playful / Toy-like | Round, pop, cheerful | mint / peach |
| Editorial / Magazine | Asymmetric grid, drop cap, magazine rhythm | off-white / serif beige |
| Brutalist / Raw | Naked grid, system font with courage | raw gray / concrete |
| Art Deco / Geometric | Shape on shape, symmetry, trim | jewel tones |
| Soft / Pastel | Low contrast, gentle motion | lavender mist / cream |
| Industrial / Utilitarian | Data density, mono, terminal | charcoal / steel |

Rules:
1. **First-order slop test:** if the direction is predictable from the
   category, rebuild it (see bans).
2. **Concept anchor:** one structural idea from the subject's essence.
   Swap test — if the anchor still "fits" when moved to a different product,
   it is decorative, go deeper. The hero must show the domain's real
   artifact (chart, invoice, route, terminal output, map) as a working
   object, not a decorative mock.
3. Font choice derives from the current — never a default.

## 3. Composition comes from the work pattern

Layout follows the dominant job, never habit:

- **Monitor** → status board, feed, alert, timeline
- **Operate** → command bar, canvas, inspector, side panel
- **Compare** → table, matrix, split view, ranked list
- **Configure** → grouped settings, form, summary, preview
- **Learn** → article flow, walking rhythm, readable measure
- **Decide** → focused pitch, evidence, risk reduction, ONE dominant action
- **Explore** → search, filter, gallery, clustering

A landing page is usually Decide + Learn: one focused pitch with evidence,
then progressive disclosure. Not a uniform feature-card grid.

## 4. Web platform discipline (static sites included)

- **Tokens:** semantic CSS custom properties (`--surface`, `--accent`,
  `--text`…); no inline hex in markup. Accent ≤10% of the surface (60-30-10).
- **Type:** scale steps ≥1.3 ratio; body measure 60–76ch; display carries
  the identity. No emoji as icons — inline SVG, one strokeWidth.
- **Motion:** transform + opacity only; <300ms for UI feedback; reveal
  animations must not hide content without JS; `prefers-reduced-motion`
  mandatory for anything decorative.
- **Layout:** CSS Grid structures; `min-height: 100dvh` (never `h-screen`);
  real `<button>`/`<a>` elements (no div onClick); focus-visible ring;
  no positive tabindex; form inputs ≥16px on small screens.
- **Atmosphere without assets:** grain via inline SVG `feTurbulence`
  data-URI + `mix-blend-mode`; CSS-only scenes (gradient sky, clip-path
  silhouette) are legitimate — external CDN/font/image dependencies are not.

## 5. Quality gates — run before reporting

1. **Squint test:** blur it — three important things must still separate.
2. **30-second sniff:** show for 2 seconds, hide, ask: what kind of product?
   what color was the page? would you scroll?
3. **Contrast, computed:** text ≥4.5:1, large text/components ≥3:1. Compute,
   do not eyeball. Color-blind filter: if primary and secondary merge, swap
   lightness.
4. **States:** loading / empty / error present where the surface promises
   interactivity; realistic long strings (TR: ğşıöçİ) for truncation.
5. **Consistency sweep:** no stray spacing/radius/shadow outside the scale.

## 6. Report format

1. **Direction commit** — the named current + the one structural anchor, one
   line each. (Mandatory: a report without a direction commit is invalid.)
2. What was built / the spec / the findings (per task mode).
3. **Quality gate results** — squint, contrast numbers, states.
4. **DNA check** — confirm each ban category clean, or list violations.
5. Anything skipped or faked, and why.

Claim only what exists: "added an animation" requires visible motion AND the
code that produces it. Unverifiable claims are removed, not hoped for.
