# Bendline design system

Source of truth for tokens: `src/app/globals.css` and `tailwind.config.ts`. Rules for contributors and AI agents live in `contextfile.md`.

## Type

| Role | Font | Use |
| --- | --- | --- |
| UI and body | Inter, tabular numerals on body | All interface text |
| Display accent | Instrument Serif italic | One accent phrase per hero or section heading |
| Technical | JetBrains Mono | Eyebrows, jurisdiction codes, diagram callouts, numerals |

Sizes: hero (fluid 34-56px), h1 (fluid 24-34px), h2 20px, h3 17px, body 16px, caption 13px. Nav labels and diagram text are never smaller than 12px.

## Color and surfaces

- Dark is default. Light darkens amber to amber-700 so the brand button stays amber.
- `line-subtle` is for dividers. Controls use `line-strong` or `border` to meet 3:1.
- Elevation: `shadow-1`, `shadow-2`, `shadow-3`. Primary buttons use `shadow-glow`.

## Controls

- Touch targets are at least 48px.
- One `.btn-primary` per screen; pair it with `.btn-secondary` at the same height.
- Utility controls sit in one grouped toolbar. Sign out is separated by a divider.

## Motion

- Transform and opacity only, with the SVG riser draw-on as the one exception.
- Everything respects `prefers-reduced-motion` and the in-app toggle.

## Diagram rules

- Isometric projection uses 30 degree axes. Pipes draw as tube strokes (outline, body, highlight).
- Callouts use 13px mono in pills, colored by system: amber drain, cyan stack and vent, green wet vent.
