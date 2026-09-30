import { createHash, randomInt } from "node:crypto";
import { z } from "zod";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const redeemMembershipSchema = z.object({
  code: z.string().max(100).transform(value => value.replace(/[\s-]/g, "").toUpperCase())
    // Keep previously issued 32-character codes redeemable.
    .pipe(z.string().regex(/^(?:[A-HJKMNP-Z2-9]{8}|[A-F0-9]{32})$/, "Enter a valid invitation code.")),
}).strict();

export function hashMembershipCode(code: string) {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
}

export function generateMembershipCode() {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)])
    .join("").match(/.{4}/g)!.join("-");
}
