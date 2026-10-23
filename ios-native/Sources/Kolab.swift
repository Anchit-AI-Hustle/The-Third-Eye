import SwiftUI

// Kolab: a brand profile kept on this phone, and the marketing programs the
// server writes from it.
struct KolabBrand: Codable, Equatable {
    var name = ""
    var industry = ""
    var product = ""
    var audience = ""
    var positioning = ""
    var usp = ""
    var pricePoint = ""
    var region = ""
    var channels = ""
    var competitors = ""
    var toneOfVoice = ""
    var stage = ""
    var goals = ""
    var metricsNote = ""
    var constraints = ""

    /// What the server takes: blank fields left out, channels as a list.
    var payload: [String: Any] {
        var out: [String: Any] = ["name": name.trimmingCharacters(in: .whitespacesAndNewlines)]
        let fields = [("industry", industry), ("product", product), ("audience", audience), ("positioning", positioning),
                        ("usp", usp), ("pricePoint", pricePoint), ("region", region), ("competitors", competitors),
                        ("toneOfVoice", toneOfVoice), ("stage", stage), ("goals", goals), ("metricsNote", metricsNote),
                        ("constraints", constraints)]
        for (key, value) in fields {
            let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { out[key] = text }
        }
        let list = channels.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        if !list.isEmpty { out["channels"] = list }
        return out
    }
}

struct KolabDraft: Codable, Equatable {
    var brand = KolabBrand()
    var mode = "lifecycle"
    var brief = ""
}

enum Kolab {
    static let modes = [("lifecycle", "Lifecycle program"), ("creator", "Creator program"),
                        ("brandplan", "Brand plan"), ("retention", "Retention program")]
    static let briefLimit = 1000

    static func label(_ mode: String) -> String {
        modes.first { $0.0 == mode }?.1 ?? mode
    }
}

@MainActor
final class KolabModel: ObservableObject {
    @Published var draft: KolabDraft {
        didSet { LocalStore.write(LocalFile.kolab, draft) }
    }
    @Published private(set) var output: String?
    @Published private(set) var running = false
    @Published var error: String?

    private struct Reply: Decodable { let output: String }

    init() {
        draft = LocalStore.read(LocalFile.kolab, as: KolabDraft.self) ?? KolabDraft()
    }

    func generate() async -> Bool {
        guard !running else { return false }
        running = true
        error = nil
        defer { running = false }
        let brief = String(draft.brief.trimmingCharacters(in: .whitespacesAndNewlines).prefix(Kolab.briefLimit))
        var body: [String: Any] = ["mode": draft.mode, "brand": draft.brand.payload]
        if !brief.isEmpty { body["brief"] = brief }
        do {
            let reply = try await API.call("POST", "/api/kolab/generate", json: body, as: Reply.self)
            output = reply.output
            let name = draft.brand.name.trimmingCharacters(in: .whitespacesAndNewlines)
            var inputs = [Generation.Input(label: "Program", value: Kolab.label(draft.mode)), Generation.Input(label: "Brand", value: name)]
            if !brief.isEmpty { inputs.append(Generation.Input(label: "Brief", value: brief)) }
            GenerationStore.shared.add(app: "kolab", tool: nil, appLabel: "Kolab", title: "\(Kolab.label(draft.mode)): \(name)",
                                       kind: "markdown", inputs: inputs, output: reply.output)
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct KolabView: View {
    @StateObject private var model = KolabModel()
    @State private var showResult = false

    private let prices = [("value", "Value"), ("mid", "Mid"), ("premium", "Premium"), ("luxury", "Luxury")]
    private let stages = [("pre-launch", "Pre-launch"), ("early", "Early"), ("growth", "Growth"), ("scale", "Scale"), ("mature", "Mature")]

    var body: some View {
        Form {
            Section("Program") {
                Picker("Program", selection: $model.draft.mode) {
                    ForEach(Kolab.modes, id: \.0) { Text($0.1).tag($0.0) }
                }
                VStack(alignment: .trailing, spacing: 4) {
                    TextField("Brief (optional)", text: $model.draft.brief, axis: .vertical).lineLimit(2...6)
                    Text("\(model.draft.brief.count)/\(Kolab.briefLimit)").font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section("Brand") {
                TextField("Brand name (required)", text: $model.draft.brand.name)
                TextField("Industry", text: $model.draft.brand.industry)
                TextField("Product", text: $model.draft.brand.product, axis: .vertical)
                TextField("Audience", text: $model.draft.brand.audience, axis: .vertical)
                TextField("Positioning", text: $model.draft.brand.positioning, axis: .vertical)
                TextField("Unique selling points", text: $model.draft.brand.usp, axis: .vertical)
                Picker("Price point", selection: $model.draft.brand.pricePoint) {
                    Text("Not set").tag("")
                    ForEach(prices, id: \.0) { Text($0.1).tag($0.0) }
                }
                TextField("Region", text: $model.draft.brand.region)
                TextField("Channels, comma separated", text: $model.draft.brand.channels)
                TextField("Competitors", text: $model.draft.brand.competitors, axis: .vertical)
                TextField("Tone of voice", text: $model.draft.brand.toneOfVoice)
                Picker("Stage", selection: $model.draft.brand.stage) {
                    Text("Not set").tag("")
                    ForEach(stages, id: \.0) { Text($0.1).tag($0.0) }
                }
                TextField("Goals", text: $model.draft.brand.goals, axis: .vertical)
                TextField("Current numbers", text: $model.draft.brand.metricsNote, axis: .vertical)
                TextField("Constraints", text: $model.draft.brand.constraints, axis: .vertical)
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section {
                if model.running {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Writing your program. This can take up to a minute.").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                    }
                } else {
                    let ready = !model.draft.brand.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    Button("Generate") {
                        Task { if await model.generate() { showResult = true } }
                    }
                    .buttonStyle(GlowButtonStyle())
                    .disabled(!ready)
                    .opacity(ready ? 1 : 0.4)
                }
                if let error = model.error {
                    Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
                }
                if model.output != nil {
                    Button { showResult = true } label: { Label("Last program", systemImage: "doc.text") }
                }
            }
            .listRowBackground(Color.clear)
            Section {
                NavigationLink { RouteView(path: "/kolab/studio", title: "Kolab Studio") } label: {
                    Label("Kolab Studio (creator tools)", systemImage: "person.3")
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Kolab")
        .navigationDestination(isPresented: $showResult) { KolabResultView(text: model.output ?? "", title: Kolab.label(model.draft.mode)) }
        .onChange(of: model.draft.brief) { _, text in
            if text.count > Kolab.briefLimit { model.draft.brief = String(text.prefix(Kolab.briefLimit)) }
        }
    }
}

struct KolabResultView: View {
    let text: String
    let title: String

    var body: some View {
        VStack(spacing: 12) {
            ActionBar {
                CopyAction(text: text)
                ShareAction(name: "kolab-\(title)", ext: "md", text: text)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            Text("Saved to Generations on this phone.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            OutputBody(text: text, format: "markdown")
        }
        .background(Starfield())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
