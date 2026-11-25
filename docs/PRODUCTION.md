# Production launch checklist

Code-level hardening lives in the repo. Items below need an owner decision or an external account.

## Before the first deploy

- [ ] `npm run typecheck`, `npm test`, `npm run evals`, `npm run build`, `npm run test:e2e` all pass.
- [ ] Supabase production project created; every migration in `supabase/migrations` applied in order; RLS verified with a non-admin test user.
- [ ] Stripe live-mode products and prices created; `STRIPE_PRICE_ID_*` set; webhook endpoint registered and `STRIPE_WEBHOOK_SECRET` set.
- [ ] All variables in `.env.example` set on the host; `BENDLINE_STRICT_ENV=1` on production builds.
- [ ] `NEXT_PUBLIC_APP_URL` is the public https origin.
- [ ] Security headers verified on the live URL (CSP, HSTS, frame protection). Watch the browser console for CSP violations after enabling Supabase and Stripe.

## Content and compliance (owner decisions)

- [ ] Every question is `draft` until a licensed reviewer has actually reviewed it; remove placeholder reviewer records from seed data.
- [ ] Jurisdiction records verified against each state's current bulletin: adopted code edition, exam vendor, question count, time limit, pass score, open-book rules.
- [ ] California positioning decided (contractor C-36 exam versus journeyman).
- [ ] Enough reviewed questions per topic for the readiness gate (15 answered per topic) and 100-question mock blueprints.
- [ ] Terms of Service, Privacy Policy and refund policy reviewed by counsel; sales-tax treatment confirmed.

## Operations

- [ ] Error monitoring and uptime alerts configured.
- [ ] Database backups and point-in-time recovery enabled.
- [ ] Preview deploys per pull request; production deploys from `main` only.
- [ ] Clear cached private pages on sign-out (service worker) — follow-up; needs the app-state provider change.
