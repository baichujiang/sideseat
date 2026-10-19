import SwiftUI

/// Decorative identity derived from an existing title; never changes the plan's activity or rules.
struct PlanHomeArtwork: View {
    let title: String
    var isChoosingActivity = false
    var size: CGFloat = 60

    private var photo: String? {
        let value = title.lowercased()
        if ["火锅", "火鍋", "hotpot", "hot pot"].contains(where: value.contains) { return "PlanCoverHotpot" }
        if ["羽毛球", "badminton"].contains(where: value.contains) { return "PlanCoverBadminton" }
        if ["咖啡", "coffee", "kaffee"].contains(where: value.contains) { return "PlanCoverCoffee" }
        return nil
    }

    var body: some View {
        Group {
            if !isChoosingActivity, let photo {
                Image(photo).resizable().scaledToFill()
            } else {
                VStack(spacing: SideSeatTheme.spaceXS) {
                    Image(systemName: isChoosingActivity ? "sun.max" : "sparkles")
                        .font(.title3.weight(.light))
                    Text(isChoosingActivity ? AppLocalization.string("Together") : String(title.prefix(2)))
                        .font(.caption.weight(.semibold)).lineLimit(1)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .foregroundStyle(SideSeatTheme.PlanHome.terracotta)
                .background(SideSeatTheme.PlanHome.warm)
            }
        }
        .frame(width: size, height: size).clipped()
        .clipShape(RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
        .accessibilityHidden(true)
    }
}

struct PlanHomePeople: View {
    var people: [NativeTimePollList.Person] = []
    let text: String

    var body: some View {
        HStack(spacing: SideSeatTheme.spaceXS) {
            if !people.isEmpty {
                HStack(spacing: -7) {
                    ForEach(Array(people.prefix(3).enumerated()), id: \.offset) { _, person in
                        InitialAvatar(name: person.displayName, url: person.avatarUrl, size: 24)
                            .overlay { Circle().stroke(SideSeatTheme.surface, lineWidth: 1.5) }
                    }
                }.accessibilityHidden(true)
            }
            Text(text).font(.caption).foregroundStyle(SideSeatTheme.textSecondaryStrong)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}
