import SwiftUI

struct LedgerRow: Decodable {
    let delta: Flex
    let reason: String?
    let created_at: String
}

struct Wallet: Decodable {
    let unlimited: Bool
    let balance: Flex?
    let used: Flex?
    let ledger: [LedgerRow]
}

enum Levels {
    /// The level reached by this many creations, and the next one up.
    static func current(used: Int, in levels: [UsageLevel]) -> (level: UsageLevel, next: UsageLevel?)? {
        guard let index = levels.lastIndex(where: { used >= $0.min }) else { return nil }
        return (levels[index], index + 1 < levels.count ? levels[index + 1] : nil)
    }
}

@MainActor
final class WalletModel: ObservableObject {
    @Published var wallet: Wallet?
    @Published var error: String?
    @Published var unlockNote: String?
    @Published var unlockWorked = false
    @Published var unlocking = false

    private struct Unlocked: Decodable { let ok: Bool? }

    func load() async {
        do {
            wallet = try await API.call("GET", "/api/billing/credits", as: Wallet.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func unlock(_ code: String) async -> Bool {
        unlocking = true
        defer { unlocking = false }
        do {
            let reply = try await API.call("POST", "/api/billing/unlock", json: ["code": code], as: Unlocked.self)
            unlockWorked = reply.ok == true
            unlockNote = unlockWorked ? "Unlocked" : "That code didn't work."
            if unlockWorked { await load() }
        } catch let failure as ServerError where failure.status == 429 {
            unlockWorked = false
            unlockNote = "Too many tries, wait 15 minutes."
        } catch {
            unlockWorked = false
            unlockNote = error.localizedDescription
        }
        return unlockWorked
    }
}

struct PlansView: View {
    @ObservedObject private var catalog = Catalog.shared
    @StateObject private var model = WalletModel()
    @State private var periodID = "monthly"
    @State private var code = ""

    private static let costNames: [(key: String, name: String)] = [
        ("chat.message", "Chat message"), ("assistant.action", "Assistant action"), ("studio.text", "Studio text"),
        ("studio.html", "Studio page"), ("music.generate", "Song"), ("video.render", "Video"),
        ("vision.analyze", "Photo analysis"), ("transcribe.minute", "Transcription (per minute)"),
        ("jobagent.kit", "Job application kit"), ("health.plan", "Health plan"), ("kolab.generate", "Kolab program"),
    ]
    private static let paymentsNote = "Payments aren't live yet — plans can't be bought in the app."

    var body: some View {
        List {
            if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
            if let wallet = model.wallet { walletSection(wallet) }
            if let plans = catalog.data?.plans {
                planSections(plans)
                costSection(plans.costs)
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
            Section("Unlock code") {
                TextField("Code", text: $code).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button(model.unlocking ? "Checking…" : "Unlock") {
                    Task { if await model.unlock(code.trimmingCharacters(in: .whitespacesAndNewlines)) { code = "" } }
                }
                .disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.unlocking)
                if let note = model.unlockNote {
                    Text(note).font(.system(size: 13)).foregroundStyle(model.unlockWorked ? Theme.green : Theme.red)
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            if let wallet = model.wallet, !wallet.ledger.isEmpty {
                Section("Recent activity") {
                    ForEach(Array(wallet.ledger.prefix(8).enumerated()), id: \.offset) { _, row in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.reason ?? "Credits").font(.system(size: 14))
                                Text(Fmt.date(row.created_at)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Text("\(row.delta.value >= 0 ? "+" : "")\(Fmt.number(row.delta.value))")
                                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                .foregroundStyle(row.delta.value >= 0 ? Theme.green : Theme.secondary)
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Plans & Credits")
        .refreshable {
            await catalog.load(force: true)
            await model.load()
        }
        .task {
            await catalog.load()
            await model.load()
        }
        .overlay { if catalog.data == nil && model.wallet == nil && catalog.error == nil && model.error == nil { ProgressView() } }
    }

    private func walletSection(_ wallet: Wallet) -> some View {
        Section("Your credits") {
            VStack(alignment: .leading, spacing: 6) {
                Text(wallet.unlimited ? "Unlimited" : Fmt.number(wallet.balance?.value ?? 0))
                    .font(.system(size: 34, weight: .bold))
                    .foregroundStyle(Theme.blue)
                if let levels = catalog.data?.plans.levels,
                   let reached = Levels.current(used: Int(wallet.used?.value ?? 0), in: levels) {
                    HStack(spacing: 8) {
                        Text(reached.level.avatar)
                        Text(reached.level.name).font(.system(size: 14, weight: .semibold))
                        if let next = reached.next {
                            Text("\(max(0, next.min - Int(wallet.used?.value ?? 0))) more to \(next.name)")
                                .font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .padding(.vertical, 4)
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    @ViewBuilder
    private func planSections(_ plans: PlanCatalog) -> some View {
        let period = plans.periods.first { $0.id == periodID } ?? plans.periods.first
        Section("Plans") {
            Text(Self.paymentsNote).font(.system(size: 12)).foregroundStyle(Theme.amber)
            Picker("Billing period", selection: $periodID) {
                ForEach(plans.periods) { Text($0.label).tag($0.id) }
            }
            if let note = period?.note {
                Text(note).font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        ForEach(plans.tiers) { tier in
            let price = tier.prices[period?.id ?? periodID] ?? 0
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(tier.label).font(.system(size: 18, weight: .bold))
                    Badge(text: tier.badge, color: Color(hex: tier.color))
                    Spacer()
                    Text(price == 0 ? "Free" : "₹\(Fmt.number(price)) / \((period?.label ?? "").lowercased())")
                        .font(.system(size: 14, weight: .semibold))
                }
                Text("\(Fmt.number(Double(tier.monthlyCredits))) credits / month").font(.system(size: 12)).foregroundStyle(Theme.muted)
                ForEach(tier.features, id: \.self) { feature in
                    Label(feature, systemImage: "checkmark").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                }
            }
            .padding(.vertical, 4)
            .listRowBackground(Theme.surface.opacity(0.7))
        }
        Section("Credit packs") {
            Text(Self.paymentsNote).font(.system(size: 12)).foregroundStyle(Theme.amber)
            ForEach(plans.bundles) { pack in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(pack.label).font(.system(size: 15, weight: .medium))
                            if pack.best == true { Badge(text: "Best value", color: Theme.green) }
                        }
                        Text(pack.bonus > 0 ? "\(Fmt.number(Double(pack.credits))) + \(Fmt.number(Double(pack.bonus))) bonus credits" : "\(Fmt.number(Double(pack.credits))) credits")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    Spacer()
                    Text("₹\(Fmt.number(pack.priceInr))").font(.system(size: 14, weight: .semibold))
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func costSection(_ costs: [String: Double]) -> some View {
        let known = Self.costNames.filter { costs[$0.key] != nil }
        let others = costs.keys.filter { key in !Self.costNames.contains { $0.key == key } }.sorted()
        return Section("What things cost") {
            ForEach(Array(known.enumerated()), id: \.offset) { _, entry in
                costRow(entry.name, costs[entry.key] ?? 0)
            }
            ForEach(others, id: \.self) { key in
                costRow(key, costs[key] ?? 0)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func costRow(_ name: String, _ cost: Double) -> some View {
        HStack {
            Text(name).font(.system(size: 14))
            Spacer()
            Text("\(Fmt.number(cost)) credit\(cost == 1 ? "" : "s")").font(.system(size: 13)).foregroundStyle(Theme.secondary)
        }
    }
}
