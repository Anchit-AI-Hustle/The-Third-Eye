import SwiftUI

struct Target: Hashable, Identifiable {
    let path: String
    var id: String { path }
}

// Where an href from the catalog (an App Hub entry, an agent, an audit) goes.
enum Router {
    enum Outcome: Equatable {
        case screen(String)
        case tab(AppState.Tab)
        case browser(URL)
        case dial(URL)
    }

    static func resolve(_ href: String) -> Outcome {
        if href.hasPrefix("tel:"), let url = URL(string: href) { return .dial(url) }
        if href.hasPrefix("https://") || href.hasPrefix("http://"), let url = URL(string: href) { return .browser(url) }
        switch href {
        case "/assistant": return .tab(.assistant)
        case "/tasks": return .tab(.tasks)
        case "/notes": return .tab(.notes)
        case "/today", "/dashboard": return .tab(.today)
        default: return .screen(href)
        }
    }

    static func title(_ path: String) -> String {
        (path.split(separator: "/").last.map(String.init) ?? "")
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .capitalized
    }
}

/// Lets a screen open an href: set it and the screen, tab, browser or dialer follows.
struct HrefOpener: ViewModifier {
    @EnvironmentObject private var app: AppState
    @Environment(\.openURL) private var openURL
    @Binding var href: String?
    @State private var pushed: Target?

    func body(content: Content) -> some View {
        content
            .onChange(of: href) { _, value in
                guard let value else { return }
                href = nil
                switch Router.resolve(value) {
                case .screen(let path): pushed = Target(path: path)
                case .tab(let tab): app.tab = tab
                case .browser(let url), .dial(let url): openURL(url)
                }
            }
            .navigationDestination(item: $pushed) { RouteView(path: $0.path) }
    }
}

extension View {
    func opensHrefs(_ href: Binding<String?>) -> some View { modifier(HrefOpener(href: href)) }
}

// A website path as a native screen when there is one, else the website page itself.
struct RouteView: View {
    let path: String
    var title: String?

    private var clean: String { URLComponents(string: path)?.path ?? path }

    private var query: [String: String] {
        var found: [String: String] = [:]
        for item in URLComponents(string: path)?.queryItems ?? [] {
            if let value = item.value { found[item.name] = value }
        }
        return found
    }

    var body: some View {
        switch clean {
        case "/goals": GoalsView()
        case "/finance": FinanceView()
        case "/knowledge": KnowledgeView()
        case "/lifelog": LifeLogView()
        case "/activity": ActivityView()
        case "/connectors": ConnectorsView()
        case "/tools": StudioView()
        case "/skills": SkillsView()
        case "/generations": GenerationsView()
        case "/apps": AppsView()
        case "/plans": PlansView()
        case "/capabilities": CapabilitiesView()
        case "/audit": AuditView()
        case "/settings": SettingsView()
        case "/agents": AgentsView()
        case "/kolab": KolabView()
        case "/job-agent": JobAgentView(tab: query["tab"], query: query["q"])
        default:
            if clean.hasPrefix("/tools/") {
                StudioToolRoute(id: String(clean.dropFirst("/tools/".count)), path: path)
            } else if clean.hasPrefix("/generations/") {
                GenerationRoute(id: String(clean.dropFirst("/generations/".count)))
            } else {
                web(title ?? Router.title(clean))
            }
        }
    }

    private func web(_ title: String) -> some View {
        WebScreen(path: path)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .ignoresSafeArea(edges: .bottom)
    }
}
