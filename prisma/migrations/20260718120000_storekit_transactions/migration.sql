-- CreateTable
CREATE TABLE "StoreKitTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "originalTransactionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "verificationMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreKitTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreKitTransaction_transactionId_key" ON "StoreKitTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "StoreKitTransaction_userId_createdAt_idx" ON "StoreKitTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StoreKitTransaction_productId_createdAt_idx" ON "StoreKitTransaction"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "StoreKitTransaction" ADD CONSTRAINT "StoreKitTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
