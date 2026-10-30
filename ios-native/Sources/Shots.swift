import AVKit
import SwiftUI

/// Video and Reel Studio's shot list: plan the script into shots, render each as a paid clip, as the web's VideoScenes.
enum Shots {
    struct Scene: Decodable, Identifiable, Equatable {
        let n: Int
        let title: String
        let seconds: Int
        let prompt: String
        let narration: String?
        var id: Int { n }
    }

    static let credits = 50

    static func aspect(tool: String, inputs: [String: String]) -> String {
        tool == "reel" || (inputs["format"] ?? "").hasPrefix("Short-form") ? "9:16" : "16:9"
    }

    static func seconds(tool: String, inputs: [String: String]) -> Int? {
        tool == "reel" ? Int((inputs["length"] ?? "").prefix(while: \.isNumber)) : nil
    }
}

@MainActor
final class ShotsModel: ObservableObject {
    enum Job: Equatable {
        case rendering
        case done(String)
        case failed(String)
    }

    @Published var scenes: [Shots.Scene]?
    @Published var planning = false
    @Published var error: String?
    @Published var jobs: [Int: Job] = [:]

    let tool: String
    let title: String
    let script: String
    let inputs: [String: String]
    var aspect: String { Shots.aspect(tool: tool, inputs: inputs) }

    init(tool: String, title: String, script: String, inputs: [String: String]) {
        self.tool = tool
        self.title = title
        self.script = script
        self.inputs = inputs
    }

    private struct Plan: Decodable { let scenes: [Shots.Scene] }
    private struct Started: Decodable { let jobId: String }
    private struct Poll: Decodable { let status: String?; let url: String?; let error: String? }

    func plan() async {
        planning = true
        error = nil
        var body: [String: Any] = ["script": script]
        if let seconds = Shots.seconds(tool: tool, inputs: inputs) { body["seconds"] = seconds }
        do {
            scenes = try await API.call("POST", "/api/tools/video", json: body, as: Plan.self).scenes
        } catch {
            self.error = error.localizedDescription
        }
        planning = false
    }

    func render(_ scene: Shots.Scene) async {
        jobs[scene.n] = .rendering
        do {
            let job = try await API.call("POST", "/api/tools/video",
                                         json: ["scene": ["prompt": scene.prompt, "seconds": scene.seconds, "aspect": aspect]],
                                         as: Started.self)
            let giveUp = Date().addingTimeInterval(600)
            while Date() < giveUp {
                try await Task.sleep(nanoseconds: 4_000_000_000)
                let s = try await API.call("GET", "/api/tools/video?id=\(job.jobId)", as: Poll.self)
                if s.status == "succeeded", let url = s.url {
                    jobs[scene.n] = .done(url)
                    GenerationStore.shared.add(app: "video", tool: tool, appLabel: tool == "reel" ? "Reel Studio · Clip" : "Video Studio · Clip",
                                               title: "\(title) - \(scene.n). \(scene.title)", kind: "video",
                                               inputs: [.init(label: "Shot prompt", value: scene.prompt), .init(label: "Length", value: "\(scene.seconds)s")],
                                               output: url)
                    return
                }
                if s.status == "failed" || s.status == "canceled" || s.error != nil {
                    jobs[scene.n] = .failed(s.error ?? "Render failed.")
                    return
                }
            }
            jobs[scene.n] = .failed("Still not finished after 10 minutes. The provider may be stuck; try again.")
        } catch {
            jobs[scene.n] = .failed(error.localizedDescription)
        }
    }
}

struct ShotsView: View {
    @StateObject private var model: ShotsModel
    @State private var confirm: Shots.Scene?

    init(tool: String, title: String, script: String, inputs: [String: String]) {
        _model = StateObject(wrappedValue: ShotsModel(tool: tool, title: title, script: script, inputs: inputs))
    }

    var body: some View {
        Form {
            if let scenes = model.scenes {
                if scenes.isEmpty {
                    Text("No shots came back. Plan again.").font(.system(size: 13)).foregroundStyle(Theme.amber)
                }
                ForEach(scenes) { scene in
                    Section { shot(scene) }.listRowBackground(Theme.surface.opacity(0.7))
                }
                Text("Rendered clips are saved to Generations. To cut them into one episode with a soundtrack, open this studio on the web.")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    Text("Turn the script into a shot list, then render the shots you want as \(model.aspect) clips.")
                        .font(.system(size: 13)).foregroundStyle(Theme.secondary)
                    if model.planning {
                        HStack(spacing: 10) { ProgressView(); Text("Planning shots…").font(.system(size: 13)) }
                    } else {
                        Button("Plan shots") { Task { await model.plan() } }.buttonStyle(GlowButtonStyle())
                    }
                }
                .listRowBackground(Color.clear)
            }
            if let error = model.error {
                Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Shots")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Render shot \(confirm?.n ?? 0)?", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } })) {
            Button("Render") { if let scene = confirm { Task { await model.render(scene) } } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("A \(confirm?.seconds ?? 0)s clip is a paid render: \(Shots.credits) credits, refunded if it fails to start.")
        }
    }

    @ViewBuilder
    private func shot(_ scene: Shots.Scene) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(scene.n). \(scene.title) · \(scene.seconds)s").font(.system(size: 14, weight: .medium))
            Text(scene.prompt).font(.system(size: 12)).foregroundStyle(Theme.secondary)
            if let line = scene.narration, !line.isEmpty {
                Text("Voice-over: \(line)").font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            switch model.jobs[scene.n] {
            case .rendering:
                HStack(spacing: 8) { ProgressView(); Text("Rendering. Clips take a few minutes.").font(.system(size: 12)) }
            case .done(let url):
                VideoPlayer(player: AVPlayer(url: API.url(url)))
                    .aspectRatio(model.aspect == "9:16" ? 9.0 / 16.0 : 16.0 / 9.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            case .failed(let msg):
                Text(msg).font(.system(size: 12)).foregroundStyle(Theme.red)
                Button("Try again") { confirm = scene }
            case nil:
                Button("Render clip") { confirm = scene }
            }
        }
    }
}
