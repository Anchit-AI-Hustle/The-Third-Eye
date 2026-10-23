import SwiftUI

// Saved multi-step automations the assistant runs on command, like the website's
// Skills page. Kept on this phone.
struct Skill: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var description: String?
    var steps: [String]
    let createdAt: String
    var updatedAt: String
}

struct SkillTemplate: Identifiable {
    let name: String
    let description: String
    let steps: [String]
    var id: String { name }
}

@MainActor
final class SkillStore: ObservableObject {
    static let shared = SkillStore()
    static let cap = 200

    static let starters = [
        SkillTemplate(name: "Morning kickoff", description: "Start the day", steps: ["Summarise my urgent tasks and anything overdue", "Read my unread emails and flag anything needing a reply", "Give me today's calendar", "Suggest my top 3 priorities"]),
        SkillTemplate(name: "Inbox to tasks", description: "Turn email into action", steps: ["Scan my recent unread emails", "Create tasks for anything that needs an action, with due dates", "Draft replies for the ones I just need to acknowledge"]),
        SkillTemplate(name: "Follow-up sweep", description: "Chase open threads", steps: ["Find tasks assigned to others that are overdue", "Draft a short, polite follow-up message for each", "List them for my approval before sending"]),
    ]

    @Published private(set) var skills: [Skill]

    private init() {
        skills = LocalStore.read(LocalFile.skills, as: [Skill].self) ?? []
    }

    /// A new skill goes first; an existing one is changed in place.
    func save(id: String?, name: String, description: String?, steps: [String]) {
        let now = Fmt.now()
        if let id, let index = skills.firstIndex(where: { $0.id == id }) {
            skills[index].name = name
            skills[index].description = description
            skills[index].steps = steps
            skills[index].updatedAt = now
        } else {
            let skill = Skill(id: UUID().uuidString.lowercased(), name: name, description: description, steps: steps, createdAt: now, updatedAt: now)
            skills = Array(([skill] + skills).prefix(Self.cap))
        }
        LocalStore.write(LocalFile.skills, skills)
    }

    func delete(_ id: String) {
        skills.removeAll { $0.id == id }
        LocalStore.write(LocalFile.skills, skills)
    }

    func reset() {
        skills = []
        LocalStore.remove(LocalFile.skills)
    }

    /// The instruction the assistant runs, word for word the website's composeSkillRun.
    static func composeRun(_ skill: Skill) -> String {
        let steps = skill.steps
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .enumerated()
            .map { "\($0.offset + 1). \($0.element.trimmingCharacters(in: .whitespacesAndNewlines))" }
            .joined(separator: "\n")
        return [
            "Run my saved automation \"\(skill.name)\".",
            (skill.description ?? "").isEmpty ? "" : "Goal: \(skill.description ?? "")",
            "Do these steps in order, using your tools. Pause for my approval on anything sensitive (payments, emails, messages). If a step can't be done, say so and continue with the rest.",
            "",
            steps,
        ]
        .filter { !$0.isEmpty }
        .joined(separator: "\n")
    }
}

struct SkillsView: View {
    @EnvironmentObject private var app: AppState
    @ObservedObject private var store = SkillStore.shared
    @State private var editing: Skill?
    @State private var creating = false
    @State private var deleting: Skill?

    var body: some View {
        List {
            Section {
                Text("Save multi-step automations your assistant runs on command. It does each step with its tools and pauses for your approval on anything sensitive.")
                    .font(.system(size: 13)).foregroundStyle(Theme.secondary)
            }
            .listRowBackground(Color.clear)
            if store.skills.isEmpty {
                Section("Start from a template") {
                    ForEach(SkillStore.starters) { template in
                        Button {
                            store.save(id: nil, name: template.name, description: template.description, steps: template.steps)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(template.name).font(.system(size: 15, weight: .medium))
                                Text("\(template.steps.count) steps · \(template.description)").font(.system(size: 12)).foregroundStyle(Theme.muted)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                }
            }
            ForEach(store.skills) { skill in
                VStack(alignment: .leading, spacing: 8) {
                    Text(skill.name).font(.system(size: 16, weight: .semibold))
                    if let description = skill.description, !description.isEmpty {
                        Text(description).font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    ForEach(Array(skill.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 8) {
                            Text("\(index + 1).").font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.muted)
                            Text(step).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                        }
                    }
                    HStack(spacing: 10) {
                        Button { app.ask(SkillStore.composeRun(skill)) } label: { Label("Run", systemImage: "play.fill") }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        Button { editing = skill } label: { Label("Edit", systemImage: "pencil") }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        Spacer()
                        Button(role: .destructive) { deleting = skill } label: { Image(systemName: "trash") }
                            .buttonStyle(.borderless)
                            .accessibilityLabel("Delete")
                    }
                }
                .padding(.vertical, 4)
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Skills")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creating = true } label: { Image(systemName: "plus") }.accessibilityLabel("New skill")
            }
        }
        .sheet(isPresented: $creating) { SkillEditor(skill: nil) }
        .sheet(item: $editing) { SkillEditor(skill: $0) }
        .confirmationDialog("Delete this skill?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                if let deleting { store.delete(deleting.id) }
                deleting = nil
            }
        }
    }
}

struct SkillEditor: View {
    private struct Draft: Identifiable {
        let id = UUID()
        var text: String
    }

    let skill: Skill?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var description: String
    @State private var steps: [Draft]

    init(skill: Skill?) {
        self.skill = skill
        _name = State(initialValue: skill?.name ?? "")
        _description = State(initialValue: skill?.description ?? "")
        _steps = State(initialValue: (skill?.steps ?? [""]).map { Draft(text: $0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                    TextField("What it's for (optional)", text: $description)
                }
                Section("Steps, in order") {
                    ForEach($steps) { $step in
                        TextField("Describe the step", text: $step.text, axis: .vertical)
                    }
                    .onMove { steps.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { steps.remove(atOffsets: $0) }
                    Button { steps.append(Draft(text: "")) } label: { Label("Add step", systemImage: "plus") }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle(skill == nil ? "New skill" : "Edit skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .principal) { EditButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let kept = steps.map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
                        let summary = description.trimmingCharacters(in: .whitespacesAndNewlines)
                        SkillStore.shared.save(id: skill?.id, name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                               description: summary.isEmpty ? nil : summary, steps: kept)
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
