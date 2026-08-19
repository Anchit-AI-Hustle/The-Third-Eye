// web/lib/validation.ts
// Allow-list input validation (SECURITY.md §6). Every server route validates its input
// through these schemas before acting. Output encoding is handled by React on render.

import { z } from "zod";

/** E.164-ish phone: + and 8–15 digits. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{7,14}$/, "Invalid phone number");

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email").max(254);

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, "OTP must be 4–8 digits");

/** Indian 6-digit pincode. */
export const pincodeSchema = z.string().trim().regex(/^\d{6}$/, "Pincode must be 6 digits");

/** Aadhaar is 12 digits — used ONLY transiently to initiate provider eKYC; never stored. */
export const aadhaarSchema = z
  .string()
  .transform((s) => s.replace(/\s/g, ""))
  .pipe(z.string().regex(/^\d{12}$/, "Aadhaar must be 12 digits"));

/** Profile upsert payload accepted by the server. Non-sensitive, allow-listed fields only. */
export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  handle: z
    .string()
    .trim()
    .max(40)
    .regex(/^@?[a-zA-Z0-9_.]+$/, "Handle may use letters, numbers, _ and .")
    .optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "DOB must be YYYY-MM-DD")
    .refine((d) => {
      const t = Date.parse(d);
      return !Number.isNaN(t) && t <= Date.now();
    }, "DOB cannot be in the future")
    .optional(),
  pincode: pincodeSchema.optional(),
  address: z.string().trim().max(240).optional(),
  website_url: z.string().trim().url("Invalid URL").max(2048).optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/* ---------- Creator Studio ---------- */
const assetTypeSchema = z.enum(["video", "carousel", "photo", "loop"]);
const planStatusSchema = z.enum(["to_shoot", "shot", "edited", "scheduled", "posted"]);
const platformSchema = z.enum(["instagram", "youtube", "facebook", "tiktok", "google"]);
const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM");

/** Save the user's content pillars (Strategy). Existing pillars carry their id so we can
 *  update-in-place (preserving content_plan.pillar_id links) rather than delete-and-reinsert. */
export const pillarsBulkSchema = z.object({
  pillars: z
    .array(
      z.object({
        id: uuidSchema.optional(),
        name: z.string().trim().min(1).max(60),
        role: z.string().trim().max(80).optional().default(""),
      }),
    )
    .max(12),
});

export const planCreateSchema = z.object({
  pillar_id: uuidSchema.nullable().optional(),
  format: z.string().trim().max(80).optional().default(""),
  asset_type: assetTypeSchema.default("video"),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  hook: z.string().trim().min(1, "Add a hook / idea").max(280),
  caption: z.string().trim().max(2200).optional(),
});

export const planUpdateSchema = z.object({
  id: uuidSchema,
  status: planStatusSchema.optional(),
  done: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Generate-starter-week request (server builds 7 items from the user's pillars). */
export const planGenerateWeekSchema = z.object({ generate: z.literal("week") });

export const dealCreateSchema = z
  .object({
    brand: z.string().trim().max(80).optional().default(""),
    emoji: z.string().trim().max(4).optional().default(""),
    product: z.string().trim().max(120).optional().default(""),
    category: z.string().trim().max(80).optional().default(""),
    code: z.string().trim().max(40).optional().default(""),
    discount: z.string().trim().max(40).optional().default(""),
    price: z.string().trim().max(40).optional().default(""),
    affiliate_url: z.string().trim().url("Invalid URL").max(2048).optional().or(z.literal("")),
  })
  .refine((d) => d.brand || d.product, { message: "Add a brand or product" });

export const scheduleCreateSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(200),
  date: dateSchema.optional(),
  time: timeSchema.optional(),
  channels: z.array(platformSchema).min(1, "Pick at least one channel"),
});

export const channelUpsertSchema = z.object({
  platform: platformSchema,
  handle: z.string().trim().max(120),
});

export const idParamSchema = z.object({ id: uuidSchema });

/* ---------- Organizations / tenancy ---------- */
export const orgCreateSchema = z.object({
  type: z.enum(["creator", "commerce", "local", "agency"]),
  name: z.string().trim().min(1, "Add a name").max(80),
  vertical: z.string().trim().max(60).optional(),
});

export const otpRequestSchema = z.object({
  channel: z.enum(["sms", "email"]),
  to: z.string().trim().min(3).max(254),
});

export const otpVerifySchema = z.object({
  channel: z.enum(["sms", "email"]),
  to: z.string().trim().min(3).max(254),
  code: otpSchema,
});

export const subscribeSchema = z.object({
  plan: z.enum(["basic", "pro"]),
  cycle: z.enum(["monthly", "annual"]),
});

export const kycInitiateSchema = z.object({
  aadhaar: aadhaarSchema,
  consent: z.literal(true, { errorMap: () => ({ message: "Explicit consent is required" }) }),
});

export const kycVerifySchema = z.object({
  reference_id: z.string().trim().min(1).max(128),
  otp: otpSchema,
});

/** Compute age from an ISO DOB string (age is derived, never stored). */
export function ageFromDob(dob: string): number | null {
  const b = new Date(dob);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age--;
  return age >= 0 && age < 130 ? age : null;
}
