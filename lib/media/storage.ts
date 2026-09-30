import "server-only";

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import { localMediaEnabled, MediaStorageUnavailableError, privateMediaToken } from "@/lib/media/private-blob";

export type MediaStore = "public" | "chat" | "verification";
export type StoredMedia = { url: string; pathname: string; size: number; uploadedAt: Date };

export function mediaToken(store: MediaStore) {
  if (store === "chat") return privateMediaToken();
  const token = process.env[store === "public" ? "BLOB_READ_WRITE_TOKEN" : "VERIFICATION_BLOB_READ_WRITE_TOKEN"]?.trim();
  if (!token) throw new MediaStorageUnavailableError();
  return token;
}

export function mediaStoreConfigured(store: MediaStore) {
  if (localMediaEnabled()) return true;
  try { return Boolean(mediaToken(store)); } catch { return false; }
}

const localHost = (store: MediaStore) => store === "public" ? "local.public.blob.vercel-storage.com" : store === "chat" ? "local.private.blob.vercel-storage.com" : "local-verification.private.blob.vercel-storage.com";
const localRoot = (store: MediaStore) => path.join(process.env.MEDIA_LOCAL_DIR ?? path.join(process.cwd(), ".local-media"), store === "chat" ? "private" : store);

function localFile(store: MediaStore, pathname: string) {
  if (!/^[a-zA-Z0-9_/-]+\.[a-z0-9]+$/.test(pathname) || pathname.includes("..")) throw new Error("Invalid media pathname.");
  return path.join(localRoot(store), pathname);
}

export async function putStoredMedia(store: MediaStore, pathname: string, bytes: Uint8Array, contentType: string) {
  if (localMediaEnabled()) {
    const filename = localFile(store, pathname);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, bytes);
    return { url: `https://${localHost(store)}/${pathname}` };
  }
  return put(pathname, new Blob([new Uint8Array(bytes)], { type: contentType }), {
    token: mediaToken(store), access: store === "public" ? "public" : "private", contentType, addRandomSuffix: false,
  });
}

export async function deleteStoredMedia(store: MediaStore, url: string) {
  const parsed = new URL(url);
  if (localMediaEnabled()) {
    if (parsed.hostname !== localHost(store)) throw new Error("Local QA cannot delete remote files.");
    await rm(localFile(store, parsed.pathname.slice(1)), { force: true });
    return;
  }
  await del(url, { token: mediaToken(store) });
}

export async function readStoredMedia(store: MediaStore, url: string) {
  const parsed = new URL(url);
  if (localMediaEnabled()) {
    if (parsed.hostname !== localHost(store)) throw new Error("Local QA cannot read remote files.");
    try {
      const bytes = await readFile(localFile(store, parsed.pathname.slice(1)));
      const contentType = ({ ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".pdf": "application/pdf", ".heic": "image/heic" })[path.extname(parsed.pathname)] ?? "application/octet-stream";
      return { stream: new Blob([bytes]).stream(), contentType, size: bytes.byteLength };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
  }
  const result = await get(url, { access: store === "public" ? "public" : "private", token: mediaToken(store) });
  if (!result || result.statusCode !== 200) return null;
  return { stream: result.stream, contentType: result.blob.contentType, size: result.blob.size };
}

export async function listStoredMedia(store: MediaStore, cursor?: string, limit = 100) {
  if (!localMediaEnabled()) {
    const page = await list({ token: mediaToken(store), cursor, limit });
    return { blobs: page.blobs as StoredMedia[], cursor: page.hasMore ? page.cursor : null };
  }
  const files: string[] = [];
  async function walk(directory: string, prefix = "") {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return; throw cause; }
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), `${relative}/`);
      else if (entry.isFile()) files.push(relative);
    }
  }
  await walk(localRoot(store));
  const remaining = files.sort().filter(file => !cursor || file > cursor);
  const selected = remaining.slice(0, limit);
  const blobs = await Promise.all(selected.map(async pathname => {
    const info = await stat(localFile(store, pathname));
    return { url: `https://${localHost(store)}/${pathname}`, pathname, size: info.size, uploadedAt: info.mtime };
  }));
  return { blobs, cursor: remaining.length > selected.length ? selected.at(-1)! : null };
}
