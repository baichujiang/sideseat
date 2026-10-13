import Foundation
import Observation
import SwiftUI
import UIKit

enum When2meetLink {
    static let home = URL(string: "https://www.when2meet.com/")!

    static func isProvider(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https"
            && ["when2meet.com", "www.when2meet.com"].contains(url.host?.lowercased() ?? "")
            && url.user == nil && url.password == nil
            && (url.port == nil || url.port == 443)
    }

    static func eventURL(from text: String) -> URL? {
        let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value), isProvider(url),
              url.path.isEmpty || url.path == "/",
              let token = url.query?.split(separator: "&").first,
              token.range(of: #"^[0-9]+-[A-Za-z0-9]+$"#, options: .regularExpression) != nil
        else { return nil }
        return URL(string: "https://www.when2meet.com/?\(token)")
    }

    static func firstEvent(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        return detector.matches(in: text, range: NSRange(text.startIndex..., in: text))
            .compactMap { $0.url.flatMap { eventURL(from: $0.absoluteString) } }.first
    }
}

struct When2meetRecentPoll: Codable {
    let url: URL
    let title: String
}

@MainActor @Observable
final class When2meetBrowserState {
    private(set) var requestedURL: URL
    private(set) var loadID = UUID()
    var currentURL: URL?
    var isLoading = true
    var issue: String?
    #if DEBUG
    var liveSaveStatus = ""
    var liveFacts = "{}"
    #endif
    private(set) var recentPoll: When2meetRecentPoll?
    private let defaults: UserDefaults
    private let recentKey: String

    init(initialURL: URL, userID: String, defaults: UserDefaults = .standard) {
        requestedURL = initialURL
        self.defaults = defaults
        recentKey = "sideseat.when2meet.recent.\(userID)"
        if let data = defaults.data(forKey: recentKey),
           let poll = try? JSONDecoder().decode(When2meetRecentPoll.self, from: data),
           When2meetLink.eventURL(from: poll.url.absoluteString) != nil {
            recentPoll = poll
        }
    }

    var eventURL: URL? { currentURL.flatMap { When2meetLink.eventURL(from: $0.absoluteString) } }

    func open(_ url: URL) {
        requestedURL = url
        loadID = UUID()
        currentURL = nil
        issue = nil
        isLoading = true
    }

    func remember(title: String) {
        guard let url = eventURL else { return }
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let poll = When2meetRecentPoll(url: url, title: title.isEmpty ? AppLocalization.string("Time poll") : title)
        recentPoll = poll
        if let data = try? JSONEncoder().encode(poll) { defaults.set(data, forKey: recentKey) }
    }
}

