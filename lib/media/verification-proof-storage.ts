import "server-only";

import { del, get, list, put } from "@vercel/blob";

const TOKEN_ENV_NAME = "VERIFICATION_BLOB_READ_WRITE_TOKEN";

export function isVerificationProofStorageConfigured(): boolean {
  return Boolean(process.env[TOKEN_ENV_NAME]?.trim());
}

export async function uploadVerificationProof(pathname: string, file: File) {
  return put(pathname, file, {
    access: "private",
    token: verificationBlobToken(),
    contentType: file.type,
    addRandomSuffix: false,
  });
}

export async function readVerificationProof(url: string) {
  return get(url, {
    access: "private",
    token: verificationBlobToken(),
  });
}

export async function deleteVerificationProof(url: string) {
  return del(url, { token: verificationBlobToken() });
}

export async function deleteVerificationProofsForUser(
  userId: string,
  knownUrls: Array<string | null | undefined> = [],
) {
  const token = verificationBlobToken();
  const urls = new Set(knownUrls.filter((url): url is string => Boolean(url)));
  let cursor: string | undefined;

  do {
    const page = await list({
      token,
      prefix: `student-proofs/${userId}/`,
      cursor,
      limit: 1000,
    });
    page.blobs.forEach((blob) => urls.add(blob.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (urls.size > 0) {
    await del([...urls], { token });
  }
}

function verificationBlobToken(): string {
  const token = process.env[TOKEN_ENV_NAME]?.trim();
  if (!token) {
    throw new Error(`${TOKEN_ENV_NAME} is not configured.`);
  }
  return token;
}
