import { apiFetch } from "@/lib/auth/api-fetch";

/** Uploads a profile photo; server writes Vercel Blob + `User.avatarUrl`. */
export async function uploadProfileAvatarPhoto(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch("/api/profile/avatar/upload", { method: "POST", body: fd });
  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { avatarUrl?: string };
    error?: string;
  };
  const url = payload.data?.avatarUrl;
  if (!res.ok || !payload.success || typeof url !== "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : "Could not upload photo.");
  }
  return url;
}
