import SwiftUI

/// Existing activity tint lookup; overview cards no longer synthesize decorative covers.
enum PlanHomeArtwork {
    /// Decorative category only; the title, stored activity and planning rules remain authoritative.
    static func activityTopic(for title: String) -> NativeWeeklyIntentTopic? {
        let value = title.lowercased()
        if ["咖啡", "coffee", "kaffee"].contains(where: value.contains) { return .coffee }
        if ["自习", "学习", "复习", "研讨", "study", "library", "lernen"].contains(where: value.contains) { return .study }
        if ["火锅", "火鍋", "聚餐", "吃饭", "hotpot", "hot pot", "dinner", "lunch", "essen"].contains(where: value.contains) { return .food }
        if ["羽毛球", "运动", "跑步", "健身", "badminton", "sport", "yoga", "run"].contains(where: value.contains) { return .sports }
        if ["音乐", "电影", "演出", "music", "cinema", "concert", "movie"].contains(where: value.contains) { return .events }
        if ["逛", "散步", "徒步", "explore", "walk", "hike"].contains(where: value.contains) { return .explore }
        return nil
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