/// Presentation only. The provider's create, login, selection and save functions are untouched.
@MainActor
enum When2meetAppearance {
    static func stylesheet(traits: UITraitCollection) -> String {
        func css(_ color: Color) -> String {
            let value = UIColor(color).resolvedColor(with: traits)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            value.getRed(&r, green: &g, blue: &b, alpha: &a)
            return "rgba(\(Int((r * 255).rounded())),\(Int((g * 255).rounded())),\(Int((b * 255).rounded())),\(a))"
        }
        let dark = traits.userInterfaceStyle == .dark
        let bodySize = max(14, UIFont.preferredFont(forTextStyle: .subheadline, compatibleWith: traits).pointSize)
        return """
        :root { color-scheme: \(dark ? "dark" : "light");
          --ss-bg: \(css(SideSeatTheme.bgGrouped)); --ss-surface: \(css(SideSeatTheme.surface));
          --ss-text: \(css(SideSeatTheme.textPrimary)); --ss-secondary: \(css(SideSeatTheme.textSecondaryStrong));
          --ss-line: \(css(SideSeatTheme.separator)); --ss-selection: \(css(SideSeatTheme.ControlSelection.fill));
          --ss-action: \(css(SideSeatTheme.ProductAction.fill)); --ss-on-action: \(css(SideSeatTheme.ProductAction.foreground));
          --ss-radius: \(SideSeatTheme.controlRadius)px; --ss-card-radius: \(SideSeatTheme.cardRadius)px; }
        html, body { background: var(--ss-bg) !important; color: var(--ss-text) !important;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; font-size: \(bodySize)px; }
        body { margin: 0 !important; padding: 12px !important; }
        #MenuTop { background: transparent !important; color: var(--ss-text) !important;
          display: flex; flex-wrap: wrap; padding: 0 !important; font-size: 14px; }
        #MenuTopLeft, #MenuTopRight { float: none !important; }
        #MenuTop a { color: var(--ss-text) !important; border-top: 0 !important;
          padding: 8px !important; min-height: 28px; border-radius: var(--ss-radius); }
        #MainBody { width: 100%; box-sizing: border-box; padding: 12px !important;
          background: var(--ss-surface) !important; color: var(--ss-text) !important; border-radius: var(--ss-card-radius); }
        input:not([type=hidden]), select, button { font: inherit; font-size: 16px !important;
          background: var(--ss-surface) !important; color: var(--ss-text) !important;
          border: 1px solid var(--ss-line) !important; border-radius: var(--ss-radius) !important;
          padding: 8px !important; min-height: 44px; max-width: 100%; box-sizing: border-box; }
        input[type=submit], input[type=button] { background: var(--ss-action) !important;
          color: var(--ss-on-action) !important; min-height: 50px; }
        #MainBody form > table, #MainBody form > table > tbody, #MainBody form > table > tbody > tr,
        #MainBody form > table > tbody > tr > td { display: block; width: 100%; box-sizing: border-box; }
        #WhatDates, #WhatTimes { width: 100% !important; min-width: 0 !important; float: none !important;
          display: flow-root; margin: 16px 0 !important; }
        #NewEventName { width: 100% !important; }
        #NewEventNameDiv { padding: 0 !important; font-size: 22px !important;
          white-space: normal; overflow-wrap: anywhere; }
        #TimeZone { width: 100%; }
        #ChooseTimeZone { height: auto !important; display: flow-root; margin-bottom: 16px; }
        #Calendar { font-size: 14px !important; }
        #WhatDates div:has(> #Today) { height: auto !important; margin-bottom: 16px !important; }
        #Calendar [id^=Day-] { background-color: var(--ss-bg) !important; color: var(--ss-text) !important;
          border-color: var(--ss-line) !important; }
        #Calendar [id^=Day-][style*="background-color: green"],
        #Calendar [id^=Day-][style*="background-color:green"] { background-color: var(--ss-selection) !important; }
        #AvailabilityGrids div[onselectstart] { display: block !important; width: 100% !important;
          box-sizing: border-box; margin: 16px 0; }
        .HalfPanel { white-space: normal !important; font-size: 16px !important; max-width: 100%; }
        .GroupGrid { background-color: var(--ss-surface) !important; white-space: nowrap; }
        #AvailabilityGrids div[style*="text-align:right"] { white-space: nowrap; }
        #YouGridSlots [id^=YouTime] { background: var(--ss-bg) !important; border-color: var(--ss-line) !important; }
        #YouGridSlots [id^=YouTime][style*="rgb(51, 153, 0)"],
        #YouGridSlots [id^=YouTime][style*="#339900"] { background: var(--ss-action) !important; }
        #YouAvailability td[bgcolor="#ffdede"], #YouAvailability td[bgcolor="ffdede"] { background: var(--ss-bg) !important; border-color: var(--ss-line) !important; }
        #YouAvailability td[bgcolor="#339900"], #YouAvailability td[bgcolor="339900"] { background: var(--ss-action) !important; border-color: var(--ss-line) !important; }
        .GridTitle { color: var(--ss-text) !important; font-weight: 600; }
        .GridSubtitle { color: var(--ss-secondary) !important; }
        #footer { color: var(--ss-secondary); }
        table:has(ins.adsbygoogle), table:has(ins.adsbygoogle) > tbody,
        table:has(ins.adsbygoogle) > tbody > tr, table:has(ins.adsbygoogle) > tbody > tr > td {
          display: block; width: 100% !important; box-sizing: border-box; }
        """
    }

