import { z } from "zod";
import { LOCALES } from "@/i18n/config";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    phone: z.string().trim().regex(/^(\+?[0-9 ()-]{6,20})?$/).optional(),
    password: z.string().min(10).max(128),
    confirmPassword: z.string(),
    locale: z.enum(LOCALES),
    consent: z.literal(true),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "passwords_mismatch" });
export type RegisterInput = z.infer<typeof registerSchema>;
