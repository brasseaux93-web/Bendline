# Bendline Design System

This document is the source of truth for visual language, tokens, motion, and iconography. It complements the product rules in `docs/contextfile.md`.

## Principles

1. **Work-site first** — Dark default, high contrast, large touch targets (≥ 48 px), one primary action per screen.
2. **Deterministic & honest** — Numbers, scores, and code references use tabular figures. No decorative data that could mislead.
3. **Isometric signature** — The 30° / 150° / vertical drawing grid is the brand motif. Reuse the geometry in empty states, loaders, and 404s.
4. **Motion that respects the user** — Transform + opacity only. Interactive animations ≤ 300 ms. Springs bounded. Always honor `prefers-reduced-motion` and the in-app reduce-motion toggle.

## Color Tokens

All colors are space-separated RGB values so Tailwind opacity modifiers work (`bg-primary/20`).

### Core (dark default)

| Token | RGB | Role |
|-------|-----|------|
| `--bg` | 10 14 20 | Canvas / page background |
| `--card` | 17 24 35 | Surface / card |
| `--bg-elevated` | 25 35 50 | Raised panels |
| `--bg-glass` | 15 22 34 | Translucent overlays |
| `--ink` | 244 247 251 | Primary text |
| `--muted` | 163 178 201 | Secondary / caption text |
| `--border` | 88 110 143 | Default borders |
| `--primary` | 245 158 11 | Amber — primary CTA, free-tier meter, key accents |
| `--accent` | 34 211 238 | Cyan — focus rings, interactive highlights, blueprint grid |
| `--success` | 16 185 129 | Correct / success states |
| `--error` | 244 63 94 | Incorrect / destructive |

Light theme inverts these values while preserving the same semantic names.

### Tailwind mapping

Prefer the semantic names:

```ts
// Preferred
bg-bg, bg-card, bg-elevated, bg-glass
text-ink, text-muted
border-border
bg-primary, text-primary, border-primary
bg-accent, text-accent
bg-success, text-success
bg-error, text-error
```

Legacy aliases (`accent-amber`, `accent-cyan`, `ink-primary`, etc.) remain supported for existing components but should not be used in new code. Prefer the single-meaning tokens above.

## Typography

- **Sans**: Inter (variable) via `next/font`. Used for UI and body.
- **Mono**: JetBrains Mono (or system mono fallback) for code references, timers, DFU/WSFU numbers, and calculator outputs.
- **Scale** (fluid where noted):

| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `text-hero` | clamp(2rem → 3.25rem) | 700 | Landing / major headlines |
| `text-h1` | clamp(1.5rem → 2rem) | 600 | Page titles |
| `text-h2` | 1.25rem | 600 | Section titles |
| `text-h3` | 1.0625rem | 600 | Card titles |
| `text-body` | 1rem | 400 | Default |
| `text-caption` | 0.75rem | 500 | Labels, meta, timers |

- Always apply `tabular-nums` (already set on `html`/`body` and available as utility).
- Minimum readable size: 12 px (`text-caption`). Body stays at 16 px.

## Spacing & Radius

- Base unit: 4 px.
- Card radius: `rounded-card` → 16 px.
- Pill / badge: `rounded-pill`.
- Touch targets: minimum 48 × 48 px for interactive controls.

## Elevation & Shadow

```ts
// tailwind.config.ts
boxShadow: {
  card: "0 1px 2px rgb(0 0 0 / 0.24), 0 4px 12px rgb(0 0 0 / 0.18)",
  elevated: "0 4px 16px rgb(0 0 0 / 0.32), 0 1px 3px rgb(0 0 0 / 0.2)",
  focus: "0 0 0 2px rgb(var(--bg)), 0 0 0 4px rgb(var(--accent))",
}
```

Use sparingly. Prefer border + background elevation over heavy shadows on mobile.

## Motion

| Token | Value | Use |
|-------|-------|-----|
| `--duration-fast` | 120 ms | Micro feedback (press, toggle) |
| `--duration-normal` | 220 ms | Standard transitions |
| `--duration-slow` | 300 ms | Max for interactive animations |
| `--ease-out` | cubic-bezier(0.16, 1, 0.3, 1) | Default exit / settle |
| `--ease-spring` | spring(1, 100, 10) via Motion | Soft overshoot (bounded) |

Rules from product context:

- Only `transform` and `opacity`.
- Interactive animations ≤ 300 ms.
- `<MotionConfig reducedMotion="user">` + in-app toggle that sets `data-reduce-motion="true"`.

## Iconography

- Generic UI: Lucide at **1.75 px** stroke weight.
- Domain: custom plumbing / isometric icons in `src/components/icons/`.
- Icon buttons **must** have `aria-label`.
- One consistent style per surface; do not mix filled and outline without reason.

## Layout Patterns

- **Bento grid** for readiness / home overview.
- One primary action per screen (amber `.btn-primary`).
- Mobile-first; bottom-sheet or full-screen drawers for secondary flows when needed.
- Blueprint-grid background utility (`.blueprint-grid-bg`) for auth and key empty states.

## Signature Moments

1. **Isometric Drawing Lab** — First visual on README and landing. Rule-graded, keyboard + pointer accessible.
2. **Readiness Bento** — Topic coverage visualized as a growing pipe-run or filled isometric segments.
3. **Empty / loading / 404** — Reuse the 30°/150° geometry instead of generic illustrations.

## Accessibility

- WCAG 2.1 AA target (4.5:1 text, 3:1 UI components).
- axe-core audits run in CI against both themes.
- Focus rings use `--accent`.
- Reduced-motion support is non-negotiable.

## File Map

| File | Responsibility |
|------|----------------|
| `src/app/globals.css` | CSS custom properties + base styles |
| `tailwind.config.ts` | Tailwind theme extension (colors, type, radius, shadow, motion) |
| `src/lib/motion.ts` | Shared Motion variants and springs |
| `src/components/icons/` | Domain icons |
| This file | Human-readable design contract |

When tokens change, update both `globals.css` and this document in the same PR.
