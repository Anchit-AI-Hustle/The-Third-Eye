import AVKit
import SwiftUI

// Things made in this app, kept on this phone and saved to the account, listed
// with everything made on the website, other devices and by the assistant.
struct Generation: Codable, Identifiable, Equatable {
    struct Input: Codable, Equatable {
        let label: String
        let value: String
    }

    let id: String
    let app: String
    let tool: String?
    let appLabel: String
    let title: String
    let kind: String
    let createdAt: String
    let inputs: [Input]
    let output: String

    var fileExtension: String { kind == "html" ? "html" : kind == "markdown" ? "md" : "txt" }
}

@MainActor
final class GenerationStore: ObservableObject {
    static let shared = GenerationStore()
    static let cap = 500

    /// Made on this phone, kept here.
    @Published private(set) var items: [Generation]
    /// Made anywhere else (the website, another phone, the assistant) and the music library: listed from the account.
    @Published private(set) var remote: [Generation] = []

    private struct Row: Decodable {
        let id: String
        let app: String?
        let tool: String?
        let app_label: String?
        let title: String?
        let kind: String?
        let created_at: String
        let inputs: [Generation.Input]?
        let output: String?
    }

    private struct Track: Decodable { let id: String; let title: String?; let audio_url: String?; let created_at: String }

    private init() {
        items = LocalStore.read(LocalFile.generations, as: [Generation].self) ?? []
    }

    /// Everything, newest first, once each.
    var all: [Generation] {
        let mine = Set(items.map(\.id))
        // A song recorded as a generation is in the library too; account rows come without their output, so match by title as well.
        let songs = (items + remote).filter { $0.app == "music" && !$0.id.hasPrefix("music_") }
        let others = remote.filter { r in
            !mine.contains(r.id) && !(r.id.hasPrefix("music_") && songs.contains { $0.output == r.output || $0.title == r.title })
        }
        return (items + others).sorted { $0.createdAt > $1.createdAt }
    }

    func add(app: String, tool: String?, appLabel: String, title: String, kind: String, inputs: [Generation.Input], output: String) {
        let item = Generation(id: "gen_\(UUID().uuidString.lowercased())", app: app, tool: tool, appLabel: appLabel, title: title,
                              kind: kind, createdAt: Fmt.now(), inputs: inputs, output: output)
        items = Self.adding(item, to: items)
        LocalStore.write(LocalFile.generations, items)
        let row: [String: Any] = [
            "id": item.id, "app": app, "tool": tool.map { $0 as Any } ?? NSNull(), "app_label": appLabel, "title": title, "kind": kind,
            "inputs": inputs.map { ["label": $0.label, "value": $0.value] }, "output": output.count <= 1_500_000 ? output : "", "created_at": item.createdAt,
        ]
        Task { try? await DataStore.insert("generations", row) }
    }

    func delete(_ id: String) {
        items.removeAll { $0.id == id }
        remote.removeAll { $0.id == id }
        LocalStore.write(LocalFile.generations, items)
        Task {
            if id.hasPrefix("music_") { try? await DataStore.delete("music_tracks", id: String(id.dropFirst(6))) }
            else { try? await DataStore.delete("generations", id: id) }
        }
    }

    func refresh() async {
        async let rows = try? DataStore.list("generations", as: Row.self)
        async let tracks = try? DataStore.list("music_tracks", as: Track.self)
        var found = (await rows ?? []).map { r in
            Generation(id: r.id, app: r.app ?? "", tool: r.tool, appLabel: r.app_label ?? "", title: r.title ?? "Untitled",
                       kind: r.kind ?? "text", createdAt: r.created_at, inputs: r.inputs ?? [], output: r.output ?? "")
        }
        for t in await tracks ?? [] {
            guard let url = t.audio_url, !url.isEmpty else { continue }
            found.append(Generation(id: "music_\(t.id)", app: "music", tool: nil, appLabel: "Music Studio", title: t.title ?? "Track",
                                    kind: "audio", createdAt: t.created_at, inputs: [], output: url))
        }
        remote = found
    }

