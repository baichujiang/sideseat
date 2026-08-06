import SwiftUI

struct SupportStoreView: View {
    @Environment(SessionStore.self) private var session
    @State private var store = StoreKitManager()

    var body: some View {
        Group {
            if store.isLoading && store.catalog.isEmpty {
                SSLoadingState("Loading support options")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let issue = store.issue, store.catalog.isEmpty {
                ContentUnavailableView("Support unavailable", systemImage: "heart.slash", description: Text(issue))
            } else {
                List {
                    Section {
                        Text("Optional thanks help keep SideSeat running. These are one-time tips — not a subscription and not payment for goods or services.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Section("Choose an amount") {
                        ForEach(store.catalog) { product in
                            Button {
                                Task { await store.purchase(productID: product.productId, using: session) }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(product.displayName)
                                            .foregroundStyle(.primary)
                                        Text(product.description)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if store.purchasingProductID == product.productId {
                                        ProgressView()
                                    } else if let price = store.displayPrice(for: product.productId) {
                                        Text(price)
                                            .font(.body.weight(.semibold))
                                    } else {
                                        Text(String(format: "€%.0f", product.amountEurHint))
                                            .font(.body.weight(.semibold))
                                    }
                                }
                            }
                            .disabled(store.purchasingProductID != nil)
                            .accessibilityIdentifier("support-tier-\(product.productId)")
                        }
                    }

                    if let issue = store.issue {
                        Section {
                            Text(issue)
                                .font(.footnote)
                                .foregroundStyle(SideSeatTheme.danger)
                        }
                    }
                }
            }
        }
        .navigationTitle("Support SideSeat")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            store.startListening(using: session)
            await store.load(using: session)
        }
        .onDisappear {
            store.stopListening()
        }
        .alert("Thank you", isPresented: Binding(
            get: { store.thankYouVisible },
            set: { if !$0 { store.dismissThankYou() } }
        )) {
            Button("OK", role: .cancel) { store.dismissThankYou() }
        } message: {
            Text("Your support means a lot. There’s nothing to restore — tips are one-time only.")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("support-store")
    }
}
