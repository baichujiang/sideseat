import "server-only";

import { randomBytes } from "crypto";

import { put } from "@vercel/blob";

export const NATIVE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const NATIVE_IMAGE_MAX_WIDTH = 4096;
export const NATIVE_IMAGE_MAX_HEIGHT = 4096;

const MIME_TO_EXT: Record<NativeImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type NativeImageContentType = "image/jpeg" | "image/png" | "image/webp";

export type ValidatedNativeImage = {
  bytes: Buffer;
  contentType: NativeImageContentType;
  width: number;
  height: number;
};

export type NativeImageUploadResult = {
  url: string;
  contentType: NativeImageContentType;
  width: number;
  height: number;
  byteSize: number;
};

export class NativeImageUploadError extends Error {
  constructor(readonly message: string, readonly field = "file") {
    super(message);
    this.name = "NativeImageUploadError";
  }
}

function readUInt24LE(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function pngDimensions(bytes: Buffer) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) return null;
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return {
    contentType: "image/png" as const,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function jpegDimensions(bytes: Buffer) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null;
      return {
        contentType: "image/jpeg" as const,
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3),
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Buffer) {
  if (
    bytes.length < 30 ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      contentType: "image/webp" as const,
      width: readUInt24LE(bytes, 24) + 1,
      height: readUInt24LE(bytes, 27) + 1,
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      contentType: "image/webp" as const,
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      contentType: "image/webp" as const,
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + ((b3 << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return null;
}

function detectImage(bytes: Buffer) {
  return pngDimensions(bytes) ?? jpegDimensions(bytes) ?? webpDimensions(bytes);
}

export async function validateNativeImageFile(file: File): Promise<ValidatedNativeImage> {
  if (!(file instanceof File)) {
    throw new NativeImageUploadError("Choose a JPG, PNG, or WEBP image.");
  }
  if (file.size === 0) {
    throw new NativeImageUploadError("The file is empty.");
  }
  if (file.size > NATIVE_IMAGE_MAX_BYTES) {
    throw new NativeImageUploadError("Image is too large. Max 2 MB.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected) {
    throw new NativeImageUploadError("Use a valid JPG, PNG, or WEBP image.");
  }
  if (file.type && file.type !== detected.contentType) {
    throw new NativeImageUploadError("The uploaded image type does not match the file contents.");
  }
  if (
    detected.width < 1 ||
    detected.height < 1 ||
    detected.width > NATIVE_IMAGE_MAX_WIDTH ||
    detected.height > NATIVE_IMAGE_MAX_HEIGHT
  ) {
    throw new NativeImageUploadError("Image dimensions are not supported.");
  }

  return { bytes, ...detected };
}

export async function uploadNativeImage(options: {
  image: ValidatedNativeImage;
  blobPrefix: string;
  logScope: string;
}) {
  const { image } = options;
  let url: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const token = randomBytes(18).toString("hex");
    const blobKey = `${options.blobPrefix}${token}.${MIME_TO_EXT[image.contentType]}`;
    const blob = await put(blobKey, new Blob([new Uint8Array(image.bytes)], { type: image.contentType }), {
      access: "public",
      contentType: image.contentType,
      addRandomSuffix: false,
    });
    url = blob.url;
  } else {
    console.warn(
      `[${options.logScope}] BLOB_READ_WRITE_TOKEN is not configured. Falling back to inline image storage.`,
    );
    url = `data:${image.contentType};base64,${image.bytes.toString("base64")}`;
  }

  return {
    url,
    contentType: image.contentType,
    width: image.width,
    height: image.height,
    byteSize: image.bytes.byteLength,
  } satisfies NativeImageUploadResult;
}
