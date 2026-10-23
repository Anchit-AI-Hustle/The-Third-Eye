import SwiftUI

// The App Hub: a mode-aware launcher. Each entry opens its native screen, the
// website page, the service's own site, or (for emergencies) the dialer.
struct AppsView: View {
    @ObservedObject private var catalog = Catalog.shared
    @AppStorage(AppMode.key) private var modeRaw = AppMode.personal.rawValue
    @State private var search = ""
    @State private var href: String?
    @State private var calling: AppEntry?

    private var mode: AppMode { AppMode(rawValue: modeRaw) ?? .personal }

    var body: some View {
        List {
            Section {
                ModePicker().listRowBackground(Color.clear)
            }
            if let data = catalog.data {
                ForEach(data.appGroups(for: mode, matching: search)) { group in
                    Section(group.category) {
                        ForEach(group.apps) { entry in row(entry) }
                    }
                }
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Apps")
        .searchable(text: $search, prompt: "Search apps")
        .refreshable { await catalog.load(force: true) }
        .task { await catalog.load() }
        .overlay { if catalog.data == nil && catalog.error == nil { ProgressView() } }
        .opensHrefs($href)
        .confirmationDialog("Call \(calling?.label ?? "")?", isPresented: Binding(get: { calling != nil }, set: { if !$0 { calling = nil } }), titleVisibility: .visible) {
            Button("Call", role: .destructive) {
                href = calling?.href
                calling = nil
            }
        }
    }

    private func row(_ entry: AppEntry) -> some View {
        let emergency = entry.emergency == true
        return Button {
            if emergency && entry.href.hasPrefix("tel:") { calling = entry } else { href = entry.href }
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(entry.label).font(.system(size: 15, weight: .medium))
                        if entry.selfBuilt == true { Badge(text: "Ours", color: Theme.blue) }
                    }
                    if let blurb = entry.blurb {
                        Text(blurb).font(.system(size: 12)).foregroundStyle(emergency ? Theme.red.opacity(0.8) : Theme.muted).lineLimit(2)
                    }
                }
                Spacer()
                Image(systemName: entry.kind == "external" ? "arrow.up.right" : "chevron.right")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            .foregroundStyle(emergency ? Theme.red : Color.primary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(emergency ? Theme.red.opacity(0.12) : Theme.surface.opacity(0.7))
    }
}