    static func script(traits: UITraitCollection) -> String {
        let labels = ["New Event Name", "Your name", "Optional password", "My availability", "Group availability"]
            .map { AppLocalization.string($0) }
        let json = String(data: try! JSONSerialization.data(withJSONObject: [stylesheet(traits: traits), labels]), encoding: .utf8)!
        return """
        (() => {
          if (!['when2meet.com','www.when2meet.com'].includes(location.hostname)) return;
          const [css, labels] = \(json);
          let viewport = document.querySelector('meta[name="viewport"]');
          if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.appendChild(viewport); }
          viewport.content = 'width=device-width, initial-scale=1';
          let style = document.getElementById('sideseat-when2meet-appearance');
          if (!style) { style = document.createElement('style'); style.id = 'sideseat-when2meet-appearance'; document.head.appendChild(style); }
          style.textContent = css;
          const fields = [['NewEventName',labels[0]],['name',labels[1]],['password',labels[2]]];
          fields.forEach(([id,label]) => { const field = document.getElementById(id); if(field) field.setAttribute('aria-label',label); });
          if (window.sideSeatWhen2meetAccessibility) return;
          window.sideSeatWhen2meetAccessibility = true;
          // Retain the provider's touch handlers and suppress iOS's duplicate mouse event.
          // Without this, a tap selects and immediately erases the same slot.
          const refresh = () => {
            const touchGrid = document.getElementById('YouGridSlots');
            if (touchGrid && !touchGrid.sideSeatTouchAdapter) {
              touchGrid.addEventListener('touchstart', event => event.preventDefault(), {passive:false});
              touchGrid.sideSeatTouchAdapter = true;
            }
            document.querySelectorAll('#Calendar [id^="Day-"]').forEach(cell => {
              const field = document.getElementById(cell.id.replace('Day-','DateOf-'));
              if (!field) return;
              cell.setAttribute('role','button'); cell.setAttribute('aria-label',field.value);
              cell.setAttribute('aria-pressed',String(Array.isArray(window.Dates) && window.Dates.includes(field.value)));
            });
            document.querySelectorAll('[id^="YouTime"]').forEach(cell => {
              const time = Number(cell.getAttribute('data-time'));
              if (!Number.isFinite(time)) return;
              const label = new Intl.DateTimeFormat('sv-SE',{timeZone:document.getElementById('ParticipantTimeZone')?.value || 'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time * 1000));
              cell.setAttribute('role','button'); cell.setAttribute('aria-label',labels[3] + ': ' + label);
              const index = Array.isArray(window.TimeOfSlot) ? window.TimeOfSlot.indexOf(time) : -1;
              cell.setAttribute('aria-pressed',String(index >= 0 && window.AvailableAtSlot[index].includes(window.UserID)));
            });
            document.querySelectorAll('[id^="GroupTime"]').forEach(cell => {
              const time = Number(cell.id.replace('GroupTime',''));
              const index = Array.isArray(window.TimeOfSlot) ? window.TimeOfSlot.indexOf(time) : -1;
              const count = index >= 0 ? window.AvailableAtSlot[index].length : 0;
              cell.setAttribute('role','button'); cell.setAttribute('aria-label',labels[4] + ': ' + time + ', ' + count);
            });
            if (window.sideSeatWhen2meetLiveFacts) window.sideSeatWhen2meetLiveFacts();
          };
          refresh();
          const grid = document.getElementById('AvailabilityGrids') || document.getElementById('Calendar');
          if (grid) new MutationObserver(refresh).observe(grid,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
        })();
        """
    }
}
