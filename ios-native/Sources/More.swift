import SwiftUI
import WebKit

// The website's More menu (frontend Sidebar MAIN_ITEMS + MORE_GROUPS), in the
// same groups and order. Goals is native; screens not yet rebuilt open the
// website page inside the app, signed in, without the website's own menus.
struct MenuItem: Identifiable {
    let title: String
    let icon: String
    let path: String
    var id: String { path }
}

struct MenuGroup: Identifiable {
    let title: String
    let items: [MenuItem]
    var id: String { title }
}

let moreMenu: [MenuGroup] = [
    MenuGroup(title: "Workspace", items: [
        MenuItem(title: "Knowledge", icon: "books.vertical", path: "/knowledge"),
    ]),
    MenuGroup(title: "Personal", items: [
        MenuItem(title: "Goals", icon: "target", path: "/goals"),
        MenuItem(title: "Life Log", icon: "dot.radiowaves.left.and.right", path: "/lifelog"),
        MenuItem(title: "Online Agents", icon: "person.2.wave.2", path: "/agents"),
        MenuItem(title: "Generations", icon: "clock.arrow.circlepath", path: "/generations"),
    ]),
    MenuGroup(title: "Create & Grow", items: [
        MenuItem(title: "Studio", icon: "wand.and.stars", path: "/tools"),
        MenuItem(title: "Skills", icon: "point.3.connected.trianglepath.dotted", path: "/skills"),
        MenuItem(title: "Job Agent", icon: "briefcase", path: "/job-agent"),
        MenuItem(title: "Kolab", icon: "person.3", path: "/kolab"),
    ]),
    MenuGroup(title: "Apps & Life", items: [
        MenuItem(title: "Apps", icon: "square.grid.3x3", path: "/apps"),
        MenuItem(title: "Finance", icon: "chart.bar", path: "/finance"),
    ]),
    MenuGroup(title: "Account & System", items: [
        MenuItem(title: "Plans & Credits", icon: "diamond", path: "/plans"),
        MenuItem(title: "Capabilities", icon: "sparkles", path: "/capabilities"),
        MenuItem(title: "Agent Activity", icon: "waveform.path.ecg", path: "/activity"),
        MenuItem(title: "App Audit", icon: "checkmark.shield", path: "/audit"),
        MenuItem(title: "Connectors", icon: "powerplug", path: "/connectors"),
    ]),
]

struct MoreView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        NavigationStack {
            List {
                ForEach(moreMenu) { group in
                    Section(group.title) {
                        ForEach(group.items) { item in
                            NavigationLink { destination(item) } label: { Label(item.title, systemImage: item.icon) }
                                .listRowBackground(Theme.surface.opacity(0.7))
                        }
                    }
                }
                Section("About") {
                    ForEach([MenuItem(title: "Privacy note", icon: "hand.raised", path: "/privacy"),
                             MenuItem(title: "Privacy Policy", icon: "lock.doc", path: "/privacy_policy"),
                             MenuItem(title: "Terms of Service", icon: "doc.plaintext", path: "/terms_of_service")]) { item in
                        NavigationLink { destination(item) } label: { Label(item.title, systemImage: item.icon) }
                            .listRowBackground(Theme.surface.opacity(0.7))
                    }
                }
                Section {
                    NavigationLink { destination(MenuItem(title: "Settings", icon: "gearshape", path: "/settings")) } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                    Button(role: .destructive) { session.signOut() } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Starfield())
            .navigationTitle("More")
        }
    }

    @ViewBuilder
    private func destination(_ item: MenuItem) -> some View {
        switch item.path {
        case "/goals": GoalsView()
        case "/finance": FinanceView()
        case "/knowledge": KnowledgeView()
        case "/lifelog": LifeLogView()
        case "/activity": ActivityView()
        case "/connectors": ConnectorsView()
        default:
            WebScreen(path: item.path)
                .navigationTitle(item.title)
                .navigationBarTitleDisplayMode(.inline)
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

// A website page inside the app, signed in, without the website's own menus.
// Shows a spinner while it loads and says so when it can't; links to other
// sites open in Safari instead of failing silently.
struct WebScreen: View {
    let path: String
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        WebPage(path: path, loading: $loading, failed: $failed)
            .overlay {
                if failed {
                    Text("Couldn't load this page. Check your connection and try again.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.secondary)
                        .multilineTextAlignment(.center)
                        .padding(24)
                } else if loading {
                    ProgressView().tint(Theme.blue)
                }
            }
            .background(Theme.background)
    }
}

struct WebPage: UIViewRepresentable {
    let path: String
    @Binding var loading: Bool
    @Binding var failed: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // The website hides its own menus for this user agent (MainLayout).
        config.applicationNameForUserAgent = "Mobile/15E148 TheThirdEyeApp/2"
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.background)
        view.scrollView.contentInsetAdjustmentBehavior = .automatic
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        let store = config.websiteDataStore.httpCookieStore
        let cookies = HTTPCookieStorage.shared.cookies(for: API.base) ?? []
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { view.load(URLRequest(url: API.url(path))) }
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: WebPage

        init(_ parent: WebPage) { self.parent = parent }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            parent.loading = true
            parent.failed = false
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.loading = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail(error) }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail(error) }

        private func fail(_ error: Error) {
            parent.loading = false
            if (error as NSError).code != NSURLErrorCancelled { parent.failed = true }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .allow }
            let web = ["http", "https"].contains(url.scheme ?? "")
            let elsewhere = web && url.host != API.base.host && action.navigationType == .linkActivated
            if elsewhere || !(web || ["about", "blob", "data"].contains(url.scheme ?? "")) {
                await UIApplication.shared.open(url)
                return .cancel
            }
            return .allow
        }

        // target=_blank: this site stays in the app, anything else opens in Safari.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url {
                if url.host == API.base.host { webView.load(action.request) } else { UIApplication.shared.open(url) }
            }
            return nil
        }
    }
}
