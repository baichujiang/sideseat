import SwiftUI
import WebKit

struct When2meetSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var state: When2meetBrowserState
    @State private var showsOpenLink = false
    @State private var linkInput = ""
    @State private var share: SSSharePayload?
    @State private var copied = false

    init(userID: String, initialURL: URL = When2meetLink.home) {
        _state = State(initialValue: When2meetBrowserState(initialURL: initialURL, userID: userID))
    }

    var body: some View {
        NavigationStack {
            When2meetWebView(state: state, colorScheme: colorScheme, dynamicTypeSize: dynamicTypeSize)
                .safeAreaInset(edge: .bottom) {
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--ui-testing-when2meet-live") {
                        HStack {
                            Text(state.liveFacts).accessibilityIdentifier("when2meet-live-facts")
                            Text(state.liveSaveStatus).accessibilityIdentifier("when2meet-live-save")
                        }
                        .font(.caption2).padding(4).background(SideSeatTheme.bgGrouped)
                    }
                    #endif
                }
                .overlay(alignment: .top) {
                    if state.isLoading {
                        ProgressView(AppLocalization.string("Loading time poll"))
                            .padding(SideSeatTheme.spaceMD)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                            .accessibilityIdentifier("when2meet-loading")
                    }
                }
                .overlay {
                    if let issue = state.issue {
                        ContentUnavailableView {
                            Label("Unable to load time poll", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(issue)
                        } actions: {
                            Button("Try again") { state.open(state.currentURL ?? state.requestedURL) }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("when2meet-retry")
                        }
                        .background(SideSeatTheme.bgGrouped)
                    }
                }
                .background(SideSeatTheme.bgGrouped)
                .navigationTitle("Time poll")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Close") { dismiss() }.accessibilityIdentifier("when2meet-close")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Button("New time poll", systemImage: "calendar.badge.plus") { state.open(When2meetLink.home) }
                                .accessibilityIdentifier("when2meet-new")
                            Button("Open a poll link", systemImage: "link") { linkInput = ""; showsOpenLink = true }
                                .accessibilityIdentifier("when2meet-open-link")
                            if let poll = state.recentPoll {
                                Button { state.open(poll.url) } label: {
                                    Label(AppLocalization.string("Most recent time poll") + " · " + poll.title, systemImage: "clock")
                                }
                                .accessibilityIdentifier("when2meet-recent")
                            }
                            Divider()
                            Button(AppLocalization.string(copied ? "Copied" : "Copy poll link"), systemImage: "doc.on.doc") {
                                guard let url = state.eventURL else { return }
                                UIPasteboard.general.url = url
                                copied = true
                            }
                            .disabled(state.eventURL == nil)
                            .accessibilityIdentifier("when2meet-copy")
                            Button("Share poll link", systemImage: "square.and.arrow.up") {
                                guard let url = state.eventURL else { return }
                                share = SSSharePayload(items: [url])
                            }
                            .disabled(state.eventURL == nil)
                            .accessibilityIdentifier("when2meet-share")
                        } label: {
                            Image(systemName: "ellipsis.circle").frame(minWidth: 44, minHeight: 44)
                        }
                        .accessibilityLabel("Time poll actions")
                        .accessibilityIdentifier("when2meet-actions")
                    }
                }
                .onChange(of: state.currentURL) { _, _ in copied = false }
                .alert("Open a poll link", isPresented: $showsOpenLink) {
                    TextField("Poll link", text: $linkInput)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                    Button("Cancel", role: .cancel) {}
                    Button("Open") {
                        if let url = When2meetLink.eventURL(from: linkInput) { state.open(url) }
                    }
                    .disabled(When2meetLink.eventURL(from: linkInput) == nil)
                } message: { Text("Paste a When2meet event link.") }
                .sheet(item: $share) { SSActivityView(items: $0.items) }
        }
        .accessibilityIdentifier("when2meet-sheet")
    }
}

private struct When2meetWebView: UIViewControllerRepresentable {
    let state: When2meetBrowserState
    let colorScheme: ColorScheme
    let dynamicTypeSize: DynamicTypeSize

    func makeUIViewController(context: Context) -> When2meetWebController { When2meetWebController(state: state) }

    func updateUIViewController(_ controller: When2meetWebController, context: Context) {
        controller.update(appearance: colorScheme)
    }

    static func dismantleUIViewController(_ controller: When2meetWebController, coordinator: ()) { controller.stop() }
}

