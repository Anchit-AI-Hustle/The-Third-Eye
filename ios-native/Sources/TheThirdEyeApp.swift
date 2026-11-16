import SwiftUI
import UserNotifications

@main
struct TheThirdEyeApp: App {
    @StateObject private var session = Session()
    @StateObject private var app = AppState.shared

    init() {
        PreviewMode.seed()
        UNUserNotificationCenter.current().delegate = ForegroundNotifications.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(app)
                .preferredColorScheme(.dark)
                .tint(Theme.blue)
        }
    }
}

// A reminder that comes due while the app is open still shows as a banner.
final class ForegroundNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = ForegroundNotifications()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }
}

/// The assistant greets each account aloud the first time it signs in on this device.
enum Welcome {
    static func line(name: String?, agent: String = "JARVIS") -> String {
        let greeting = name?.split(separator: " ").first.map { "Welcome to The Third Eye, " + String($0) } ?? "Welcome to The Third Eye"
        return greeting + ". I'm " + agent + ", your assistant. Ask me anything, any time."
    }

    /// The line to say now, if this account hasn't been welcomed on this device.
    static func due(email: String?, name: String?, defaults: UserDefaults = .standard) -> String? {
        guard let email, defaults.string(forKey: "preview-tab") == nil, !defaults.bool(forKey: "welcomed:\(email)") else { return nil }
        return line(name: name)
    }

    /// Recorded once it has been heard, so a welcome that never played is offered again.
    static func heard(email: String?, defaults: UserDefaults = .standard) {
        if let email { defaults.set(true, forKey: "welcomed:\(email)") }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var phase
    @StateObject private var welcome = Voice()

    var body: some View {
        Group {
            switch session.state {
            case .checking:
                ZStack {
                    Starfield()
                    ProgressView()
                }
            case .signedOut:
                SignInView()
            case .signedIn:
                MainTabs()
            }
        }
        .task { await session.refresh() }
        .onChange(of: session.state) { _, state in
            if state == .signedIn { Task { await Reminders.sync() } }
        }
        .onChange(of: session.email) { _, email in
            if session.state == .signedIn, let line = Welcome.due(email: email, name: session.name) {
                welcome.speak(line) { Welcome.heard(email: email) }
            }
        }
        .onChange(of: phase) { _, phase in
            if phase == .active, session.state == .signedIn { Task { await Reminders.sync() } }
        }
    }
}

extension View {
    /// A solid tab bar: at a list's bottom edge iOS makes it transparent, and the
    /// last rows read through it over the dark starfield. It only takes effect
    /// on each tab's own view, not on the TabView.
    func solidTabBar() -> some View {
        toolbarBackground(.visible, for: .tabBar).toolbarBackground(Theme.background, for: .tabBar)
    }
}

// The same five tabs as the website's phone layout.
struct MainTabs: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        TabView(selection: $app.tab) {
            TodayView()
                .solidTabBar()
                .tabItem { Label("Today", systemImage: "square.grid.2x2") }
                .tag(AppState.Tab.today)
            AssistantView()
                .solidTabBar()
                .tabItem { Label("Assistant", systemImage: "bubble.left") }
                .tag(AppState.Tab.assistant)
            TasksView()
                .solidTabBar()
                .tabItem { Label("Tasks", systemImage: "checkmark.square") }
                .tag(AppState.Tab.tasks)
            NotesView()
                .solidTabBar()
                .tabItem { Label("Notes", systemImage: "doc.text") }
                .tag(AppState.Tab.notes)
            MoreView()
                .solidTabBar()
                .tabItem { Label("More", systemImage: "line.3.horizontal") }
                .tag(AppState.Tab.more)
        }
    }
}
