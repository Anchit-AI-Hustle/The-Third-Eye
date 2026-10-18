import SwiftUI
import WebKit

// Screens not yet rebuilt natively open the website inside the app, signed in
// with the same session.
struct WebSection: Identifiable {
    let title: String
    let icon: String
    let path: String
    var id: String { path }
}

struct MoreView: View {
    @EnvironmentObject private var session: Session

    private let screens = [
        WebSection(title: "Today", icon: "square.grid.2x2", path: "/dashboard"),
        WebSection(title: "Knowledge", icon: "books.vertical", path: "/knowledge"),
        WebSection(title: "Goals", icon: "target", path: "/goals"),
        WebSection(title: "Finance", icon: "indianrupeesign.circle", path: "/finance"),
        WebSection(title: "Capture", icon: "camera.viewfinder", path: "/capture"),
        WebSection(title: "Apps", icon: "square.stack.3d.up", path: "/apps"),
        WebSection(title: "Activity", icon: "clock.arrow.circlepath", path: "/activity"),
        WebSection(title: "Settings", icon: "gearshape", path: "/settings"),
    ]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(screens) { screen in
                        NavigationLink {
                            WebScreen(path: screen.path)
                                .navigationTitle(screen.title)
                                .navigationBarTitleDisplayMode(.inline)
                        } label: {
                            Label(screen.title, systemImage: screen.icon)
                        }
                        .listRowBackground(Theme.surface.opacity(0.7))
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) { session.signOut() }
                        .listRowBackground(Theme.surface.opacity(0.7))
                }
            }
            .scrollContentBackground(.hidden)
            .background(Starfield())
            .navigationTitle(session.name.map { "Hi, \($0.split(separator: " ").first ?? "")" } ?? "More")
        }
    }
}

struct WebScreen: UIViewRepresentable {
    let path: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(Theme.background)
        view.scrollView.contentInsetAdjustmentBehavior = .automatic
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

    func updateUIView(_ view: WKWebView, context: Context) {}
}
