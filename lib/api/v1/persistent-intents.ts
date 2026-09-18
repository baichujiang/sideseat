import { v1Error } from "@/lib/api/v1/http";

/** Shipped iOS builds decode the old expiry as a required Date. */
export function requirePersistentIntentSupport(request: Request) {
  if (request.headers.get("X-SideSeat-Platform") === "ios" &&
      request.headers.get("X-SideSeat-Persistent-Intent") !== "1") {
    return v1Error(request, {
      code: "CLIENT_UPDATE_REQUIRED",
      message: "Update SideSeat to use intentions without an expiry date.",
      status: 426,
    });
  }
  return null;
}