    /// The full row for one listed from the account (lists leave the output out).
    func full(_ item: Generation) async -> Generation {
        guard item.output.isEmpty, !items.contains(where: { $0.id == item.id }) else { return item }
        let escaped = item.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? item.id
        guard let r = try? await DataStore.list("generations?id=\(escaped)", as: Row.self).first else { return item }
        return Generation(id: r.id, app: r.app ?? item.app, tool: r.tool, appLabel: r.app_label ?? item.appLabel, title: r.title ?? item.title,
                          kind: r.kind ?? item.kind, createdAt: r.created_at, inputs: r.inputs ?? [], output: r.output ?? "")
    }

    func reset() {
        items = []
        LocalStore.remove(LocalFile.generations)
    }

    /// Newest first, the oldest dropped past the cap.
    static func adding(_ item: Generation, to list: [Generation]) -> [Generation] {
        Array(([item] + list).prefix(cap))
    }

    static func matching(_ list: [Generation], search: String, app: String?) -> [Generation] {
        let needle = search.trimmingCharacters(in: .whitespaces).lowercased()
        return list.filter { item in
            (app == nil || item.app == app)
                && (needle.isEmpty || item.title.lowercased().contains(needle) || item.output.lowercased().contains(needle))
        }
    }
}

struct GenerationsView: View {
    @ObservedObject private var store = GenerationStore.shared
    @State private var search = ""
    @State private var app: String?

    private var apps: [String] {
        var seen: [String] = []
        for item in store.all where !seen.contains(item.app) { seen.append(item.app) }
        return seen
    }

    var body: some View {
        List {
            if store.all.isEmpty {
                Text("Everything you make, here, on the website or by asking the assistant, shows up here.")
                    .foregroundStyle(Theme.muted)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        chip("All", value: nil)
                        ForEach(apps, id: \.self) { chip($0.capitalized, value: $0) }
                    }
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                ForEach(GenerationStore.matching(store.all, search: search, app: app)) { item in
                    NavigationLink { GenerationDetailView(item: item) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.title).font(.system(size: 15, weight: .medium)).lineLimit(2)
                            Text("\(item.appLabel) · \(Fmt.date(item.createdAt))").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                    .swipeActions {
                        Button(role: .destructive) { store.delete(item.id) } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Generations")
        .searchable(text: $search, prompt: "Search")
        .task { await store.refresh() }
        .refreshable { await store.refresh() }
    }

    private func chip(_ title: String, value: String?) -> some View {
        Button { app = value } label: {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .padding(.horizontal, 14).padding(.vertical, 7)
                .foregroundStyle(app == value ? Theme.background : Theme.secondary)
                .background(app == value ? Theme.blue : Theme.surface, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

struct GenerationDetailView: View {
    @State var item: Generation
    @Environment(\.dismiss) private var dismiss
    @State private var confirmDelete = false

    var body: some View {
        VStack(spacing: 12) {
            VStack(spacing: 12) {
                if !item.inputs.isEmpty {
                    DisclosureGroup("What you asked for") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(item.inputs.enumerated()), id: \.offset) { _, input in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(input.label).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                                    Text(input.value).font(.system(size: 14))
                                }
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                    }
                    .font(.system(size: 14, weight: .medium))
                    .padding(12)
                    .background(Theme.surface.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                }
                ActionBar {
                    CopyAction(text: item.output)
                    ShareAction(name: item.title, ext: item.fileExtension, text: item.output)
                    Button { confirmDelete = true } label: { ActionLabel(icon: "trash", text: "Delete") }
                        .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            if item.kind == "audio" || item.kind == "video" {
                if item.output.isEmpty {
                    Text("The file itself was kept on the device that made it.").foregroundStyle(Theme.muted).padding(16)
                } else {
                    VideoPlayer(player: AVPlayer(url: API.url(item.output))).frame(height: item.kind == "video" ? 260 : 80).padding(.horizontal, 16)
                }
                Spacer()
            } else {
                OutputBody(text: item.output, format: item.kind)
            }
        }
        .task { item = await GenerationStore.shared.full(item) }
        .background(Starfield())
        .navigationTitle(item.title)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete this creation?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) {
                GenerationStore.shared.delete(item.id)
                dismiss()
            }
        }
    }
}

struct GenerationRoute: View {
    let id: String
    @ObservedObject private var store = GenerationStore.shared

    var body: some View {
        if let item = store.all.first(where: { $0.id == id }) {
            GenerationDetailView(item: item)
        } else {
            Text("This creation is no longer on this phone.")
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Starfield())
        }
    }
}
