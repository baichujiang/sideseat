import { apiFetch } from "@/lib/auth/api-fetch";

export async function uploadClassmatePostImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await apiFetch("/api/classmate-posts/upload", { method: "POST", body: fd });
  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { url?: string };
    error?: string;
  };
  if (!res.ok || payload.success !== true || typeof payload.data?.url !== "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : "Could not upload photo.");
  }
  return payload.data.url;
}
