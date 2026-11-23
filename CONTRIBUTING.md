# Contributing to Bendline

Thank you for helping improve **Bendline**. Before opening a pull request, please review the project rules and quality gates below.

> **Content Notice**: Not affiliated with any code body, exam vendor, or state board. All questions, explanations, outlines, and drawing exercises must be 100% original. Never paste copyrighted code-book text or confidential exam-vendor items.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Bendline runs cleanly in Local Preview Mode without Supabase or Stripe environment variables configured, and runs full remote persistence when `.env.local` is populated.

## Engineering & Design Standards

1. **Jurisdiction & Edition Binding**: Questions, blueprints, calculators, and drawing rules must always bind cleanly to `(code_family, edition)` and respect `jurisdictions` flags (`open_book`, `question_count`, `time_limit_min`, `pass_pct`).
2. **Deterministic Math & Database-Driven Constants**: Never invent or hardcode sizing tables, code limits, or Stripe Price IDs in application code. Calculators and drawing grading consume verified rows from `code_tables` / `drawing_rules` and fail loudly when missing.
3. **Servability Gate**: Only questions with `status = 'published'` and an approved `question_reviews` row for their current `version` may be served via `servable_questions`.
4. **AI Guardrails**: AI explanations (`/lib/ai/explain.ts`) never perform math and must end with: `"Verify against your adopted code. Not legal advice."`
5. **Design System & Accessibility**:
   - Use CSS custom property space-separated RGB tokens (`src/app/globals.css`, `tailwind.config.ts`) — zero raw hex colors in `src/`.
   - Maintain dark theme default and WCAG AA contrast (`4.5:1` text / `3:1` UI) across both `dark` and `light` themes.
   - Use `tabular-nums`, `>= 48px` (`min-h-12`) touch targets on primary navigation/controls, Lucide icons at `1.75px` stroke, and at most one primary `.btn-primary` CTA per screen.
   - Restrict HTML animations to `transform` and `opacity` (`<= 300ms`), respecting `<MotionConfig reducedMotion="user">` and the in-app reduced-motion toggle.
6. **Database & API Security**: Add RLS policies on every new Supabase table, validate all API inputs with Zod, and never import server-only modules into client components or barrels.

## Required Checks Before Opening a PR

```bash
npm test
npm run evals
npm run typecheck
npm run build
npm run test:e2e
```

Also review `.github/PULL_REQUEST_TEMPLATE.md` and check all applicable boxes when submitting your pull request.
