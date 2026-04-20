import { getSchoolByCode, getSchoolLabel, schoolDirectory } from "@/lib/constants/schools";

export const publicEmailDomains = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "yahoo.com",
  "qq.com",
  "163.com",
  "126.com",
  "proton.me",
  "protonmail.com",
]);

export function getEmailDomain(email: string) {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export function getSchoolByEmail(email: string) {
  const domain = getEmailDomain(email);

  if (!domain) {
    return null;
  }

  const match = Object.values(schoolDirectory).find((school) => {
    const domains = school.verificationDomains as readonly string[];
    return domains.includes(domain);
  });

  return match?.label ?? null;
}

export function looksLikeSchoolEmail(email: string) {
  const domain = getEmailDomain(email);

  if (!domain || publicEmailDomains.has(domain)) {
    return false;
  }

  return Boolean(getSchoolByEmail(email));
}

export function doesEmailMatchSchool(email: string, schoolCode?: string | null) {
  const school = getSchoolByCode(schoolCode);

  if (!school) {
    return false;
  }

  return (school.verificationDomains as readonly string[]).includes(getEmailDomain(email));
}

export function schoolSupportsAutomaticVerification(schoolCode?: string | null) {
  return Boolean(getSchoolByCode(schoolCode)?.verificationDomains.length);
}

export function getSchoolVerificationHint(schoolCode?: string | null) {
  const school = getSchoolByCode(schoolCode);

  if (!school) {
    return "Choose your school first.";
  }

  if (!school.verificationDomains.length) {
    return "Manual review.";
  }

  return `Accepts ${school.verificationDomains.map((domain) => `@${domain}`).join(" or ")}.`;
}
