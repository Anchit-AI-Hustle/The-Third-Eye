import SwiftUI

// Kolab Creator Studio, as on the website (app/kolab/studio/(app)): the studio's eight modules,
// analytics, and profile setup with Aadhaar verification and channel linking, over
// GET /api/kolab-studio/studio and the website's mutation routes. Onboarding and the
// subscription purchase stay on the website.
struct KolabStudioData: Decodable {
    struct Pillar: Decodable, Identifiable, Equatable { let id: String; let name: String; let role: String?; let color: String? }
    struct PlanItem: Decodable, Identifiable {
        let id: String
        let pillar_id: String?
        let format: String?
        let asset_type: String?
        let date: String?
        let time: String?
        let hook: String?
        let status: String
        let done: Bool
    }
    struct Deal: Decodable, Identifiable {
        let id: String
        let brand: String?
        let emoji: String?
        let product: String?
        let category: String?
        let code: String?
        let discount: String?
        let price: String?
        let affiliate_url: String?
        let active: Bool?
    }
    struct Post: Decodable, Identifiable { let id: String; let title: String?; let scheduled_at: String?; let channels: [String]?; let publish_status: String? }
    struct Channel: Decodable { let platform: String; let handle: String? }
    struct Org: Decodable { let name: String; let type: String }
    struct Mix: Decodable { let counts: [String: Int]; let total: Int }
    struct Tracker: Decodable { let posted: Int; let total: Int; let pct: Int }
    struct Profile: Decodable, Equatable {
        let name: String
        let handle: String
        let dob: String
        let age: Int?
        let pincode: String
        let city: String
        let state: String
        let country: String
        let website_url: String
    }
    struct Account: Decodable { let kycVerified: Bool; let subscriptionActive: Bool; let privileged: Bool; let plan: String; let canPro: Bool }
    struct Analytics: Decodable {
        struct Count: Decodable { let status: String; let label: String; let n: Int }
        let activeDeals: Int
        let linkedChannels: Int
        let byStatus: [Count]
    }
    struct Reference: Decodable {
        struct Meta: Decodable { let c: String; let l: String }
        struct ChannelInfo: Decodable { let k: String; let n: String; let c: String }
        struct Blueprint: Decodable { let t: String; let steps: [String] }
        struct Step: Decodable { let n: String; let h: String; let p: String }
        struct DefaultPillar: Decodable { let name: String; let role: String }
        let statuses: [String]
        let statusLabels: [String: String]
        let assetMeta: [String: Meta]
        let channels: [ChannelInfo]
        let blueprints: [Blueprint]
        let autoSteps: [Step]
        let defaultPillars: [DefaultPillar]
    }

    let org: Org?
    let unlocked: Bool
    let reason: String?
    let pillars: [Pillar]
    let plan: [PlanItem]
    let deals: [Deal]
    let schedule: [Post]
    let channels: [Channel]
    let assetMix: Mix
    let tracker: Tracker
    let csv: String
    let profile: Profile
    let account: Account
    let analytics: Analytics
    let reference: Reference
}

@MainActor
final class KolabStudioModel: ObservableObject {
    private struct Envelope: Decodable { let data: KolabStudioData }

    @Published private(set) var data: KolabStudioData?
    @Published private(set) var busy = false
    @Published var error: String?

