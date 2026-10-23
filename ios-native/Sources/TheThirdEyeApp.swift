import SwiftUI
import UserNotifications

@main
struct TheThirdEyeApp: App {
    @StateObject private var session = Session()
    @StateObject private var app = AppState()

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

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var phase

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
        .onChange(of: phase) { _, phase in
            if phase == .active, session.state == .signedIn { Task { await Reminders.sync() } }
        }
    }
}

// The same five tabs as the website's phone layout.
struct MainTabs: View {
    @EnvironmentObject private var app: AppState

    var body: some View {
        TabView(selection: $app.tab) {
            TodayView()
                .tabItem { Label("Today", systemImage: "square.grid.2x2") }
                .tag(AppState.Tab.today)
            AssistantView()
                .tabItem { Label("Assistant", systemImage: "bubble.left") }
                .tag(AppState.Tab.assistant)
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checkmark.square") }
                .tag(AppState.Tab.tasks)
            NotesView()
                .tabItem { Label("Notes", systemImage: "doc.text") }
                .tag(AppState.Tab.notes)
            MoreView()
                .tabItem { Label("More", systemImage: "line.3.horizontal") }
                .tag(AppState.Tab.more)
        }
    }
}
