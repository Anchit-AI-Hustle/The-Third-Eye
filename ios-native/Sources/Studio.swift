import SwiftUI

enum Studio {
    /// Tools that need browser tech (audio/video/camera editors) open the website page.
    static let browserOnly: Set<String> = ["music", "health", "avatar", "video", "reel", "book", "anchor"]
}

struct StudioView: View {
    @ObservedObject private var catalog = Catalog.shared
    @AppStorage(AppMode.key) private var modeRaw = AppMode.personal.rawValue

    private var mode: AppMode { AppMode(rawValue: modeRaw) ?? .personal }

    var body: some View {
        List {
            Section {
                ModePicker().listRowBackground(Color.clear)
            }
            if let data = catalog.data {
                if let studio = data.studios[mode.rawValue] {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(studio.name).font(.system(size: 20, weight: .bold)).foregroundStyle(Color(hex: studio.accent))
                        Text(studio.tagline).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                    }
                    .listRowBackground(Color.clear)
                }
                ForEach(data.toolGroups(for: mode)) { group in
                    Section(group.category) {
                        ForEach(group.tools) { tool in
                            NavigationLink { RouteView(path: "/tools/\(tool.id)") } label: {
                                HStack(spacing: 12) {
                                    Circle().fill(Color(hex: tool.accent)).frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(tool.label).font(.system(size: 15, weight: .medium))
                                        Text(tool.blurb).font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2)
                                    }
                                    if Studio.browserOnly.contains(tool.id) {
                                        Spacer()
                                        Image(systemName: "safari").font(.system(size: 13)).foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                        }
                        .listRowBackground(Theme.surface.opacity(0.7))
                    }
                }
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Studio")
        .refreshable { await catalog.load(force: true) }
        .task { await catalog.load() }
        .overlay { if catalog.data == nil && catalog.error == nil { ProgressView() } }
    }
}

// /tools/<id>: a native form for most tools, the website page for the browser-only ones.
struct StudioToolRoute: View {
    let id: String
    let path: String
    @ObservedObject private var catalog = Catalog.shared

    var body: some View {
        if Studio.browserOnly.contains(id) {
            web
        } else if let tool = catalog.data?.studioTools.first(where: { $0.id == id }) {
            ToolFormView(tool: tool)
        } else if catalog.data == nil && catalog.error == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Starfield())
                .task { await catalog.load() }
        } else {
            web
        }
    }

    private var web: some View {
        WebScreen(path: path)
            .navigationTitle(Router.title(path))
            .navigationBarTitleDisplayMode(.inline)
    }
}

@MainActor
final class StudioRunner: ObservableObject {
    struct Output: Equatable {
        let text: String
        let format: String
    }

    @Published private(set) var output: Output?
    @Published private(set) var running = false
    @Published private(set) var saved = false
    @Published var error: String?

    let tool: StudioTool
    private var values: [String: String] = [:]

    private struct Reply: Decodable {
        let output: String
        let format: String?
    }

    init(tool: StudioTool) { self.tool = tool }

    private var title: String {
        let first = Fmt.initialLine(tool.fields.compactMap { values[$0.name] })
        return first.isEmpty ? tool.label : "\(tool.label): \(first)"
    }

