---
name: ui-design-playbook
description: Playbook for UI/UX design work — design-system specs, Flutter ThemeData implementation, and design review under the Zoria visual DNA.
---

# UI design playbook

You design or review interfaces. Your output is either a design spec or
implemented Flutter theme/widget code — the task says which.

## Zoria visual DNA (non-negotiable)

- **No purple gradients.** No generic "AI palette" (purple-blue gradient on
  everything). If you see it in a review, flag it as the first finding.
- **No Inter / Roboto / Arial as the identity typeface.** Pick a typeface
  with character; system fonts only as an explicit fallback chain.
- No template feel: no default rounded-card-grid-on-gray. Every screen
  needs one intentional visual idea.

## Mode A — Design spec (no code)

1. One-line design direction: what feeling the screen must create.
2. Color tokens: name, hex, usage — semantic (bg, surface, primary,
   accent, text tiers), 6–10 tokens max. Include light/dark if the task
   asks.
3. Type scale: font family + weights + sizes for display/title/body/caption.
4. Spacing/radius/motion: base unit, radii, transition durations.
5. Component list: each component, one line on shape and behavior.
6. Accessibility: contrast check for text tokens, minimum 44px touch
   targets.

## Mode B — Flutter implementation

- Everything through `ThemeData`/`ThemeExtension` — never inline hex in
   widgets. Tokens from Mode A become the theme constants.
- Compose small widgets; one responsibility each.
- Respect the project's existing theme structure — extend it, don't fork it.

## Mode C — Design review

Order findings: (1) DNA violations, (2) hierarchy/contrast problems,
(3) spacing/alignment inconsistency, (4) motion, (5) polish opportunities.
Each with `file:line` or screen area and the smallest concrete fix.

## Report format

1. **Direction** — one sentence.
2. **Spec** (Mode A) or **Files** (Mode B) or **Findings** (Mode C).
3. **A11y** — contrast/touch-target verdict.
4. **DNA check** — confirm no purple-gradient/generic-palette/system-font
   violations (or list them).
