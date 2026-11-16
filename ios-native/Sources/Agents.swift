import AVFoundation
import SwiftUI

// "Run status check": each system says one of its lines in its own accent, pitch
// and pace, one after another.
@MainActor
final class StatusCheck: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var current: String?
    @Published private(set) var running = false

    private let synthesizer = AVSpeechSynthesizer()
    private var task: Task<Void, Never>?
    private var spoken: CheckedContinuation<Void, Never>?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func start(_ systems: [AgentSystem]) {
        guard !running else { return }
        running = true
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        task = Task {
            for system in systems {
                if Task.isCancelled { break }
                guard let line = system.lines.randomElement() else { continue }
                current = system.id
                await speak(line, as: system)
            }
            current = nil
            running = false
        }
    }

    func stop() {
        task?.cancel()
        synthesizer.stopSpeaking(at: .immediate)
        finishLine()
        current = nil
        running = false
    }

    private func speak(_ line: String, as system: AgentSystem) async {
        let utterance = AVSpeechUtterance(string: line)
        utterance.voice = Voice.best(language: system.lang, gender: system.gender == "female" ? .female : system.gender == "male" ? .male : .unspecified)
        utterance.pitchMultiplier = Float(min(2, max(0.5, system.pitch)))
        let pace = AVSpeechUtteranceDefaultSpeechRate * Float(system.rate)
        utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, max(AVSpeechUtteranceMinimumSpeechRate, pace))
        await withCheckedContinuation { continuation in
            spoken = continuation
            synthesizer.speak(utterance)
        }
    }

    private func finishLine() {
        spoken?.resume()
        spoken = nil
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finishLine() }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finishLine() }
    }
}

struct AgentsView: View {
    @ObservedObject private var catalog = Catalog.shared
    @ObservedObject private var log = AgentLog.shared
    @StateObject private var check = StatusCheck()
    @State private var href: String?

    var body: some View {
        List {
            if let all = catalog.data?.systems {
                let systems = all.filter { $0.kind == "agent" } + all.filter { $0.kind != "agent" }
                Section {
                    Button {
                        if check.running { check.stop() } else { check.start(systems) }
                    } label: {
                        Label(check.running ? "Stop" : "Run status check", systemImage: check.running ? "stop.fill" : "waveform")
                    }
                    Text(log.killed ? "The kill switch is on: every system is halted." : "All systems online.")
                        .font(.system(size: 12))
                        .foregroundStyle(log.killed ? Theme.red : Theme.muted)
                }
                .listRowBackground(Theme.surface.opacity(0.7))
                ForEach(systems) { system in
                    HStack(alignment: .top, spacing: 12) {
                        Circle().fill(Color(hex: system.accentColor)).frame(width: 12, height: 12).padding(.top, 4)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(system.name).font(.system(size: 16, weight: .semibold))
                                Spacer()
                                Text(log.killed ? "Halted" : "Online")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(log.killed ? Theme.red : Theme.green)
                            }
                            Text(system.purpose).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                            Button("Open") { href = system.href }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(check.current == system.id ? Color(hex: system.accentColor).opacity(0.22) : Theme.surface.opacity(0.7))
                }
            } else if let error = catalog.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Online Agents")
        .refreshable { await catalog.load(force: true) }
        .task { await catalog.load() }
        .onDisappear { check.stop() }
        .overlay { if catalog.data == nil && catalog.error == nil { ProgressView() } }
        .opensHrefs($href)
    }
}