    func run(_ values: [String: String]) async {
        guard !running else { return }
        self.values = values
        running = true
        error = nil
        defer { running = false }
        do {
            let reply = try await API.call("POST", "/api/tools/generate", json: ["tool": tool.id, "inputs": values, "mode": tool.mode], as: Reply.self)
            let format = reply.format ?? tool.format
            output = Output(text: reply.output, format: format)
            saved = false
            let inputs = tool.fields.compactMap { field -> Generation.Input? in
                let value = values[field.name] ?? ""
                return value.isEmpty ? nil : Generation.Input(label: field.label, value: value)
            }
            GenerationStore.shared.add(app: "studio", tool: tool.id, appLabel: tool.label, title: title, kind: format, inputs: inputs, output: reply.output)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func regenerate() async { await run(values) }

    func saveToKnowledge() async {
        guard let output, !saved else { return }
        do {
            try await DataStore.insert("knowledge_docs", [
                "id": UUID().uuidString.lowercased(), "title": title, "content": output.text, "file_type": tool.downloadExt,
                "file_size_bytes": output.text.utf8.count, "created_at": Fmt.now(), "chunk_count": 0, "processing_status": "ready",
            ])
            saved = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ToolFormView: View {
    @StateObject private var runner: StudioRunner
    @State private var values: [String: String]
    @State private var showResult = false

    @MainActor
    init(tool: StudioTool) {
        _runner = StateObject(wrappedValue: StudioRunner(tool: tool))
        _values = State(initialValue: Dictionary(tool.fields.map { ($0.name, $0.type == "select" ? ($0.options?.first ?? "") : "") },
                                                 uniquingKeysWith: { first, _ in first }))
    }

    private var tool: StudioTool { runner.tool }

    private var ready: Bool {
        tool.fields.allSatisfy { field in
            field.required != true || !(values[field.name] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var body: some View {
        Form {
            Section {
                Text(tool.blurb).font(.system(size: 13)).foregroundStyle(Theme.secondary)
            }
            .listRowBackground(Color.clear)
            Section {
                ForEach(tool.fields) { field in fieldView(field) }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section {
                if runner.running {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Generating. This can take up to a minute.").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                    }
                } else {
                    Button(tool.cta) { generate() }
                        .buttonStyle(GlowButtonStyle())
                        .disabled(!ready)
                        .opacity(ready ? 1 : 0.4)
                }
                if let error = runner.error {
                    Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
                }
            }
            .listRowBackground(Color.clear)
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle(tool.label)
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) { ToolResultView(runner: runner) }
    }

    @ViewBuilder
    private func fieldView(_ field: ToolField) -> some View {
        let binding = Binding(get: { values[field.name] ?? "" }, set: { values[field.name] = $0 })
        VStack(alignment: .leading, spacing: 6) {
            Text(field.label + (field.required == true ? " *" : ""))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.secondary)
            switch field.type {
            case "textarea":
                TextField(field.placeholder ?? field.label, text: binding, axis: .vertical).lineLimit(3...8)
            case "select":
                Picker(field.label, selection: binding) {
                    ForEach(field.options ?? [], id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            default:
                TextField(field.placeholder ?? field.label, text: binding)
            }
        }
    }

    private func generate() {
        let trimmed = values.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        Task { @MainActor in
            await runner.run(trimmed)
            if runner.error == nil, runner.output != nil { showResult = true }
        }
    }
}

struct ToolResultView: View {
    @ObservedObject var runner: StudioRunner

    var body: some View {
        let text = runner.output?.text ?? ""
        VStack(spacing: 12) {
            ActionBar {
                CopyAction(text: text)
                ShareAction(name: runner.tool.label, ext: runner.tool.downloadExt, text: text)
                Button { Task { await runner.saveToKnowledge() } } label: {
                    ActionLabel(icon: runner.saved ? "checkmark" : "books.vertical", text: runner.saved ? "Saved" : "Knowledge")
                }
                .buttonStyle(.plain)
                .disabled(runner.saved)
                .accessibilityLabel("Save to Knowledge")
                Button { Task { await runner.regenerate() } } label: { ActionLabel(icon: "arrow.clockwise", text: "Regenerate") }
                    .buttonStyle(.plain)
                    .disabled(runner.running)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            if let error = runner.error {
                Text(error).font(.system(size: 13)).foregroundStyle(Theme.red).padding(.horizontal, 16)
            }
            OutputBody(text: text, format: runner.output?.format ?? runner.tool.format)
                .overlay {
                    if runner.running {
                        ProgressView("Generating…")
                            .padding(20)
                            .background(Theme.elevated, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
        }
        .background(Starfield())
        .navigationTitle(runner.tool.label)
        .navigationBarTitleDisplayMode(.inline)
    }
}
