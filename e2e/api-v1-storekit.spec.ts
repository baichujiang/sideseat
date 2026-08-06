import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";
const IP = `198.51.100.${(process.pid % 200) + 110}`;
const device = {
  id: "playwright-ios-storekit-device",
  name: "Playwright StoreKit iPhone",
  appVersion: "1.0.0",
  platformVersion: "17.0",
};

function encodeSegment(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function testSignedTransaction(overrides: Record<string, unknown> = {}) {
  const transactionId = `2000000${randomBytes(4).readUInt32BE(0)}`;
  const payload = {
    transactionId,
    originalTransactionId: transactionId,
    bundleId: "app.sideseat.mobile",
    productId: "app.sideseat.support.tier1",
    purchaseDate: Date.now(),
    environment: "Xcode",
    type: "Consumable",
    ...overrides,
  };
  return {
    jws: `${encodeSegment("{}")}.${encodeSegment(JSON.stringify(payload))}.${encodeSegment("sig")}`,
    transactionId: String(payload.transactionId),
    productId: String(payload.productId),
  };
}

async function accessToken(request: APIRequestContext) {
  const response = await request.post("/api/v1/auth/login", {
    headers: { "x-forwarded-for": IP },
    data: {
      identifier: E2E_USER,
      password: E2E_PASSWORD,
      device,
    },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return payload.data.tokens.accessToken;
}

test("lists StoreKit products and idempotently acknowledges a test transaction", async ({
  request,
}) => {
  const token = await accessToken(request);

  const config = await request.get("/api/v1/client-config", {
    headers: { "x-forwarded-for": IP },
  });
  expect(config.status()).toBe(200);
  const configBody = (await config.json()) as {
    data: { features: { storeKitSupport: boolean } };
  };
  expect(configBody.data.features.storeKitSupport).toBe(true);

  const products = await request.get("/api/v1/storekit/products", {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-forwarded-for": IP,
    },
  });
  expect(products.status()).toBe(200);
  const productBody = (await products.json()) as {
    data: {
      bundleId: string;
      finishPath: string;
      products: Array<{ productId: string }>;
    };
  };
  expect(productBody.data.bundleId).toBe("app.sideseat.mobile");
  expect(productBody.data.finishPath).toBe("app");
  expect(productBody.data.products.map((p) => p.productId)).toEqual([
    "app.sideseat.support.tier1",
    "app.sideseat.support.tier3",
    "app.sideseat.support.tier5",
  ]);

  const signed = testSignedTransaction();
  const key = `storekit-${signed.transactionId}`;
  const first = await request.post("/api/v1/storekit/transactions/acknowledge", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
      "x-forwarded-for": IP,
    },
    data: { signedTransaction: signed.jws },
  });
  expect(first.status()).toBe(200);
  const firstBody = (await first.json()) as {
    data: {
      acknowledged: boolean;
      alreadyRecorded: boolean;
      finishPath: string;
      transaction: { transactionId: string; productId: string; status: string };
    };
  };
  expect(firstBody.data.acknowledged).toBe(true);
  expect(firstBody.data.alreadyRecorded).toBe(false);
  expect(firstBody.data.finishPath).toBe("app");
  expect(firstBody.data.transaction.transactionId).toBe(signed.transactionId);
  expect(firstBody.data.transaction.productId).toBe(signed.productId);
  expect(firstBody.data.transaction.status).toBe("VERIFIED");

  const replay = await request.post("/api/v1/storekit/transactions/acknowledge", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": key,
      "x-forwarded-for": IP,
    },
    data: { signedTransaction: signed.jws },
  });
  expect(replay.status()).toBe(200);
  const replayBody = (await replay.json()) as {
    data: { alreadyRecorded: boolean; transaction: { transactionId: string } };
  };
  expect(replayBody.data.transaction.transactionId).toBe(signed.transactionId);

  const duplicateKey = `storekit-dup-${signed.transactionId}`;
  const duplicate = await request.post("/api/v1/storekit/transactions/acknowledge", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": duplicateKey,
      "x-forwarded-for": IP,
    },
    data: { signedTransaction: signed.jws },
  });
  expect(duplicate.status()).toBe(200);
  const duplicateBody = (await duplicate.json()) as { data: { alreadyRecorded: boolean } };
  expect(duplicateBody.data.alreadyRecorded).toBe(true);

  const badProduct = testSignedTransaction({ productId: "com.other.tip" });
  const rejected = await request.post("/api/v1/storekit/transactions/acknowledge", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": `storekit-bad-${badProduct.transactionId}`,
      "x-forwarded-for": IP,
    },
    data: { signedTransaction: badProduct.jws },
  });
  expect(rejected.status()).toBe(403);
});
