import SwiftUI

@main
struct TheThirdEyeApp: App {
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
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

struct MainTabs: View {
    var body: some View {
        TabView {
            AssistantView()
                .tabItem { Label("Assistant", systemImage: "bubble.left.and.text.bubble.right") }
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checklist") }
            NotesView()
                .tabItem { Label("Notes", systemImage: "note.text") }
            MoreView()
                .tabItem { Label("More", systemImage: "square.grid.2x2") }
        }
    }
}
