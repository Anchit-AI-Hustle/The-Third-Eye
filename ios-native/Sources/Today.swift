import SwiftUI

// Which tab is showing, and a question to hand the Assistant tab (Today's
// quick asks open the Assistant with it, like the website's Today page).
@MainActor
final class AppState: ObservableObject {
    /// One per app, so Siri and Shortcuts intents can steer the open app.
    static let shared = AppState()

    enum Tab: Hashable { case today, assistant, tasks, notes, more }
    @Published var tab: Tab = {
        switch UserDefaults.standard.string(forKey: "preview-tab") {
        case "assistant": return .assistant
        case "tasks": return .tasks
        case "notes": return .notes
        case "more": return .more
        default: return .today
        }
    }()
    @Published var pendingAsk: String?

    func ask(_ text: String) {
        pendingAsk = text
        tab = .assistant
    }

    /// Set by "Talk to The Third Eye"; the Assistant starts a hands-free call and clears it.
    @Published var pendingCall = false

    func startCall() {
        pendingCall = true
        tab = .assistant
    }
}

struct TodayView: View {
    @EnvironmentObject private var app: AppState
    @EnvironmentObject private var session: Session
    @StateObject private var tasks = TasksModel()
    @StateObject private var goals = GoalsModel()
    @StateObject private var notes = NotesModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    stats
                    quickAsks
                    section("Today's focus", systemImage: "scope") {
                        if tasks.open.isEmpty {
                            Text(tasks.loaded ? "Nothing open. Enjoy the clear day." : "Loading…").foregroundStyle(Theme.muted)
                        }
                        ForEach(tasks.open.prefix(5)) { t in
                            HStack(spacing: 10) {
                                Button { Task { await tasks.toggle(t) } } label: { Image(systemName: "circle").foregroundStyle(Theme.muted) }
                                    .buttonStyle(.plain).accessibilityLabel("Mark done")
                                Text(t.title).lineLimit(2)
                                Spacer()
                                if t.priority == "urgent" || t.priority == "high" {
                                    Text(t.priority.capitalized).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.red)
                                }
                            }
                        }
                        Button("All tasks") { app.tab = .tasks }.font(.system(size: 13))
                    }
                    if !goals.goals.isEmpty {
                        section("Goals", systemImage: "target") {
                            ForEach(goals.goals.prefix(3)) { g in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack { Text(g.title); Spacer(); Text("\(Int(g.progress * 100))%").foregroundStyle(Theme.blue) }
                                        .font(.system(size: 14))
                                    ProgressView(value: g.progress).tint(Theme.blue)
                                }
                            }
                            NavigationLink("All goals") { GoalsView() }.font(.system(size: 13))
                        }
                    }
                    if !notes.notes.isEmpty {
                        section("Recent notes", systemImage: "note.text") {
                            ForEach(notes.notes.prefix(3)) { n in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(n.title.isEmpty ? "Untitled" : n.title).font(.system(size: 14, weight: .semibold))
                                    Text(n.content ?? "").font(.system(size: 12)).foregroundStyle(Theme.secondary).lineLimit(1)
                                }
                            }
                            Button("All notes") { app.tab = .notes }.font(.system(size: 13))
                        }
                    }
                }
                .padding(16)
            }
            .background(Starfield())
            .navigationTitle("Today")
            .refreshable { await load() }
            .task { await load() }
            .reloadsOnDataChange { await load() }
        }
    }

    private func load() async {
        await tasks.load()
        await goals.load()
        await notes.load()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(greeting).font(.system(size: 26, weight: .bold))
            Text(Date.now.formatted(date: .complete, time: .omitted)).font(.system(size: 13)).foregroundStyle(Theme.secondary)
            StatusPill(text: "All systems online")
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: .now)
        let part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
        let first = session.name?.split(separator: " ").first.map(String.init)
        return first.map { "\(part), \($0)" } ?? part
    }

    private var stats: some View {
        HStack(spacing: 10) {
            stat("\(tasks.open.count)", "Open", Theme.blue)
            stat("\(tasks.open.filter { $0.priority == "urgent" || $0.priority == "high" }.count)", "Urgent", Theme.red)
            stat("\(tasks.done.count)", "Done", Theme.violet)
        }
    }

    private func stat(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 24, weight: .bold, design: .rounded)).foregroundStyle(color)
            Text(label.uppercased()).font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(1.5).foregroundStyle(Theme.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Theme.surface.opacity(0.8), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border))
    }

    private var quickAsks: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(["Give me my morning briefing", "Plan my day", "What's overdue?", "Summarise my week"], id: \.self) { q in
                    Button(q) { app.ask(q) }
                        .font(.system(size: 13))
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(Theme.surface, in: Capsule())
                        .overlay(Capsule().stroke(Theme.blue.opacity(0.3)))
                }
            }
        }
    }

    private func section<Content: View>(_ title: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title.uppercased(), systemImage: systemImage)
                .font(.system(size: 11, weight: .medium, design: .monospaced)).tracking(1.5)
                .foregroundStyle(Theme.blue)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.surface.opacity(0.8), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.border))
    }
}
