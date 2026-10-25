import SwiftUI

struct SSRootTabItem<ID: Hashable> {
    let id: ID
    let title: LocalizedStringKey
    let accessibilityID: String
    var accessibilityLabel: String? = nil
}

/// Root section navigation. Pages own selection and routing; this view owns only its chrome.
struct SSRootTabs<ID: Hashable>: View {
    let items: [SSRootTabItem<ID>]
    @Binding var selection: ID

    var body: some View {
        HStack(alignment: .bottom, spacing: SideSeatTheme.spaceXS) {
            ForEach(items, id: \.id) { item in
                let selected = selection == item.id
                Button { selection = item.id } label: {
                    VStack(spacing: SideSeatTheme.spaceSM) {
                        Text(item.title)
                            .font(.subheadline.weight(selected ? .semibold : .medium))
                            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(selected ? SideSeatTheme.textPrimary : SideSeatTheme.textSecondary)
                            .frame(maxWidth: .infinity)
                        Capsule()
                            .fill(selected ? SideSeatTheme.textPrimary : .clear)
                            .frame(width: 24, height: 3)
                    }
                    .padding(.horizontal, SideSeatTheme.spaceSM)
                    .padding(.top, SideSeatTheme.spaceSM)
                    .padding(.bottom, SideSeatTheme.spaceXS)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier(item.accessibilityID)
                .accessibilityLabel(item.accessibilityLabel.map { Text(verbatim: $0) } ?? Text(item.title))
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
        .accessibilityElement(children: .contain)
    }
}
