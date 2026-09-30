import "server-only";

export class MediaStorageUnavailableError extends Error {
  constructor() { super("File storage is temporarily unavailable."); }
}

export function localMediaEnabled() {
  return process.env.MEDIA_LOCAL_STORAGE === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

export function privateMediaToken() {
  // Existing installations already have a private store for verification files.
  const token = process.env.PRIVATE_MEDIA_BLOB_READ_WRITE_TOKEN?.trim() || process.env.VERIFICATION_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new MediaStorageUnavailableError();
  return token;
}
