import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const stateWaitlistSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Enter a 2-letter US state code (e.g., FL or WA)."),
  licenseLevel: z.literal("journeyman"),
});

export type StateWaitlistInput = z.infer<typeof stateWaitlistSchema>;

export const onboardingSchema = z.object({
  jurisdictionId: z.string().uuid("Select a valid state jurisdiction."),
  licenseLevel: z.literal("journeyman"),
  confirmedCode: z.literal(true, {
    errorMap: () => ({
      message: "Confirm the code family and edition before starting.",
    }),
  }),
  examDate: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val),
      "Enter a valid date in YYYY-MM-DD format."
    ),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
