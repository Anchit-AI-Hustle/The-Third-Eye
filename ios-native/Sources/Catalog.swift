import SwiftUI

// GET /api/catalog: the website's built-in lists (Studio tools, App Hub, capabilities,
// online agents, audits, plans), so these screens stay in step with the site.
struct CatalogData: Decodable {
    let studios: [String: StudioInfo]
    let categoryOrder: [String: [String]]
    let studioTools: [StudioTool]
    let apps: [AppEntry]
    let capabilities: [Capability]
    let systems: [AgentSystem]
    let audits: [AuditPage]
    let plans: PlanCatalog
}

struct StudioInfo: Decodable {
    let name: String
    let tagline: String
    let accent: String
}

struct ToolField: Decodable, Identifiable {
    let name: String
    let label: String
    let type: String
    let placeholder: String?
    let options: [String]?
    let required: Bool?
    var id: String { name }
}

struct StudioTool: Decodable, Identifiable {
    let id: String
    let label: String
    let mode: String
    let accent: String
    let blurb: String
    let format: String
    let downloadExt: String
    let cta: String
    let category: String
    let fields: [ToolField]
}

struct AppEntry: Decodable, Identifiable {
    let id: String
    let label: String
    let category: String
    let modes: [String]
    let kind: String
    let href: String
    let blurb: String?
    let selfBuilt: Bool?
    let emergency: Bool?
}

struct Capability: Decodable, Identifiable {
    let group: String
    let name: String
    let blurb: String
    let required: [String]
    let status: String
    let premium: Bool?
    var id: String { "\(group)/\(name)" }
}

struct AgentSystem: Decodable, Identifiable {
    let id: String
    let name: String
    let accentColor: String
    let purpose: String
    let href: String
    let kind: String
    let lang: String
    let pitch: Double
    let rate: Double
    let lines: [String]
}

struct AuditIssue: Decodable {
    let severity: String
    let text: String
    let fix: String
    let status: String
}

struct AuditDims: Decodable {
    let accuracy: Double
    let implementation: Double
    let execution: Double
    let results: Double
}

struct AuditPage: Decodable, Identifiable {
    let page: String
    let href: String
    let current: Double
    let target: Double
    let dims: AuditDims
    let verdict: String
    let issues: [AuditIssue]
    var id: String { page }
}

struct PlanTier: Decodable, Identifiable {
    let id: String
    let label: String
    let badge: String
    let color: String
    let monthlyCredits: Int
    let features: [String]
    let prices: [String: Double]
}

struct PlanPeriod: Decodable, Identifiable {
    let id: String
    let label: String
    let note: String?
}

struct CreditPack: Decodable, Identifiable {
    let id: String
    let label: String
    let credits: Int
    let bonus: Int
    let priceInr: Double
    let best: Bool?
}

struct UsageLevel: Decodable {
    let min: Int
    let name: String
    let avatar: String
}

struct PlanCatalog: Decodable {
    let tiers: [PlanTier]
    let periods: [PlanPeriod]
    let bundles: [CreditPack]
    let costs: [String: Double]
    let levels: [UsageLevel]
}

struct ToolGroup: Identifiable {
    let category: String
    let tools: [StudioTool]
    var id: String { category }
}

struct AppGroup: Identifiable {
    let category: String
    let apps: [AppEntry]
    var id: String { category }
}

extension CatalogData {
    /// A mode's tools by category: the site's category order first, any others after.
    func toolGroups(for mode: AppMode) -> [ToolGroup] {
        let inMode = studioTools.filter { $0.mode == mode.rawValue }
        var order = (categoryOrder[mode.rawValue] ?? []).filter { category in inMode.contains { $0.category == category } }
        for tool in inMode where !order.contains(tool.category) { order.append(tool.category) }
        return order.map { category in ToolGroup(category: category, tools: inMode.filter { $0.category == category }) }
    }

    /// A mode's apps by category in the order the registry lists them, narrowed by a search.
    func appGroups(for mode: AppMode, matching search: String) -> [AppGroup] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        let found = apps.filter { entry in
            entry.modes.contains(mode.rawValue) && (needle.isEmpty
                || entry.label.lowercased().contains(needle)
                || (entry.blurb ?? "").lowercased().contains(needle)
                || entry.category.lowercased().contains(needle))
        }
        var order: [String] = []
        for entry in found where !order.contains(entry.category) { order.append(entry.category) }
        return order.map { category in AppGroup(category: category, apps: found.filter { $0.category == category }) }
    }
}

// Loaded once per run, the last good copy kept on disk for offline, refreshed by pull-to-refresh.
@MainActor
final class Catalog: ObservableObject {
    static let shared = Catalog()

    @Published private(set) var data: CatalogData?
    @Published private(set) var error: String?

    func load(force: Bool = false) async {
        if data != nil && !force { return }
        do {
            let raw = try await API.fetch("GET", "/api/catalog")
            data = try JSONDecoder().decode(CatalogData.self, from: raw)
            LocalStore.saveData(LocalFile.catalog, raw)
            error = nil
        } catch {
            if data == nil, let raw = LocalStore.readData(LocalFile.catalog), let cached = try? JSONDecoder().decode(CatalogData.self, from: raw) {
                data = cached
            } else if data == nil {
                self.error = error.localizedDescription
            }
        }
    }
}

// Shared by Studio and Apps.
enum AppMode: String, CaseIterable, Identifiable {
    case personal, professional, enterprise
    static let key = "app-mode"
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

struct ModePicker: View {
    @AppStorage(AppMode.key) private var raw = AppMode.personal.rawValue

    var body: some View {
        Picker("Mode", selection: $raw) {
            ForEach(AppMode.allCases) { Text($0.label).tag($0.rawValue) }
        }
        .pickerStyle(.segmented)
    }
}
