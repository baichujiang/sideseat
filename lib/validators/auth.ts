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

const emailFieldSchema = z
  .string()
  .trim()
  .min(3, "Enter your email.")
  .max(254)
  .transform((s) => s.toLowerCase())
  .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), {
    message: "Enter a valid email address.",
  });

const emailAddressShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignupDisplayNameMessages = {
  tooShort: string;
  tooLong: string;
  notEmailLike: string;
};

/** English copy for API routes (`parseBody`). Client forms pass localized strings from `authForm`. */
export const SIGNUP_DISPLAY_NAME_MESSAGES_EN: SignupDisplayNameMessages = {
  tooShort: "Display name must be at least 2 characters.",
  tooLong: "Display name must be at most 32 characters.",
  notEmailLike: "Use a name, not an email address.",
};

export function signupDisplayNameField(messages: SignupDisplayNameMessages) {
  return z
    .string()
    .trim()
    .min(2, messages.tooShort)
    .max(32, messages.tooLong)
    .refine((s) => !emailAddressShape.test(s), { message: messages.notEmailLike });
}

export function createSignupEmailSchema(displayNameMessages: SignupDisplayNameMessages) {
  return z
    .object({
      email: emailFieldSchema,
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
      displayName: signupDisplayNameField(displayNameMessages),
      password: z.string().min(8, "Password must be at least 8 characters."),
      confirmPassword: z.string().min(1, "Confirm your password."),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    });
}

export function createSignupPhoneSchema(displayNameMessages: SignupDisplayNameMessages) {
  return z
    .object({
      phone: z.string().trim().min(1, "Enter your phone number."),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
      displayName: signupDisplayNameField(displayNameMessages),
      password: z.string().min(8, "Password must be at least 8 characters."),
      confirmPassword: z.string().min(1, "Confirm your password."),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    });
}

export const signupSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const signupEmailSchema = createSignupEmailSchema(SIGNUP_DISPLAY_NAME_MESSAGES_EN);

export const signupPhoneSchema = createSignupPhoneSchema(SIGNUP_DISPLAY_NAME_MESSAGES_EN);

export const phoneSendOtpSchema = z.object({
  phone: z.string().trim().min(1, "Enter your phone number."),
  purpose: z.enum(["signup"]),
});

export const emailSendOtpSchema = z.object({
  email: emailFieldSchema,
  purpose: z.enum(["signup"]),
});

export const forgotPasswordSendOtpSchema = z.object({
  email: emailFieldSchema,
});

export const forgotPasswordResetSchema = z
  .object({
    email: emailFieldSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit verification code."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z.string().min(1, "Enter your username, email, or phone."),
  password: z.string().min(1, "Enter your password."),
});

export const signupRequestSchema = signupSchema;

export const loginRequestSchema = loginSchema;

export const guestRequestSchema = z.object({});
