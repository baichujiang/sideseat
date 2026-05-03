import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32)
  .transform((s) => s.toLowerCase())
  .refine((s) => /^[a-z0-9_-]+$/.test(s), {
    message: "Use only letters, numbers, underscores, and hyphens.",
  })
  .refine((s) => !s.startsWith("guest_"), {
    message: "This username is reserved.",
  });

export const signupSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

export const signupRequestSchema = signupSchema;

export const loginRequestSchema = loginSchema;

export const guestRequestSchema = z.object({});
