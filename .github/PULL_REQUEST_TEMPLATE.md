## Summary

<!-- Describe what this change does and why. Link related issues if applicable. -->

## Type of Change

- [ ] Feature / product capability
- [ ] Bug fix
- [ ] Code table / drawing rule / Supabase migration update
- [ ] UI / Accessibility / Performance improvement
- [ ] Documentation / CI / Tests

## Verification & Quality Checklist

- [ ] `npm test` passes locally
- [ ] `npm run evals` passes locally
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` succeeds and builds `public/sw.js` cleanly
- [ ] `npm run test:e2e` passes (including `axe-core` WCAG AA checks in **both** `dark` and `light` themes)
- [ ] No hardcoded code-book constants, invented citations, copyrighted code text, or hardcoded Stripe Price IDs
- [ ] All SQL schema changes include Supabase migrations with explicit Row-Level Security (`RLS`) policies
- [ ] UI uses Bendline RGB tokens (zero raw hex), `tabular-nums`, and `transform`/`opacity` transitions (`<= 300ms`) with reduced-motion support
