import "server-only";

import { createSign } from "node:crypto";
import http2 from "node:http2";

import {
  apnsBundleId,
  apnsHostForEnvironment,
  type ApnsEnvironment,
  isApnsConfigured,
} from "@/lib/push/apns-env";
import { buildApnsPayload, type UserPushPayload } from "@/lib/push/apns-payload";

function normalizeP8Key(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

let cachedToken: { value: string; expiresAtMs: number } | null = null;

function createApnsProviderToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const keyId = process.env.APNS_KEY_ID!.trim();
  const teamId = process.env.APNS_TEAM_ID!.trim();
  const key = normalizeP8Key(process.env.APNS_KEY_P8!);
  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const payload = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign({
    key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${unsigned}.${base64Url(signature)}`;
  cachedToken = { value: token, expiresAtMs: (now + 50 * 60) * 1000 };
  return token;
}

export type ApnsSendResult =
  | { ok: true }
  | { ok: false; status: number; reason: string; invalidateToken: boolean };

/**
 * Send one alert notification to an APNs device token.
 * Returns invalidateToken=true for BadDeviceToken / Unregistered so callers can delete the row.
 */
export async function sendApnsNotification(
  deviceToken: string,
  payload: UserPushPayload,
  environment: ApnsEnvironment,
): Promise<ApnsSendResult> {
  if (!isApnsConfigured()) {
    return { ok: false, status: 0, reason: "APNs is not configured.", invalidateToken: false };
  }

  const token = createApnsProviderToken();
  const host = apnsHostForEnvironment(environment);
  const topic = apnsBundleId();
  const body = JSON.stringify(buildApnsPayload(payload));

  return await new Promise<ApnsSendResult>((resolve) => {
    const client = http2.connect(`https://${host}`);
    client.on("error", (err) => {
      client.close();
      resolve({
        ok: false,
        status: 0,
        reason: err instanceof Error ? err.message : "APNs connection failed.",
        invalidateToken: false,
      });
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let responseBody = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      responseBody += chunk;
    });
    req.on("end", () => {
      client.close();
      if (status === 200) {
        resolve({ ok: true });
        return;
      }
      let reason = responseBody || `HTTP ${status}`;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = parsed.reason;
      } catch {
        // keep raw body
      }
      const invalidateToken =
        reason === "BadDeviceToken" ||
        reason === "Unregistered" ||
        reason === "ExpiredToken" ||
        status === 410;
      resolve({ ok: false, status, reason, invalidateToken });
    });
    req.on("error", (err) => {
      client.close();
      resolve({
        ok: false,
        status: 0,
        reason: err instanceof Error ? err.message : "APNs request failed.",
        invalidateToken: false,
      });
    });
    req.end(body);
  });
}
