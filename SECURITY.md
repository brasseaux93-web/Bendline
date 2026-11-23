# Security Policy

Bendline handles user authentication, study history, Stripe billing state, and sensitive exam-preparation content. We take security vulnerabilities seriously.

## Architecture Security Invariants

1. **Database Authorization**: Every table in `supabase/migrations/` enables Row-Level Security (`ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY`) scoped by `auth.uid()` and role helpers (`is_admin()`, `is_reviewer_or_admin()`). Never bypass RLS or trust client-supplied user IDs or plan tiers.
2. **Credential Isolation**: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `OPENAI_API_KEY` are strictly server-only. Never import server-only modules into `"use client"` components or barrel exports.
3. **Billing & Entitlement Integrity**:
   - Stripe webhook payloads (`/api/stripe/webhook`) are verified with `stripe.webhooks.constructEvent` and deduplicated in `public.stripe_webhook_events`.
   - Subscriptions retain a 3-day `past_due` grace window before server-side downgrade (`user_has_active_entitlement()`).
4. **Input Validation & Safety**: Every API route parses inputs with Zod (`zod`), rate-limits AI explanation calls, and never logs message bodies, tokens, passwords, or unredacted PII.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report suspected vulnerabilities privately via GitHub Security Advisories (`Security -> Advisories -> Report a vulnerability`) in this repository, including:

- Affected route, SQL migration, or library module
- Reproduction steps or proof-of-concept request payload
- Potential impact on authentication, RLS boundaries, billing entitlements, or data privacy

We will acknowledge receipt promptly, coordinate remediation before public disclosure, and credit researchers who follow coordinated disclosure.
