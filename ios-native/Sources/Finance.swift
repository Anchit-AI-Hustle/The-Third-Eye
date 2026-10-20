import SwiftUI

struct Expense: Codable, Identifiable, Equatable {
    let id: String
    var amount: Flex
    var category: String
    var note: String?
    var spent_on: String
}

let expenseCategories = ["Food", "Groceries", "Transport", "Shopping", "Bills", "Health", "Entertainment", "Travel", "Other"]

@MainActor
final class FinanceModel: ObservableObject {
    @Published var expenses: [Expense] = []
    @Published var error: String?
    @Published var loaded = false

    static let day: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// This month's spending, as on the website's Finance page.
    var thisMonth: [Expense] {
        let prefix = String(Self.day.string(from: .now).prefix(7))
        return expenses.filter { $0.spent_on.hasPrefix(prefix) }
    }

    var monthTotal: Double { thisMonth.reduce(0) { $0 + $1.amount.value } }

    struct CategoryTotal: Identifiable { let name: String; let total: Double; var id: String { name } }

    var byCategory: [CategoryTotal] {
        Dictionary(grouping: thisMonth, by: \.category)
            .map { CategoryTotal(name: $0.key, total: $0.value.reduce(0) { $0 + $1.amount.value }) }
            .sorted { $0.total > $1.total }
    }

    func load() async {
        do {
            expenses = try await DataStore.list("expenses", as: Expense.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func save(id: String?, amount: Double, category: String, note: String, date: Date) async {
        let row: [String: Any] = ["amount": amount, "category": category, "note": note, "spent_on": Self.day.string(from: date)]
        do {
            if let id {
                try await DataStore.update("expenses", id: id, row)
            } else {
                try await DataStore.insert("expenses", row.merging(["id": UUID().uuidString.lowercased()]) { a, _ in a })
            }
        } catch {
            self.error = error.localizedDescription
        }
        await load()
    }

    func delete(_ expense: Expense) async {
        expenses.removeAll { $0.id == expense.id }
        do { try await DataStore.delete("expenses", id: expense.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

func rupees(_ value: Double) -> String {
    value.formatted(.currency(code: "INR").precision(.fractionLength(0...2)))
}

struct FinanceView: View {
    @StateObject private var model = FinanceModel()
    @State private var editing: Expense?
    @State private var adding = false

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text("THIS MONTH").font(.system(size: 11, weight: .medium, design: .monospaced)).tracking(1.5).foregroundStyle(Theme.blue)
                    Text(rupees(model.monthTotal)).font(.system(size: 30, weight: .bold, design: .rounded))
                    ForEach(model.byCategory) { c in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(c.name); Spacer(); Text(rupees(c.total)).foregroundStyle(Theme.secondary) }
                                .font(.system(size: 13))
                            ProgressView(value: model.monthTotal > 0 ? c.total / model.monthTotal : 0).tint(Theme.blue)
                        }
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(Theme.surface.opacity(0.7))

            Section("Expenses") {
                if model.loaded && model.expenses.isEmpty {
                    Text("No expenses yet. Tap + or tell the assistant \"I spent 250 on lunch\".").foregroundStyle(Theme.muted)
                }
                ForEach(model.expenses) { e in
                    Button { editing = e } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.note?.isEmpty == false ? e.note! : e.category).font(.system(size: 15, weight: .medium))
                                Text("\(e.category) · \(e.spent_on)").font(.system(size: 12)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Text(rupees(e.amount.value)).font(.system(size: 15, weight: .semibold, design: .rounded))
                        }
                    }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button(role: .destructive) { Task { await model.delete(e) } } label: { Label("Delete", systemImage: "trash") }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Finance")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add expense")
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .overlay { if !model.loaded { ProgressView() } }
        .sheet(item: $editing) { e in
            ExpenseEditor(expense: e) { a, c, n, d in Task { await model.save(id: e.id, amount: a, category: c, note: n, date: d) } }
        }
        .sheet(isPresented: $adding) {
            ExpenseEditor(expense: nil) { a, c, n, d in Task { await model.save(id: nil, amount: a, category: c, note: n, date: d) } }
        }
    }
}

struct ExpenseEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var amount: String
    @State private var category: String
    @State private var note: String
    @State private var date: Date
    let onSave: (Double, String, String, Date) -> Void

    init(expense: Expense?, onSave: @escaping (Double, String, String, Date) -> Void) {
        _amount = State(initialValue: expense.map { String(format: "%g", $0.amount.value) } ?? "")
        _category = State(initialValue: expense.map { expenseCategories.contains($0.category) ? $0.category : "Other" } ?? "Food")
        _note = State(initialValue: expense?.note ?? "")
        _date = State(initialValue: expense.flatMap { FinanceModel.day.date(from: $0.spent_on) } ?? .now)
        self.onSave = onSave
    }

    private var value: Double? { Double(amount.replacingOccurrences(of: ",", with: "")) }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Amount (₹)", text: $amount).keyboardType(.decimalPad)
                Picker("Category", selection: $category) {
                    ForEach(expenseCategories, id: \.self) { Text($0) }
                }
                TextField("What was it for?", text: $note)
                DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { if let value { onSave(value, category, note, date) }; dismiss() }
                        .disabled((value ?? 0) <= 0)
                }
            }
        }
    }
}
