import SwiftUI

struct TaskItem: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var description: String?
    var status: String
    var priority: String
    var due_date: String?

    var done: Bool { status == "done" }
}

@MainActor
final class TasksModel: ObservableObject {
    @Published var tasks: [TaskItem] = []
    @Published var error: String?
    @Published var loaded = false

    var open: [TaskItem] { tasks.filter { !$0.done && $0.status != "cancelled" } }
    var done: [TaskItem] { tasks.filter(\.done) }

    func load() async {
        do {
            tasks = try await DataStore.list("tasks", as: TaskItem.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func add(_ title: String, priority: String) async {
        let now = ISO8601DateFormatter().string(from: Date())
        let item = TaskItem(id: UUID().uuidString.lowercased(), title: title, status: "todo", priority: priority)
        tasks.insert(item, at: 0)
        do {
            try await DataStore.insert("tasks", ["id": item.id, "title": title, "status": "todo", "priority": priority, "created_at": now, "updated_at": now])
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    func toggle(_ item: TaskItem) async {
        let status = item.done ? "todo" : "done"
        if let i = tasks.firstIndex(of: item) { tasks[i].status = status }
        do {
            try await DataStore.update("tasks", id: item.id, ["status": status, "updated_at": ISO8601DateFormatter().string(from: Date())])
        } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    func delete(_ item: TaskItem) async {
        tasks.removeAll { $0.id == item.id }
        do { try await DataStore.delete("tasks", id: item.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

struct TasksView: View {
    @StateObject private var model = TasksModel()
    @State private var draft = ""
    @State private var priority = "medium"

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        TextField("Add a task", text: $draft)
                            .submitLabel(.done)
                            .onSubmit(add)
                        Picker("Priority", selection: $priority) {
                            ForEach(["low", "medium", "high", "urgent"], id: \.self) { Text($0.capitalized) }
                        }
                        .labelsHidden()
                        .fixedSize()
                    }
                }
                if let error = model.error {
                    Section { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
                }
                Section("Open (\(model.open.count))") {
                    if model.loaded && model.open.isEmpty {
                        Text("Nothing open. Add one above, or ask the assistant.").foregroundStyle(Theme.muted)
                    }
                    ForEach(model.open) { row($0) }
                }
                if !model.done.isEmpty {
                    Section("Done (\(model.done.count))") { ForEach(model.done) { row($0) } }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Starfield())
            .navigationTitle("Tasks")
            .refreshable { await model.load() }
            .task { await model.load() }
            .overlay { if !model.loaded { ProgressView() } }
        }
    }

    private func row(_ item: TaskItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button { Task { await model.toggle(item) } } label: {
                Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(item.done ? Theme.blue : Theme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.done ? "Mark not done" : "Mark done")
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .strikethrough(item.done)
                    .foregroundStyle(item.done ? Theme.muted : .primary)
                HStack(spacing: 8) {
                    Text(item.priority.capitalized)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(item.priority == "urgent" || item.priority == "high" ? Theme.red : Theme.secondary)
                    if let due = item.due_date, !due.isEmpty {
                        Label(String(due.prefix(10)), systemImage: "calendar").font(.system(size: 11)).foregroundStyle(Theme.secondary)
                    }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        .swipeActions {
            Button(role: .destructive) { Task { await model.delete(item) } } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func add() {
        let title = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        draft = ""
        Task { await model.add(title, priority: priority) }
    }
}
