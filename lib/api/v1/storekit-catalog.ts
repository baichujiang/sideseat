import "server-only";

export const STOREKIT_BUNDLE_ID = "app.sideseat.mobile";

export type StoreKitProductTier = {
  productId: string;
  displayName: string;
  description: string;
  /** Display-only EUR hint; StoreKit localizes the real price. */
  amountEurHint: number;
};

/** Fixed consumable tip tiers — same IDs in App Store Connect and StoreKit Configuration. */
export const STOREKIT_SUPPORT_PRODUCTS: readonly StoreKitProductTier[] = [
  {
    productId: "app.sideseat.support.tier1",
    displayName: "Support SideSeat",
    description: "Optional thanks — not payment for goods or services.",
    amountEurHint: 1,
  },
  {
    productId: "app.sideseat.support.tier3",
    displayName: "Support SideSeat",
    description: "Optional thanks — not payment for goods or services.",
    amountEurHint: 3,
  },
  {
    productId: "app.sideseat.support.tier5",
    displayName: "Support SideSeat",
    description: "Optional thanks — not payment for goods or services.",
    amountEurHint: 5,
  },
] as const;

const PRODUCT_IDS = new Set(STOREKIT_SUPPORT_PRODUCTS.map((product) => product.productId));

export function isAllowedStoreKitProductId(productId: string): boolean {
  return PRODUCT_IDS.has(productId);
}

export function isStoreKitSupportEnabled(): boolean {
  const flag = process.env.STOREKIT_SUPPORT_ENABLED?.trim();
  if (flag === "0") return false;
  if (flag === "1") return true;
  // Default on for local/dev; production stays off until App Store products exist.
  return process.env.NODE_ENV !== "production";
}
