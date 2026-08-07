import Foundation
import StoreKit

@MainActor
@Observable
final class StoreKitManager {
    private(set) var catalog: [NativeStoreKitProduct] = []
    private(set) var storeProducts: [Product] = []
    private(set) var isLoading = false
    private(set) var purchasingProductID: String?
    private(set) var issue: String?
    private(set) var thankYouVisible = false

    private var updatesTask: Task<Void, Never>?

    func startListening(using session: SessionStore) {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                guard let self else { return }
                await self.handle(update: update, using: session)
            }
        }
    }

    func stopListening() {
        updatesTask?.cancel()
        updatesTask = nil
    }

    func load(using session: SessionStore) async {
        isLoading = true
        issue = nil
        defer { isLoading = false }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            catalog = [
                NativeStoreKitProduct(
                    productId: "app.sideseat.support.tier1",
                    displayName: "Support SideSeat",
                    description: "Optional thanks — not payment for goods or services.",
                    amountEurHint: 1
                ),
                NativeStoreKitProduct(
                    productId: "app.sideseat.support.tier3",
                    displayName: "Support SideSeat",
                    description: "Optional thanks — not payment for goods or services.",
                    amountEurHint: 3
                ),
                NativeStoreKitProduct(
                    productId: "app.sideseat.support.tier5",
                    displayName: "Support SideSeat",
                    description: "Optional thanks — not payment for goods or services.",
                    amountEurHint: 5
                )
            ]
            storeProducts = []
            return
        }
        #endif

        do {
            let response: APIEnvelope<NativeStoreKitProductsPayload> = try await session.sendAuthorized(
                "api/v1/storekit/products"
            )
            catalog = response.data.products
            let ids = catalog.map(\.productId)
            storeProducts = try await Product.products(for: ids)
        } catch {
            issue = error.localizedDescription
        }
    }

    func purchase(productID: String, using session: SessionStore) async {
        guard purchasingProductID == nil else { return }
        purchasingProductID = productID
        issue = nil
        defer { purchasingProductID = nil }

        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-authenticated") {
            thankYouVisible = true
            return
        }
        #endif

        guard let product = storeProducts.first(where: { $0.id == productID }) else {
            issue = String(localized: "This support option isn’t available right now.")
            return
        }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                await handle(update: verification, using: session)
            case .userCancelled:
                break
            case .pending:
                issue = String(localized: "Purchase is pending approval. We’ll finish it when StoreKit confirms.")
            @unknown default:
                issue = String(localized: "Purchase couldn’t be completed.")
            }
        } catch {
            issue = error.localizedDescription
        }
    }

    private func handle(update: VerificationResult<Transaction>, using session: SessionStore) async {
        switch update {
        case .unverified(_, let error):
            issue = error.localizedDescription
        case .verified(let transaction):
            do {
                let jws = update.jwsRepresentation
                let _: APIEnvelope<NativeStoreKitAcknowledgePayload> = try await session.sendAuthorized(
                    "api/v1/storekit/transactions/acknowledge",
                    method: .post,
                    body: NativeStoreKitAcknowledgeRequest(signedTransaction: jws),
                    idempotencyKey: "storekit-\(transaction.id)"
                )
                await transaction.finish()
                thankYouVisible = true
            } catch {
                // Keep unfinished so Transaction.updates / launch recovery can retry.
                issue = error.localizedDescription
            }
        }
    }

    func dismissThankYou() {
        thankYouVisible = false
    }

    func displayPrice(for productID: String) -> String? {
        storeProducts.first(where: { $0.id == productID })?.displayPrice
    }
}
