import SwiftUI

// The app's own record of every action it ran for the person, and a kill
// switch that stops it running any, like the website's Agent Activity page.
// Kept on this iPhone: it records what this app did.
@MainActor
final class AgentLog: ObservableObject {
    static let shared = AgentLog()

    struct Entry: Codable, Identifiable, Equatable {
        enum Outcome: String, Codable { case applied, blocked, failed }
        var id = UUID()
        let at: Date
        let label: String
        let outcome: Outcome
        var detail: String?
    }

    @Published private(set) var entries: [Entry]
    @Published var killed: Bool { didSet { UserDefaults.standard.set(killed, forKey: Self.killKey) } }

    private static let logKey = "agent-log-v1"
    private static let killKey = "agent-killed"

    private init() {
        entries = (UserDefaults.standard.data(forKey: Self.logKey)).flatMap { try? JSONDecoder().decode([Entry].self, from: $0) } ?? []
        killed = UserDefaults.standard.bool(forKey: Self.killKey)
    }

    func record(_ label: String, _ outcome: Entry.Outcome, detail: String? = nil) {
        entries.insert(Entry(at: .now, label: label, outcome: outcome, detail: detail), at: 0)
        entries = Array(entries.prefix(500))
        if let data = try? JSONEncoder().encode(entries) { UserDefaults.standard.set(data, forKey: Self.logKey) }
    }

    func clear() {
        entries = []
        UserDefaults.standard.removeObject(forKey: Self.logKey)
    }
}

struct ActivityView: View {
    @ObservedObject private var log = AgentLog.shared

    var body: some View {
        List {
            Section {
                Toggle(isOn: Binding(get: { !log.killed }, set: { log.killed = !$0 })) {
                    VStack(alignment: .leading, spacing: 3) {
                        Label(log.killed ? "Agent halted" : "Agent active", systemImage: log.killed ? "shield.slash" : "checkmark.shield")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(log.killed ? Theme.red : Theme.blue)
                        Text(log.killed
                             ? "The kill switch is on: approved actions are blocked and logged."
                             : "Actions you approve run and are logged here.")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
                .tint(Theme.blue)
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section("Log") {
                if log.entries.isEmpty {
                    Text("Nothing yet. Every action you approve in the Assistant is recorded here.").foregroundStyle(Theme.muted)
                }
                ForEach(log.entries) { e in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: e.outcome == .applied ? "checkmark.circle.fill" : e.outcome == .blocked ? "xmark.octagon" : "exclamationmark.triangle")
                            .foregroundStyle(e.outcome == .applied ? Theme.blue : Theme.red)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(e.label).font(.system(size: 14))
                            Text([e.at.formatted(date: .abbreviated, time: .shortened), e.detail ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(3)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Agent Activity")
        .toolbar {
            if !log.entries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: log.entries.map { "\($0.at.ISO8601Format())\t\($0.outcome.rawValue)\t\($0.label)\t\($0.detail ?? "")" }.joined(separator: "\n")) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Export log")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear", role: .destructive) { log.clear() }
                }
            }
        }
    }
}