    func load() async {
        do {
            data = try await API.call("GET", "/api/kolab-studio/studio", as: Envelope.self).data
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    @discardableResult
    func call(_ method: String, _ path: String, _ body: [String: Any]? = nil) async -> Bool {
        await send(method, path, body) != nil
    }

    /// One mutation, then a reload, as the website's call() + router.refresh(); the reply, or nil on failure.
    func send(_ method: String, _ path: String, _ body: [String: Any]? = nil) async -> Data? {
        busy = true
        error = nil
        defer { busy = false }
        do {
            let reply = try await API.fetch(method, path, json: body)
            await load()
            return reply
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }
}

struct KolabStudioView: View {
    enum Module: String, CaseIterable, Identifiable {
        case strategy = "Strategy", calendar = "Calendar", blueprints = "Blueprints", assetMap = "Asset Map"
        case scheduler = "Scheduler", deals = "Brand Deals", automation = "Automation", tracker = "Tracker"
        case analytics = "Analytics", setup = "Profile & setup"
        var id: String { rawValue }
    }

    @StateObject private var model = KolabStudioModel()
    @State private var module = Module.strategy

    var body: some View {
        List {
            if let error = model.error {
                Text(error).font(.system(size: 13)).foregroundStyle(Theme.red).listRowBackground(Color.clear)
            }
            if let data = model.data {
                if data.org == nil {
                    webStep("Create your studio first", "Set up your Kolab organization on the website, then come back here.", path: "/kolab/studio/onboarding")
                } else if !data.unlocked {
                    Section {
                        Text(data.reason ?? "Unlock Creator Studio").font(.system(size: 15, weight: .semibold))
                        Text("Complete your profile and verify your Aadhaar here. Plans are bought on the website.").font(.system(size: 13)).foregroundStyle(Theme.muted)
                        if !data.account.subscriptionActive && !data.account.privileged { subscribeLink }
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                    KolabSetup(data: data, model: model)
                } else {
                    Section {
                        Picker("Module", selection: $module) {
                            ForEach(Module.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.menu)
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                    switch module {
                    case .strategy: KolabStrategy(data: data, model: model)
                    case .calendar: KolabCalendar(data: data, model: model)
                    case .blueprints: blueprints(data)
                    case .assetMap: assetMap(data)
                    case .scheduler: KolabScheduler(data: data, model: model)
                    case .deals: KolabDeals(data: data, model: model)
                    case .automation: automation(data)
                    case .tracker: tracker(data)
                    case .analytics: analytics(data)
                    case .setup: KolabSetup(data: data, model: model)
                    }
                }
            } else if model.error == nil {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle(model.data?.org?.name ?? "Creator Studio")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .refreshable { await model.load() }
    }

    private func webStep(_ title: String, _ detail: String, path: String) -> some View {
        Section {
            Text(title).font(.system(size: 15, weight: .semibold))
            Text(detail).font(.system(size: 13)).foregroundStyle(Theme.muted)
            NavigationLink { RouteView(path: path, title: "Kolab Studio") } label: { Label("Open on the website", systemImage: "safari") }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private var subscribeLink: some View {
        NavigationLink { RouteView(path: "/kolab/studio/subscription", title: "Kolab plans") } label: { Label("Choose a plan on the website", systemImage: "safari") }
    }

    @ViewBuilder
    private func analytics(_ data: KolabStudioData) -> some View {
        Section("Your numbers") {
            LabeledContent("Posts planned", value: "\(data.tracker.total)")
            LabeledContent("Posted", value: "\(data.tracker.posted)/\(data.tracker.total) · \(data.tracker.pct)%")
            LabeledContent("Active deals", value: "\(data.analytics.activeDeals)")
            LabeledContent("Channels linked", value: "\(data.analytics.linkedChannels)/\(data.reference.channels.count)")
            LabeledContent("Subscription", value: data.account.plan)
            LabeledContent("Identity", value: data.account.kycVerified ? "Verified" : "Pending")
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        Section("Content pipeline") {
            let top = max(1, data.analytics.byStatus.map(\.n).max() ?? 1)
            ForEach(data.analytics.byStatus, id: \.status) { c in
                HStack {
                    Text(c.label).font(.system(size: 13)).frame(width: 90, alignment: .leading)
                    GeometryReader { g in
                        RoundedRectangle(cornerRadius: 3).fill(Color(hex: "#c2f04a")).frame(width: g.size.width * CGFloat(c.n) / CGFloat(top))
                    }
                    .frame(height: 10)
                    Text("\(c.n)").font(.system(size: 12, design: .monospaced)).frame(width: 28, alignment: .trailing)
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        Section {
            ForEach(data.reference.channels, id: \.k) { c in
                LabeledContent(c.n, value: data.channels.first { $0.platform == c.k }?.handle.map { "Linked · \($0)" } ?? "Connect to see audience metrics")
            }
        } header: { Text("Channels") } footer: {
            Text("Follower, reach and engagement figures need channel sign-in, which isn't live yet, so they're left blank rather than estimated.")
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func blueprints(_ data: KolabStudioData) -> some View {
        ForEach(data.reference.blueprints, id: \.t) { b in
            Section(b.t) {
                ForEach(Array(b.steps.enumerated()), id: \.offset) { i, step in
                    Text("\(i + 1). \(step)").font(.system(size: 13))
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    private func assetMap(_ data: KolabStudioData) -> some View {
        Section("Asset & shot map") {
            if data.assetMix.total == 0 {
                Text("Build your calendar to see the asset mix.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            } else {
                ForEach(["video", "carousel", "photo", "loop"], id: \.self) { k in
                    let count = data.assetMix.counts[k] ?? 0
                    let meta = data.reference.assetMeta[k]
                    HStack {
                        Text(meta?.l ?? k).foregroundStyle(Color(hex: meta?.c ?? "#c2f04a"))
                        Spacer()
                        Text("\(count) · \(Int((Double(count) / Double(data.assetMix.total) * 100).rounded()))%").font(.system(size: 13, design: .monospaced))
                    }
                }
                Text("\(data.assetMix.total) posts planned · video is your growth engine, carousels the save layer.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func automation(_ data: KolabStudioData) -> some View {
        Section("Automation engine") {
            ForEach(data.reference.autoSteps, id: \.n) { s in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(s.n) · \(s.h)").font(.system(size: 14, weight: .semibold))
                    Text(s.p).font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    @ViewBuilder
    private func tracker(_ data: KolabStudioData) -> some View {
        Section {
            ProgressView(value: Double(data.tracker.pct), total: 100) { Text("Posted \(data.tracker.posted) / \(data.tracker.total)").font(.system(size: 12)) }
                .tint(Color(hex: "#c2f04a"))
            ShareLink(item: TailorDoc.file("\u{FEFF}" + data.csv, name: "content-tracker", ext: "csv")) { Label("Export to Excel", systemImage: "tablecells") }
                .disabled(data.tracker.total == 0)
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        Section {
            if data.plan.isEmpty { Text("Nothing to track yet. Build your calendar.").font(.system(size: 13)).foregroundStyle(Theme.muted) }
            ForEach(data.plan) { x in
                let done = x.done || x.status == "posted"
                VStack(alignment: .leading, spacing: 6) {
                    Text(x.hook ?? "(idea)").font(.system(size: 14, weight: .semibold))
                    Text([x.date, x.format].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                    HStack {
                        Picker("Status", selection: Binding(get: { x.status }, set: { s in Task { await model.call("PATCH", "/api/kolab-studio/studio/plan", ["id": x.id, "status": s]) } })) {
                            ForEach(data.reference.statuses, id: \.self) { Text(data.reference.statusLabels[$0] ?? $0).tag($0) }
                        }
                        .pickerStyle(.menu)
                        Spacer()
                        Toggle("Done", isOn: Binding(get: { done }, set: { d in Task { await model.call("PATCH", "/api/kolab-studio/studio/plan", ["id": x.id, "done": d]) } }))
                            .fixedSize()
                    }
                    .disabled(model.busy)
                }
                .opacity(done ? 0.6 : 1)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

private struct KolabStrategy: View {
    struct Row: Identifiable { let id = UUID(); var pillarId: String?; var name: String; var role: String }
    let data: KolabStudioData
    @ObservedObject var model: KolabStudioModel
    @State private var rows: [Row] = []

    var body: some View {
        Section {
            Text("Define the pillars your content rotates through. They drive your calendar, asset mix and tracker.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            ForEach($rows) { $row in
                VStack(spacing: 6) {
                    TextField("Pillar name", text: $row.name)
                    TextField("Role", text: $row.role).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                }
            }
            .onDelete { rows.remove(atOffsets: $0) }
            Button("Add pillar") { rows.append(Row(name: "New pillar", role: "")) }
            Button("Save pillars") {
                let pillars: [[String: Any]] = rows.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }.map { r in
                    var p: [String: Any] = ["name": r.name, "role": r.role]
                    if let id = r.pillarId { p["id"] = id }
                    return p
                }
                Task { await model.call("PUT", "/api/kolab-studio/studio/pillars", ["pillars": pillars]) }
            }
            .buttonStyle(GlowButtonStyle())
            .disabled(model.busy)
        } header: { Text("Content strategy") }
        .listRowBackground(Theme.surface.opacity(0.7))
        .onAppear { reset() }
        .onChange(of: data.pillars) { _, _ in reset() }
    }

    private func reset() {
        rows = data.pillars.isEmpty
            ? data.reference.defaultPillars.map { Row(name: $0.name, role: $0.role) }
            : data.pillars.map { Row(pillarId: $0.id, name: $0.name, role: $0.role ?? "") }
    }
}

private struct KolabCalendar: View {
    let data: KolabStudioData
    @ObservedObject var model: KolabStudioModel
    @State private var pillarId = ""
    @State private var format = ""
    @State private var asset = "video"
    @State private var date = Date()
    @State private var time = "19:30"
    @State private var hook = ""

    var body: some View {
        Section {
            Picker("Pillar", selection: $pillarId) {
                Text("-").tag("")
                ForEach(data.pillars) { Text($0.name).tag($0.id) }
            }
            TextField("Format (Reel · 30s)", text: $format)
            Picker("Asset", selection: $asset) {
                ForEach(["video", "carousel", "photo", "loop"], id: \.self) { Text(data.reference.assetMeta[$0]?.l ?? $0).tag($0) }
            }
            DatePicker("Date", selection: $date, displayedComponents: .date)
            TextField("Time (HH:MM)", text: $time).keyboardType(.numbersAndPunctuation)
            TextField("Hook / idea", text: $hook, axis: .vertical)
            HStack {
                Button("Add to plan") {
                    var payload: [String: Any] = ["pillar_id": pillarId.isEmpty ? NSNull() : pillarId, "format": format, "asset_type": asset, "hook": hook, "date": KolabDates.day(date)]
                    if !time.isEmpty { payload["time"] = time }
                    Task { if await model.call("POST", "/api/kolab-studio/studio/plan", payload) { hook = "" } }
                }
                .disabled(model.busy || hook.trimmingCharacters(in: .whitespaces).isEmpty)
                Spacer()
                Button("Generate starter week") { Task { await model.call("POST", "/api/kolab-studio/studio/plan", ["generate": "week"]) } }
                    .disabled(model.busy)
            }
            .buttonStyle(.borderless)
        } header: { Text("Content calendar") }
        .listRowBackground(Theme.surface.opacity(0.7))
        .onAppear { if pillarId.isEmpty { pillarId = data.pillars.first?.id ?? "" } }

        Section {
            if data.plan.isEmpty { Text("No posts planned. Add one or generate a starter week.").font(.system(size: 13)).foregroundStyle(Theme.muted) }
            ForEach(data.plan) { x in
                let pillar = data.pillars.first { $0.id == x.pillar_id }
                HStack(alignment: .top) {
                    Rectangle().fill(Color(hex: pillar?.color ?? "#c2f04a")).frame(width: 4)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(x.hook ?? "(idea)").font(.system(size: 14, weight: .semibold))
                        Text(([pillar?.name ?? "-", x.format ?? ""] + [x.date, x.time].compactMap { $0 }).filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    if let a = x.asset_type, let meta = data.reference.assetMeta[a] {
                        Text(meta.l.uppercased()).font(.system(size: 9, weight: .bold)).padding(.horizontal, 5).padding(.vertical, 2)
                            .background(Color(hex: meta.c), in: RoundedRectangle(cornerRadius: 4))
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.call("DELETE", "/api/kolab-studio/studio/plan?id=\(Fmt.query(x.id))") } } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

enum KolabDates {
    static func day(_ date: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

private struct KolabScheduler: View {
    let data: KolabStudioData
    @ObservedObject var model: KolabStudioModel
    @State private var title = ""
    @State private var date = Date()
    @State private var time = "19:30"
    @State private var picked: Set<String> = ["instagram"]

    var body: some View {
        Section {
            ForEach(data.reference.channels, id: \.k) { c in
                HStack {
                    Circle().fill(Color(hex: c.c)).frame(width: 10, height: 10)
                    Text(c.n)
                    Spacer()
                    Text(data.channels.first { $0.platform == c.k }?.handle.map { "Linked · \($0)" } ?? "Not connected").font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
            }
        } header: { Text("Channels") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            TextField("Title / caption", text: $title)
            DatePicker("Date", selection: $date, displayedComponents: .date)
            TextField("Time, IST (HH:MM)", text: $time).keyboardType(.numbersAndPunctuation)
            ForEach(data.reference.channels, id: \.k) { c in
                Toggle(c.n, isOn: Binding(get: { picked.contains(c.k) }, set: { on in if on { picked.insert(c.k) } else { picked.remove(c.k) } }))
            }
            Button("Add to queue") {
                var payload: [String: Any] = ["title": title, "channels": data.reference.channels.map(\.k).filter(picked.contains), "date": KolabDates.day(date)]
                if !time.isEmpty { payload["time"] = time }
                Task { if await model.call("POST", "/api/kolab-studio/studio/schedule", payload) { title = "" } }
            }
            .disabled(model.busy || title.trimmingCharacters(in: .whitespaces).isEmpty || picked.isEmpty)
        } header: { Text("Queue a post") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if data.schedule.isEmpty { Text("Queue is empty.").font(.system(size: 13)).foregroundStyle(Theme.muted) }
            ForEach(data.schedule) { q in
                VStack(alignment: .leading, spacing: 3) {
                    Text(q.title ?? "").font(.system(size: 14, weight: .semibold))
                    Text(([q.scheduled_at.map { Fmt.date($0) } ?? "-"] + (q.channels ?? []).map { k in data.reference.channels.first { $0.k == k }?.n ?? k }).joined(separator: " · "))
                        .font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.call("DELETE", "/api/kolab-studio/studio/schedule?id=\(Fmt.query(q.id))") } } label: { Label("Delete", systemImage: "trash") }
                }
            }
        } header: { Text("Queue") }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

private struct KolabDeals: View {
    let data: KolabStudioData
    @ObservedObject var model: KolabStudioModel
    @State private var f: [String: String] = [:]
    private let fields: [(String, String)] = [("brand", "Brand (MyProtein)"), ("emoji", "Emoji (🥤)"), ("product", "Product (Whey 1kg)"), ("category", "Category"),
                                              ("code", "Code (SAVE20)"), ("discount", "Discount (20% off)"), ("price", "Price (₹1,999)"), ("affiliate_url", "Buy / affiliate link")]

    var body: some View {
        Section {
            ForEach(fields, id: \.0) { key, label in
                TextField(label, text: Binding(get: { f[key] ?? "" }, set: { f[key] = key == "emoji" ? String($0.prefix(1)) : $0 }))
                    .textInputAutocapitalization(key == "affiliate_url" ? .never : .sentences)
            }
            Button("Add deal") {
                let payload = Dictionary(uniqueKeysWithValues: fields.map { ($0.0, f[$0.0] ?? "") })
                Task { if await model.call("POST", "/api/kolab-studio/studio/deals", payload) { f = [:] } }
            }
            .disabled(model.busy || ((f["brand"] ?? "").isEmpty && (f["product"] ?? "").isEmpty))
        } header: { Text("Brand deals & coupons") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if data.deals.isEmpty { Text("No deals yet.").font(.system(size: 13)).foregroundStyle(Theme.muted) }
            ForEach(data.deals) { x in
                HStack(alignment: .top, spacing: 12) {
                    Text(x.emoji?.isEmpty == false ? x.emoji! : "🏷️").font(.system(size: 28))
                    VStack(alignment: .leading, spacing: 3) {
                        Text([x.brand, x.category].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ").uppercased()).font(.system(size: 10)).foregroundStyle(Theme.muted)
                        Text(x.product ?? "").font(.system(size: 14, weight: .semibold))
                        HStack {
                            if let price = x.price, !price.isEmpty { Text(price).font(.system(size: 13, weight: .bold)) }
                            if let discount = x.discount, !discount.isEmpty { Text(discount).font(.system(size: 11)).foregroundStyle(Color(hex: "#c2f04a")) }
                        }
                        if let code = x.code, !code.isEmpty {
                            Button { UIPasteboard.general.string = code } label: { Text(code).font(.system(size: 12, design: .monospaced)) }.buttonStyle(.borderless)
                        }
                        if let link = x.affiliate_url, let url = URL(string: link), !link.isEmpty { Link("Buy link", destination: url).font(.system(size: 12)) }
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.call("DELETE", "/api/kolab-studio/studio/deals?id=\(Fmt.query(x.id))") } } label: { Label("Delete", systemImage: "trash") }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

private struct KolabSetup: View {
    let data: KolabStudioData
    @ObservedObject var model: KolabStudioModel
    @State private var name = ""
    @State private var handle = ""
    @State private var dob = ""
    @State private var pincode = ""
    @State private var website = ""
    @State private var handles: [String: String] = [:]
    @State private var aadhaar = ""
    @State private var reference: String?
    @State private var otp = ""
    @State private var saved: String?

    var body: some View {
        let p = data.profile
        Section {
            Text(p.name.isEmpty ? "New creator" : p.name).font(.system(size: 18, weight: .bold))
            Text(["@" + (p.handle.isEmpty ? "-" : p.handle), p.age.map { "\($0) yrs" }, [p.city, p.state, p.country].filter { !$0.isEmpty }.joined(separator: ", ")]
                .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                .font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.muted)
            HStack {
                Badge(text: data.account.kycVerified ? "Aadhaar verified" : "Unverified", color: data.account.kycVerified ? Theme.green : Theme.amber)
                Badge(text: data.account.plan, color: data.account.subscriptionActive || data.account.privileged ? Theme.green : Theme.muted)
            }
        } header: { Text("As followers & brands see you") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            TextField("Full name", text: $name)
            TextField("@yourhandle", text: $handle).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Date of birth (YYYY-MM-DD)", text: $dob).keyboardType(.numbersAndPunctuation)
            TextField("Pincode", text: $pincode).keyboardType(.numberPad)
            TextField(data.account.canPro ? "Website URL" : "Website URL (Pro)", text: $website)
                .textInputAutocapitalization(.never).keyboardType(.URL).disabled(!data.account.canPro)
            Button("Save profile") {
                var payload: [String: Any] = [:]
                for (k, v) in [("name", name), ("handle", handle), ("dob", dob), ("pincode", pincode)] where !v.trimmingCharacters(in: .whitespaces).isEmpty { payload[k] = v.trimmingCharacters(in: .whitespaces) }
                if data.account.canPro && !website.isEmpty { payload["website_url"] = website }
                Task { if await model.call("POST", "/api/kolab-studio/profile", payload) { saved = "Profile saved" } }
            }
            .disabled(model.busy)
            if let saved { Text(saved).font(.system(size: 12)).foregroundStyle(Theme.green) }
        } header: { Text("Profile setup") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if data.account.kycVerified {
                Text("Your identity is verified. Features unlock once you also have an active plan.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            } else {
                TextField("Aadhaar number", text: $aadhaar).keyboardType(.numberPad)
                if let reference {
                    TextField("OTP", text: $otp).keyboardType(.numberPad)
                    Button("Confirm") { Task { if await model.call("POST", "/api/kolab-studio/kyc", ["action": "verify", "reference_id": reference, "otp": otp]) { self.reference = nil } } }
                        .disabled(model.busy || otp.isEmpty)
                } else {
                    Button("Verify via OTP") {
                        Task {
                            guard let reply = await model.send("POST", "/api/kolab-studio/kyc", ["action": "initiate", "aadhaar": aadhaar, "consent": true]),
                                  let object = try? JSONSerialization.jsonObject(with: reply) as? [String: Any],
                                  let ref = (object["data"] as? [String: Any])?["reference_id"] as? String else { return }
                            reference = ref
                        }
                    }
                    .disabled(model.busy || aadhaar.filter(\.isNumber).count != 12)
                }
            }
        } header: { Text("Aadhaar verification") } footer: {
            Text(reference != nil ? "OTP sent to your Aadhaar-linked mobile." : "Runs only through a UIDAI-licensed provider with your consent. Your Aadhaar number is never stored, only the verification status and a masked reference.")
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            ForEach(data.reference.channels, id: \.k) { c in
                let linked = data.channels.first { $0.platform == c.k }?.handle
                HStack {
                    Circle().fill(Color(hex: c.c)).frame(width: 10, height: 10)
                    TextField("\(c.n) @handle", text: Binding(get: { handles[c.k] ?? "" }, set: { handles[c.k] = $0 }))
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(linked == nil ? "Link" : "Update") {
                        Task { await model.call("PUT", "/api/kolab-studio/channels", ["platform": c.k, "handle": handles[c.k] ?? ""]) }
                    }
                    .buttonStyle(.borderless)
                    .disabled(model.busy)
                }
            }
        } header: { Text("Social channels") }
        .listRowBackground(Theme.surface.opacity(0.7))
        .onAppear { reset() }
        .onChange(of: data.profile) { _, _ in reset() }
    }

    private func reset() {
        let p = data.profile
        (name, handle, dob, pincode, website) = (p.name, p.handle, p.dob, p.pincode, p.website_url)
        handles = Dictionary(uniqueKeysWithValues: data.channels.map { ($0.platform, $0.handle ?? "") })
    }
}
