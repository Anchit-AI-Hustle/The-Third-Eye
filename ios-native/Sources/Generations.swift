import SwiftUI

// Things made in this app's Studio and Kolab, kept on this phone (the website's
// own list lives in that browser only).
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

    @Published private(set) var items: [Generation]

    private init() {
        items = LocalStore.read(LocalFile.generations, as: [Generation].self) ?? []
    }

    func add(app: String, tool: String?, appLabel: String, title: String, kind: String, inputs: [Generation.Input], output: String) {
        let item = Generation(id: "gen_\(UUID().uuidString.lowercased())", app: app, tool: tool, appLabel: appLabel, title: title,
                              kind: kind, createdAt: Fmt.now(), inputs: inputs, output: output)
        items = Self.adding(item, to: items)
        LocalStore.write(LocalFile.generations, items)
    }

    func delete(_ id: String) {
        items.removeAll { $0.id == id }
        LocalStore.write(LocalFile.generations, items)
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
        for item in store.items where !seen.contains(item.app) { seen.append(item.app) }
        return seen
    }

    var body: some View {
        List {
            if store.items.isEmpty {
                Text("Things you make in this app's Studio and Kolab show up here. Website creations stay in that browser.")
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
                ForEach(GenerationStore.matching(store.items, search: search, app: app)) { item in
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
    let item: Generation
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
            OutputBody(text: item.output, format: item.kind)
        }
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
        if let item = store.items.first(where: { $0.id == id }) {
            GenerationDetailView(item: item)
        } else {
            Text("This creation is no longer on this phone.")
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Starfield())
        }
    }
}
