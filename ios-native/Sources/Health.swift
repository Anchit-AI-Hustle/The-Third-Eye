import SwiftUI

// Health Engine, as on the website (components/health): exact daily targets and an AI plan
// built to them from /api/tools/health, and a health schedule kept on the phone with the
// platforms to book events on (from the catalog).
struct HealthCatalog: Decodable {
    struct Platform: Decodable, Identifiable {
        let id: String
        let name: String
        let activities: [String]
        let format: String
        let url: String
        let blurb: String
    }

    let platforms: [Platform]
    let activities: [String: String]
}

struct HealthInput: Codable, Equatable {
    var goal = "lose"
    var focus = "both"
    var sex = "male"
    var age = 30
    var heightCm = 175
    var weightKg = 75
    var activity = "moderate"
    var pace = "steady"
    var targetWeightKg: Int?
    var dietaryPreference = ""
    var allergies = ""
    var cuisine = ""
    var mealsPerDay: Int?
    var trainingDaysPerWeek: Int?
    var sessionMinutes: Int?
    var experience = ""
    var equipment = ""
    var injuries = ""
    var conditions = ""

    var body: [String: Any] {
        var out: [String: Any] = ["goal": goal, "focus": focus, "sex": sex, "age": age, "heightCm": heightCm,
                                  "weightKg": weightKg, "activity": activity, "pace": pace]
        let optional: [String: Any?] = [
            "targetWeightKg": goal == "maintain" ? nil : targetWeightKg, "mealsPerDay": mealsPerDay,
            "trainingDaysPerWeek": trainingDaysPerWeek, "sessionMinutes": sessionMinutes,
            "dietaryPreference": dietaryPreference, "cuisine": cuisine, "experience": experience,
            "equipment": equipment, "injuries": injuries, "conditions": conditions,
        ]
        for (key, value) in optional {
            if let text = value as? String { if !text.isEmpty { out[key] = text } } else if let value { out[key] = value }
        }
        let list = allergies.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if !list.isEmpty { out["allergies"] = list }
        return out
    }
}

struct HealthTargets: Decodable, Equatable {
    struct Macros: Decodable, Equatable { let proteinG: Int; let fatG: Int; let carbsG: Int }
    let bmr: Int
    let tdee: Int
    let goalCalories: Int
    let dailyDeltaKcal: Int
    let estWeeklyChangeKg: Double
    let macros: Macros
    let bmi: Double
    let bmiCategory: String
    let healthyWeightRangeKg: [Double]
    let waterMl: Int
    let proteinPerKg: Double
    let etaWeeks: Double?
    let warnings: [String]
}

struct HealthEvent: Codable, Identifiable, Equatable {
    var id = "ev_\(UUID().uuidString.prefix(8).lowercased())"
    var title = ""
    var activity = "yoga"
    var format = "in_person"
    var frequency = "weekly"
    var customEveryDays = 2
    var durationMin = 60
    var time = "07:00"
    var url = ""

    /// As lib/health/events describeSchedule.
    var schedule: String {
        let hours = Double(durationMin) / 60
        let dur = durationMin > 0 ? " · \(durationMin % 60 == 0 ? String(Int(hours)) : String(format: "%.1f", hours))h" : ""
        let at = time.isEmpty ? "" : " at \(time)"
        switch frequency {
        case "once": return "One-time\(at)\(dur)"
        case "daily": return "Every day\(at)\(dur)"
        case "monthly": return "Monthly\(at)\(dur)"
        case "custom": return "Every \(customEveryDays) days\(at)\(dur)"
        default: return "Weekly\(at)\(dur)"
        }
    }
}

@MainActor
final class HealthModel: ObservableObject {
    private static let inputKey = "health:lastInput"
    private static let eventsKey = "health-events:subscriptions"

    @Published var input: HealthInput
    @Published private(set) var targets: HealthTargets?
    @Published private(set) var plan: String?
    @Published private(set) var provider = ""
    @Published private(set) var loading = false
    @Published var error: String?
    @Published var events: [HealthEvent] { didSet { Self.save(events, Self.eventsKey) } }

    init() {
        input = Self.load(Self.inputKey) ?? HealthInput()
        events = Self.load(Self.eventsKey) ?? []
    }

