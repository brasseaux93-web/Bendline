import type { PlanTier } from "@/lib/domain/types";

export type CheckoutPlanId = "pro_exam_pass" | "pro_monthly";

export interface BillingPlanSpec {
  id: PlanTier;
  name: string;
  tagline: string;
  billingModel: "free" | "one_time" | "recurring";
  durationNote: string;
  envPriceKey: string | null;
  pricingStatusNote: string;
  features: string[];
}

export const BILLING_PLANS: BillingPlanSpec[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Daily adaptive warm-up & core workspace",
    billingModel: "free",
    durationNote: "No card required",
    envPriceKey: null,
    pricingStatusNote: "$0 · 12 scored practice questions per day",
    features: [
      "12 scored practice questions per day (timezone-aware UTC reset)",
      "Deterministic DFU / WSFU / Drain / Vent / Gas calculators",
      "Learn-mode isometric pipe lab & public accuracy ledger",
    ],
  },
  {
    id: "pro_exam_pass",
    name: "3-Month Exam Pass",
    tagline: "Fixed 90-day licensing sprint",
    billingModel: "one_time",
    durationNote: "90 days of unlimited access (no auto-renewal)",
    envPriceKey: "STRIPE_PRICE_ID_PASS_3M",
    pricingStatusNote: "Configured via STRIPE_PRICE_ID_PASS_3M (price under testing)",
    features: [
      "Unlimited daily adaptive SRS practice across all 10 domains",
      "Full state-blueprint timed mock exams & section readiness breakdown",
      "Timed Isometric Pipe Lab exams, Navigation Trainer & AI error analysis",
    ],
  },
  {
    id: "pro_monthly",
    name: "Monthly Pro",
    tagline: "Flexible month-to-month prep",
    billingModel: "recurring",
    durationNote: "Auto-renews monthly · 3-day payment grace protection",
    envPriceKey: "STRIPE_PRICE_ID_MONTHLY",
    pricingStatusNote: "Configured via STRIPE_PRICE_ID_MONTHLY (price under testing)",
    features: [
      "Everything in the 3-Month Exam Pass with monthly flexibility",
      "Manage or cancel anytime in the Stripe Customer Portal",
      "3-day grace window if a renewal charge fails unexpectedly",
    ],
  },
];
