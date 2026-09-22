import Foundation

enum InboxChatSearch {
    static func matches(_ conversation: NativeInboxConversation, query: String) -> Bool {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if needle.isEmpty { return true }
        return haystack(for: conversation).contains(needle)
    }

    private static func haystack(for conversation: NativeInboxConversation) -> String {
        var parts: [String] = [
            conversation.displayName,
            conversation.previewText,
        ]
        if let peer = conversation.peer {
            parts.append(peer.username)
            if let nickname = peer.nickname { parts.append(nickname) }
        }
        if let course = conversation.course {
            parts.append(course.name)
            if let code = course.code { parts.append(code) }
            if let school = course.school { parts.append(school) }
            if let semester = course.semesterLabel { parts.append(semester) }
        }
        if let group = conversation.group {
            for participant in group.participants {
                parts.append(participant.username)
                if let nickname = participant.nickname { parts.append(nickname) }
            }
        }
        if let body = conversation.lastMessage?.body {
            parts.append(body)
        }
        return parts.joined(separator: " ").lowercased()
    }
}
