import { apiFetch } from "@/lib/auth/api-fetch";

/** Uploads a profile life photo; server writes blob + `UserLifePhoto` row. */
export async function uploadProfileLifePhoto(file: File): Promise<{ id: string; url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await apiFetch("/api/profile/life-photos/upload", { method: "POST", body: fd });
  const payload = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { photo?: { id?: string; url?: string } };
    error?: string;
  };
  const id = payload.data?.photo?.id;
  const url = payload.data?.photo?.url;
  if (!res.ok || !payload.success || typeof id !== "string" || typeof url !== "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : "Could not upload photo.");
  }
  return { id, url };
}