    private static func load<T: Decodable>(_ key: String) -> T? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(T.self, from: $0) }
    }

    private static func save<T: Encodable>(_ value: T, _ key: String) {
        if let data = try? JSONEncoder().encode(value) { UserDefaults.standard.set(data, forKey: key) }
    }

    func generate() async {
        loading = true
        error = nil
        plan = nil
        defer { loading = false }
        Self.save(input, Self.inputKey)
        struct Reply: Decodable { let targets: HealthTargets; let plan: String?; let provider: String?; let warning: String? }
        do {
            let reply = try await API.call("POST", "/api/tools/health", json: input.body, as: Reply.self)
            targets = reply.targets
            plan = reply.plan
            provider = reply.provider ?? ""
            error = reply.warning
            if let plan = reply.plan, !plan.isEmpty {
                let inputs = [("Goal", input.goal), ("Focus", input.focus), ("Activity", input.activity), ("Diet", input.dietaryPreference)]
                    .filter { !$0.1.isEmpty }.map { Generation.Input(label: $0.0, value: $0.1) }
                GenerationStore.shared.add(app: "health", tool: "health", appLabel: "Health Engine",
                                           title: "Health plan: \(input.goal) · \(input.focus)", kind: "markdown", inputs: inputs, output: plan)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HealthStudioView: View {
    @StateObject private var model = HealthModel()
    @ObservedObject private var catalog = Catalog.shared
    @State private var tab = 0
    @State private var fineTune = false
    @State private var adding: HealthEvent?
    @State private var activityFilter = "all"
    @State private var formatFilter = "all"

    private var labels: [String: String] { catalog.data?.health?.activities ?? [:] }
    private func label(_ activity: String) -> String { labels[activity] ?? activity.capitalized }

    var body: some View {
        Form {
            Section {
                Picker("View", selection: $tab) {
                    Text("Plan").tag(0)
                    Text("Events & classes").tag(1)
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.clear)
            if tab == 0 { planTab } else { eventsTab }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Health Engine")
        .navigationBarTitleDisplayMode(.inline)
        .task { await catalog.load() }
        .sheet(item: $adding) { event in AddHealthEvent(event: event, labels: labels) { model.events.insert($0, at: 0) } }
    }

    // MARK: Plan

    @ViewBuilder
    private var planTab: some View {
        Section("Your goal") {
            Picker("Goal", selection: $model.input.goal) {
                Text("Lose weight").tag("lose")
                Text("Maintain").tag("maintain")
                Text("Gain / build").tag("gain")
            }
            .pickerStyle(.segmented)
            Picker("Focus", selection: $model.input.focus) {
                Text("Nutrition").tag("nutrition")
                Text("Exercise").tag("exercise")
                Text("Both").tag("both")
            }
            .pickerStyle(.segmented)
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section("Basics") {
            Picker("Sex", selection: $model.input.sex) {
                Text("Male").tag("male")
                Text("Female").tag("female")
            }
            Stepper("Age: \(model.input.age)", value: $model.input.age, in: 13...100)
            Stepper("Height: \(model.input.heightCm) cm", value: $model.input.heightCm, in: 90...260)
            Stepper("Weight: \(model.input.weightKg) kg", value: $model.input.weightKg, in: 25...400)
            Picker("Activity", selection: $model.input.activity) {
                Text("Sedentary (desk)").tag("sedentary")
                Text("Light (1-3 d/wk)").tag("light")
                Text("Moderate (3-5 d/wk)").tag("moderate")
                Text("Active (6-7 d/wk)").tag("active")
                Text("Very active / athlete").tag("very_active")
            }
            Toggle("Fine-tune (optional)", isOn: $fineTune)
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        if fineTune { fineTuneSection }

        Section {
            Button {
                Task { await model.generate() }
            } label: {
                if model.loading { ProgressView() } else { Text("Generate my plan") }
            }
            .buttonStyle(GlowButtonStyle())
            .disabled(model.loading)
            if let error = model.error {
                Text(error).font(.system(size: 12)).foregroundStyle(Theme.amber)
            }
        }
        .listRowBackground(Color.clear)

        if let t = model.targets {
            Section("Your daily targets (computed, exact)") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 80), alignment: .leading)], alignment: .leading, spacing: 12) {
                    stat("Calories", "\(t.goalCalories)", "\(t.dailyDeltaKcal >= 0 ? "+" : "")\(t.dailyDeltaKcal) vs maint.", Theme.green)
                    stat("Protein", "\(t.macros.proteinG)g", "\(t.proteinPerKg.formatted()) g/kg", Theme.blue)
                    stat("Fat", "\(t.macros.fatG)g", nil, Theme.amber)
                    stat("Carbs", "\(t.macros.carbsG)g", nil, Theme.violet)
                    stat("BMR", "\(t.bmr)", nil, nil)
                    stat("TDEE", "\(t.tdee)", nil, nil)
                    stat("BMI", t.bmi.formatted(), t.bmiCategory, nil)
                    stat("Water", String(format: "%.1fL", Double(t.waterMl) / 1000), nil, nil)
                }
                if t.healthyWeightRangeKg.count == 2 {
                    Text("Healthy weight for your height: \(t.healthyWeightRangeKg[0].formatted())-\(t.healthyWeightRangeKg[1].formatted()) kg"
                         + (t.estWeeklyChangeKg != 0 ? " · ~\(abs(t.estWeeklyChangeKg).formatted()) kg/week" : "")
                         + (t.etaWeeks.map { " · ~\($0.formatted()) weeks to target" } ?? ""))
                        .font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
                ForEach(t.warnings, id: \.self) { Text("• \($0)").font(.system(size: 11)).foregroundStyle(Theme.amber) }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }

        if let plan = model.plan {
            Section {
                HStack {
                    Text(model.provider.isEmpty ? "Your plan" : "Your plan · via \(model.provider)").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.green)
                    Spacer()
                    ShareLink(item: plan) { Image(systemName: "square.and.arrow.up") }
                }
                MarkdownView(text: plan)
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    @ViewBuilder
    private var fineTuneSection: some View {
        Section("Fine-tune") {
            if model.input.goal != "maintain" {
                optionalNumber("Target weight (kg)", \.targetWeightKg)
                Picker("Pace", selection: $model.input.pace) {
                    Text("Relaxed").tag("relaxed")
                    Text("Steady").tag("steady")
                    Text("Aggressive").tag("aggressive")
                }
            }
            if model.input.focus != "exercise" {
                TextField("Dietary preference (veg, vegan, keto, jain, halal…)", text: $model.input.dietaryPreference)
                TextField("Allergies (comma-separated)", text: $model.input.allergies)
                TextField("Cuisine (e.g. North Indian)", text: $model.input.cuisine)
                optionalNumber("Meals per day", \.mealsPerDay)
            }
            if model.input.focus != "nutrition" {
                optionalNumber("Training days per week", \.trainingDaysPerWeek)
                optionalNumber("Session length (min)", \.sessionMinutes)
                Picker("Experience", selection: $model.input.experience) {
                    Text("-").tag("")
                    Text("Beginner").tag("beginner")
                    Text("Intermediate").tag("intermediate")
                    Text("Advanced").tag("advanced")
                }
                TextField("Equipment (home / gym / bodyweight)", text: $model.input.equipment)
                TextField("Injuries / cautions", text: $model.input.injuries)
            }
            TextField("Medical conditions (planned cautiously)", text: $model.input.conditions)
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func optionalNumber(_ label: String, _ path: WritableKeyPath<HealthInput, Int?>) -> some View {
        HStack {
            Text(label)
            Spacer()
            TextField("-", text: Binding(
                get: { model.input[keyPath: path].map(String.init) ?? "" },
                set: { model.input[keyPath: path] = Int($0.filter(\.isNumber)) }
            ))
            .keyboardType(.numberPad)
            .multilineTextAlignment(.trailing)
            .frame(width: 80)
        }
    }

    private func stat(_ label: String, _ value: String, _ sub: String?, _ color: Color?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 18, weight: .bold)).foregroundStyle(color ?? .primary)
            Text(label.uppercased()).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
            if let sub { Text(sub).font(.system(size: 10)).foregroundStyle(Theme.muted) }
        }
    }

    // MARK: Events

    @ViewBuilder
    private var eventsTab: some View {
        Section {
            if model.events.isEmpty {
                Text("Nothing scheduled yet. Add a class, run or game, daily, weekly or any rhythm; it's kept on this phone.")
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            ForEach(model.events) { event in
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(event.title).font(.system(size: 15, weight: .semibold))
                        Spacer()
                        if let url = URL(string: event.url), !event.url.isEmpty {
                            Link(destination: url) { Image(systemName: "arrow.up.right.square") }
                        }
                    }
                    HStack(spacing: 6) {
                        Text(label(event.activity)).font(.system(size: 11)).foregroundStyle(Theme.green)
                        Image(systemName: event.format == "online" ? "wifi" : "mappin").font(.system(size: 10)).foregroundStyle(Theme.muted)
                    }
                    Text(event.schedule).font(.system(size: 12)).foregroundStyle(Theme.secondary)
                }
            }
            .onDelete { model.events.remove(atOffsets: $0) }
            Button("Add an event") { adding = HealthEvent() }
        } header: { Text("My health schedule") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            Picker("Activity", selection: $activityFilter) {
                Text("All").tag("all")
                ForEach(labels.keys.sorted(), id: \.self) { Text(label($0)).tag($0) }
            }
            Picker("Format", selection: $formatFilter) {
                Text("Any").tag("all")
                Text("In-person").tag("in_person")
                Text("Online").tag("online")
            }
            .pickerStyle(.segmented)
            let platforms = (catalog.data?.health?.platforms ?? []).filter {
                (activityFilter == "all" || $0.activities.contains(activityFilter))
                    && (formatFilter == "all" || $0.format == formatFilter || $0.format == "both")
            }
            if catalog.data != nil, catalog.data?.health == nil {
                Text("Update needed: the server's catalog has no event platforms yet.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            ForEach(platforms) { p in
                if let url = URL(string: p.url) {
                    Link(destination: url) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(p.name).font(.system(size: 14, weight: .semibold)).foregroundStyle(.primary)
                            Text(p.blurb).font(.system(size: 12)).foregroundStyle(Theme.muted)
                            Text((p.activities.prefix(4).map(label) + [p.format == "both" ? "in-person + online" : p.format == "online" ? "online" : "in-person"]).joined(separator: " · "))
                                .font(.system(size: 10)).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            Text("Live timings, slots and prices are on each provider when you open it. We link out; we don't book for you.")
                .font(.system(size: 11)).foregroundStyle(Theme.muted)
        } header: { Text("Find & book events") }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

private struct AddHealthEvent: View {
    @State var event: HealthEvent
    let labels: [String: String]
    let onAdd: (HealthEvent) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var time = Date()

    var body: some View {
        NavigationStack {
            Form {
                TextField("Event name (e.g. Morning yoga)", text: $event.title)
                Picker("Activity", selection: $event.activity) {
                    ForEach(labels.keys.sorted(), id: \.self) { Text(labels[$0] ?? $0).tag($0) }
                }
                Picker("Format", selection: $event.format) {
                    Text("In-person").tag("in_person")
                    Text("Online").tag("online")
                }
                Picker("Repeats", selection: $event.frequency) {
                    Text("One-time").tag("once")
                    Text("Daily").tag("daily")
                    Text("Weekly").tag("weekly")
                    Text("Monthly").tag("monthly")
                    Text("Custom").tag("custom")
                }
                if event.frequency == "custom" {
                    Stepper("Every \(event.customEveryDays) days", value: $event.customEveryDays, in: 2...60)
                }
                Stepper("Duration: \(event.durationMin) min", value: $event.durationMin, in: 15...480, step: 15)
                DatePicker("Time", selection: $time, displayedComponents: .hourAndMinute)
                TextField("Booking link (optional)", text: $event.url)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
            }
            .navigationTitle("Add an event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        let parts = Calendar.current.dateComponents([.hour, .minute], from: time)
                        event.time = String(format: "%02d:%02d", parts.hour ?? 7, parts.minute ?? 0)
                        event.title = event.title.trimmingCharacters(in: .whitespaces)
                        onAdd(event)
                        dismiss()
                    }
                    .disabled(event.title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear {
                time = Calendar.current.date(bySettingHour: 7, minute: 0, second: 0, of: Date()) ?? Date()
            }
        }
    }
}