@MainActor
private final class When2meetWebController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    let state: When2meetBrowserState
    private var webView: WKWebView!
    private var loadedID: UUID?
    private var injectedScript = ""

    init(state: When2meetBrowserState) { self.state = state; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func loadView() {
        webView = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.accessibilityIdentifier = "when2meet-browser"
        #if DEBUG
        webView.isInspectable = true
        if ProcessInfo.processInfo.arguments.contains("--ui-testing-when2meet-live") {
            webView.configuration.userContentController.add(self, name: "when2meetLive")
        }
        #endif
        view = webView
    }

    func update(appearance: ColorScheme) {
        loadViewIfNeeded()
        overrideUserInterfaceStyle = appearance == .dark ? .dark : .light
        let script = When2meetAppearance.script(traits: traitCollection)
        if script != injectedScript {
            injectedScript = script
            webView.configuration.userContentController.removeAllUserScripts()
            webView.configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("--ui-testing-when2meet-live") {
                webView.configuration.userContentController.addUserScript(WKUserScript(source: Self.liveObservationScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            }
            #endif
            if webView.url != nil { webView.evaluateJavaScript(script, completionHandler: nil) }
        }
        if loadedID != state.loadID {
            loadedID = state.loadID
            webView.load(URLRequest(url: state.requestedURL))
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if When2meetLink.isProvider(url) {
            if navigationAction.targetFrame == nil { webView.load(navigationAction.request); decisionHandler(.cancel) }
            else { decisionHandler(.allow) }
        } else {
            if navigationAction.navigationType == .linkActivated { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        state.isLoading = true; state.issue = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        state.isLoading = false
        state.currentURL = webView.url
        webView.evaluateJavaScript("document.getElementById('NewEventNameDiv')?.textContent || document.title") { [weak self] result, _ in
            guard let self, let title = result as? String else { return }
            self.state.remember(title: title)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    private func failed(_ error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        state.isLoading = false; state.issue = error.localizedDescription
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) {
        let alert = UIAlertController(title: "When2meet", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: AppLocalization.string("OK"), style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func stop() {
        webView.stopLoading()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "when2meetLive")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        #if DEBUG
        guard message.frameInfo.isMainFrame,
              ["when2meet.com", "www.when2meet.com"].contains(message.frameInfo.securityOrigin.host),
              let payload = message.body as? [String: Any], let kind = payload["kind"] as? String else { return }
        if kind == "facts", let value = payload["value"] as? String { state.liveFacts = value }
        if kind == "save", let value = payload["value"] as? String { state.liveSaveStatus = value }
        #endif
    }

    #if DEBUG
    /// Test observations only: returns the original fetch Promise and does not change provider requests.
    private static let liveObservationScript = """
    (() => {
      if (!['when2meet.com','www.when2meet.com'].includes(location.hostname)) return;
      const send = (kind,value) => window.webkit.messageHandlers.when2meetLive.postMessage({kind,value});
      let saveRequests = 0;
      let previewObserved = false, previewVisible = false;
      window.sideSeatWhen2meetLiveFacts = () => {
        const slots = Array.isArray(window.AvailableAtSlot) ? window.AvailableAtSlot : [];
        if (window.IsMouseDown && window.ChangeToAvailable) {
          const provisional = document.querySelector('#YouGridSlots [aria-pressed=false][style*="rgb(51, 153, 0)"]');
          const legend = document.querySelector('#YouAvailability td[bgcolor="#339900"]');
          if (provisional && legend) {
            previewObserved = true;
            previewVisible = getComputedStyle(provisional).backgroundColor === getComputedStyle(legend).backgroundColor;
          }
        }
        send('facts',JSON.stringify({own:slots.filter(ids=>ids.includes(window.UserID)).length,
          maximum:Math.max(0,...slots.map(ids=>ids.length)),participants:Array.isArray(window.AvailableIDs)?window.AvailableIDs.length:0,
          event:location.search, styled:!!document.getElementById('sideseat-when2meet-appearance'),saveRequests,previewObserved,previewVisible}));
      };
      window.sideSeatWhen2meetLiveFacts();
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        const result = originalFetch(...args);
        const url = new URL(typeof args[0] === 'string' ? args[0] : args[0].url,location.href);
        if (url.origin === location.origin && url.pathname.endsWith('/SaveTimes.php')) {
          saveRequests += 1;
          window.sideSeatWhen2meetLiveFacts();
          send('save','pending');
          result.then(response=>send('save',String(response.status)),()=>send('save','network-error'));
        }
        return result;
      };
    })();
    """
    #endif
}

/// Keeps provider links in chat messages inside the same native presentation.
struct When2meetMessageContent: View {
    @Environment(SessionStore.self) private var session
    let text: String
    @State private var showsPoll = false

    var body: some View {
        VStack(alignment: .leading, spacing: SideSeatTheme.spaceSM) {
            Text(text)
            if let url = When2meetLink.firstEvent(in: text) {
                Button { showsPoll = true } label: {
                    Label("Open time poll", systemImage: "calendar.badge.clock")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, SideSeatTheme.spaceMD)
                        .frame(minHeight: 44)
                        .background(SideSeatTheme.ControlSelection.fill, in: RoundedRectangle(cornerRadius: SideSeatTheme.controlRadius))
                }
                .buttonStyle(SSPressButtonStyle())
                .accessibilityIdentifier("when2meet-message-link")
                .sheet(isPresented: $showsPoll) { When2meetSheet(userID: session.currentUser?.id ?? "guest", initialURL: url) }
            }
        }
    }
}
