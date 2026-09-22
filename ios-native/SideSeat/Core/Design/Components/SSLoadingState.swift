import SwiftUI

/// Neutral loading affordance — secondary caption text; spinner tint is not accent/danger.
struct SSLoadingState: View {
    enum Style {
        case centered
        case inline
    }

    private let label: Text?
    private let style: Style
    private let expands: Bool

    init(_ label: LocalizedStringKey, style: Style = .centered, expands: Bool = true) {
        self.label = Text(label)
        self.style = style
        self.expands = expands
    }

    init(label: String, style: Style = .centered, expands: Bool = true) {
        self.label = Text(label)
        self.style = style
        self.expands = expands
    }

    init(style: Style = .centered, expands: Bool = true) {
        self.label = nil
        self.style = style
        self.expands = expands
    }

    var body: some View {
        VStack(spacing: style == .centered ? SideSeatTheme.spaceMD : SideSeatTheme.spaceSM) {
            ProgressView()
                .controlSize(style == .centered ? .regular : .small)
                .tint(SideSeatTheme.textSecondary)
            if let label {
                label
                    .font(SideSeatTheme.Text.footnote)
                    .foregroundStyle(SideSeatTheme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(
            maxWidth: expands ? .infinity : nil,
            maxHeight: expands && style == .centered ? .infinity : nil
        )
        .accessibilityElement(children: .combine)
    }
}

extension View {
    /// Inline `ProgressView` in toolbars/lists — avoid accent/danger tint on non-error waits.
    func ssNeutralProgressTint() -> some View {
        tint(SideSeatTheme.textSecondary)
    }

    /// Full-page states hosted by a `List` are layout containers, not content rows.
    /// Hide UIKit's row/section separators so loading-to-content transitions do not flash a line.
    func ssListPageStateRow() -> some View {
        listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
            .listSectionSeparator(.hidden)
    }
}
