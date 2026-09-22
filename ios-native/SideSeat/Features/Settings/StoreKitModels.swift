import Foundation

struct NativeStoreKitProduct: Decodable, Identifiable, Hashable, Sendable {
    let productId: String
    let displayName: String
    let description: String
    let amountEurHint: Double

    var id: String { productId }
}

struct NativeStoreKitProductsPayload: Decodable, Sendable {
    let bundleId: String
    let finishPath: String
    let products: [NativeStoreKitProduct]
}

struct NativeStoreKitAcknowledgeRequest: Encodable, Sendable {
    let signedTransaction: String
}

struct NativeStoreKitAcknowledgePayload: Decodable, Sendable {
    let acknowledged: Bool
    let alreadyRecorded: Bool
    let finishPath: String
    let transaction: NativeStoreKitRecordedTransaction
}

struct NativeStoreKitRecordedTransaction: Decodable, Sendable {
    let id: String
    let transactionId: String
    let productId: String
    let environment: String
    let purchaseDate: String
    let status: String
}

enum StoreKitProductIDs {
    /// Finish path: app calls `Transaction.finish()` only after server acknowledge succeeds.
    static let finishPath = "app"

    static let all: [String] = [
        "app.sideseat.support.tier1",
        "app.sideseat.support.tier3",
        "app.sideseat.support.tier5"
    ]
}
