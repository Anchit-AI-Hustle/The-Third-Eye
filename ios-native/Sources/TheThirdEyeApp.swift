import SwiftUI

@main
struct TheThirdEyeApp: App {
    @StateObject private var session = Session()
    @StateObject private var app = AppState()

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

struct RootView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.scenePhase) private var scenePhase

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
        .onChange(of: scenePhase) { _, phase in
            // Back from Safari after approving sign-in: check straight away.
            if phase == .active, session.pendingCode != nil { Task { await session.pollOnce() } }
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
