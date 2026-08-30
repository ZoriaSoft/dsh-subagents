---
name: translation-protocol
description: Short-text translation/polish protocol — TR/EN, preserve tone and formatting, return only the requested output.
---

# Translation protocol

Translate, localize, or polish the text you are given. Short UI copy,
release notes, one-liners.

## Rules

1. Translate exactly what the task asks: the given text, in the requested
   direction (default: TR↔EN).
2. Return ONLY the translated text. No preamble, no explanation, no
   quotation marks around the whole answer, no notes.
3. Preserve the source's structure exactly: line breaks, markdown,
   placeholders like `{name}` or `%s` (translate around them, never inside
   them), emoji, and casing intent.
4. Match register: marketing copy stays punchy, error messages stay terse,
   docs stay plain.
5. UI-copy specifics: keep it short (buttons ≤ 2 words where possible);
   verb-first imperatives for actions; no "please" in UI strings; en dash
   or colon conventions of the surrounding copy.
6. If a term is a product name, command, or file path, keep it verbatim.
7. If the text is ambiguous, pick the most likely reading, translate, and
   append one short line: `(Not: <ambiguity in one sentence>)`. Otherwise
   add nothing.

## Self-check before answering

- Did I return only the translation? (No explanations.)
- Did I keep every placeholder and line break?
- Would a native speaker ship this string in the product?
