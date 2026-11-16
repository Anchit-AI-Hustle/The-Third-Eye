import SwiftUI

// The site's page-by-page self-audit: scores, verdicts and the issues found.
struct AuditView: View {
    @ObservedObject private var catalog = Catalog.shared
    @State private var open: Set<String> = []
    @State private var href: String?

    var body: some View {
        List {
            if let audits = catalog.data?.audits {
                let count = Double(max(audits.count, 1))
                Section {
                    HStack {
                        stat(String(format: "%.1f", audits.map(\.current).reduce(0, +) / count), "Current avg")
                        stat(String(format: "%.1f", audits.map(\.target).reduce(0, +) / count), "Target avg")
                        stat("\(audits.count)", "Pages")
                        stat("\(audits.flatMap(\.issues).filter { $0.status != "fixed" }.count)", "Open issues")
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
                ForEach(audits) { audit in card(audit) }
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("App Audit")
        .refreshable { await catalog.load(force: true) }
        .task { await catalog.load() }
        .overlay { if catalog.data == nil && catalog.error == nil { ProgressView() } }
        .opensHrefs($href)
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.system(size: 20, weight: .bold)).foregroundStyle(Theme.blue)
            Text(label).font(.system(size: 11)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func card(_ audit: AuditPage) -> some View {
        let expanded = open.contains(audit.id)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Button { href = audit.href } label: {
                    Text(audit.page).font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.blue)
                }
                .buttonStyle(.plain)
                Spacer()
                Text("\(String(format: "%.1f", audit.current)) → \(String(format: "%.1f", audit.target))")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(Theme.secondary)
                Button {
                    open.formSymmetricDifference([audit.id])
                } label: {
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(expanded ? "Collapse" : "Expand")
            }
            if expanded {
                bar("Accuracy", audit.dims.accuracy)
                bar("Implementation", audit.dims.implementation)
                bar("Execution", audit.dims.execution)
                bar("Results", audit.dims.results)
                Text(audit.verdict).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                ForEach(Array(audit.issues.enumerated()), id: \.offset) { _, issue in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Badge(text: issue.severity.capitalized, color: color(issue.severity))
                            Badge(text: issue.status.replacingOccurrences(of: "-", with: " ").capitalized, color: issue.status == "fixed" ? Theme.green : Theme.amber)
                        }
                        Text(issue.text).font(.system(size: 13))
                        Text("Fix: \(issue.fix)").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.elevated.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(.vertical, 4)
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func bar(_ label: String, _ value: Double) -> some View {
        HStack(spacing: 10) {
            Text(label).font(.system(size: 12)).foregroundStyle(Theme.muted).frame(width: 100, alignment: .leading)
            ProgressView(value: min(max(value, 0), 10), total: 10).tint(value >= 9 ? Theme.green : value >= 7 ? Theme.blue : Theme.amber)
            Text(String(format: "%.0f", value)).font(.system(size: 12, design: .monospaced)).frame(width: 22, alignment: .trailing)
        }
    }

    private func color(_ severity: String) -> Color {
        switch severity {
        case "critical": return Theme.red
        case "high": return Theme.amber
        case "medium": return Theme.blue
        default: return Theme.muted
        }
    }
}
