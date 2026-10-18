import SwiftUI

// Postgres numeric columns can arrive as JSON strings.
struct Flex: Codable, Equatable {
    var value: Double
    init(_ value: Double) { self.value = value }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { value = d }
        else if let s = try? c.decode(String.self), let d = Double(s) { value = d }
        else { value = 0 }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(value)
    }
}

struct Goal: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var category: String?
    var target: Flex
    var current: Flex
    var unit: String?
    var deadline: String?

    var progress: Double { target.value > 0 ? min(1, current.value / target.value) : 0 }
}

@MainActor
final class GoalsModel: ObservableObject {
    @Published var goals: [Goal] = []
    @Published var error: String?
    @Published var loaded = false

    func load() async {
        do {
            goals = try await DataStore.list("goals", as: Goal.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func add(title: String, target: Double, unit: String, category: String) async {
        do {
            try await DataStore.insert("goals", [
                "id": UUID().uuidString.lowercased(), "title": title, "target": target, "current": 0,
                "unit": unit, "category": category, "created_at": ISO8601DateFormatter().string(from: Date()),
            ])
        } catch {
            self.error = error.localizedDescription
        }
        await load()
    }

    func setCurrent(_ goal: Goal, _ value: Double) async {
        if let i = goals.firstIndex(of: goal) { goals[i].current = Flex(value) }
        do { try await DataStore.update("goals", id: goal.id, ["current": value]) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }

    func delete(_ goal: Goal) async {
        goals.removeAll { $0.id == goal.id }
        do { try await DataStore.delete("goals", id: goal.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

struct GoalsView: View {
    @StateObject private var model = GoalsModel()
    @State private var adding = false

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
            if model.loaded && model.goals.isEmpty {
                Text("No goals yet. Tap + to set one.").foregroundStyle(Theme.muted)
            }
            ForEach(model.goals) { goal in
                GoalRow(goal: goal) { value in Task { await model.setCurrent(goal, value) } }
                    .listRowBackground(Theme.surface.opacity(0.7))
                    .swipeActions {
                        Button(role: .destructive) { Task { await model.delete(goal) } } label: { Label("Delete", systemImage: "trash") }
                    }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Goals")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("New goal")
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .overlay { if !model.loaded { ProgressView() } }
        .sheet(isPresented: $adding) {
            NewGoal { title, target, unit, category in Task { await model.add(title: title, target: target, unit: unit, category: category) } }
        }
    }
}

struct GoalRow: View {
    let goal: Goal
    let onChange: (Double) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(goal.title).font(.system(size: 16, weight: .semibold))
                Spacer()
                Text("\(Int(goal.progress * 100))%").font(.system(size: 13, weight: .medium, design: .monospaced)).foregroundStyle(Theme.blue)
            }
            ProgressView(value: goal.progress).tint(Theme.blue)
            HStack {
                Text("\(format(goal.current.value)) / \(format(goal.target.value)) \(goal.unit ?? "")")
                    .font(.system(size: 12)).foregroundStyle(Theme.secondary)
                if let category = goal.category { Text("· \(category)").font(.system(size: 12)).foregroundStyle(Theme.muted) }
                Spacer()
                Button { onChange(max(0, goal.current.value - 1)) } label: { Image(systemName: "minus.circle") }
                    .buttonStyle(.plain).accessibilityLabel("Decrease")
                Button { onChange(goal.current.value + 1) } label: { Image(systemName: "plus.circle.fill") }
                    .buttonStyle(.plain).foregroundStyle(Theme.blue).accessibilityLabel("Increase")
            }
            .font(.system(size: 20))
        }
        .padding(.vertical, 4)
    }

    private func format(_ v: Double) -> String {
        v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v)
    }
}

struct NewGoal: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var target = "10"
    @State private var unit = ""
    @State private var category = "Personal"
    let onSave: (String, Double, String, String) -> Void

    var body: some View {
        NavigationStack {
            Form {
                TextField("Goal", text: $title)
                TextField("Target", text: $target).keyboardType(.decimalPad)
                TextField("Unit (km, books, ₹…)", text: $unit)
                Picker("Category", selection: $category) {
                    ForEach(["Personal", "Health", "Career", "Finance", "Learning"], id: \.self) { Text($0) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("New goal")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(title, Double(target) ?? 0, unit, category)
                        dismiss()
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || (Double(target) ?? 0) <= 0)
                }
            }
        }
    }
}
