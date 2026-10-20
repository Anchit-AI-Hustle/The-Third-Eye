import AVFoundation
import Speech

// Native voice: Apple's speech recognizer (on the iPhone when it can) for what
// the person says, and the system voice for replies. Listening stops while a
// reply is spoken so the assistant never hears itself.
@MainActor
final class Voice: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    @Published private(set) var listening = false
    @Published private(set) var speaking = false
    @Published private(set) var partial = ""
    @Published var error: String?

    private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let engine = AVAudioEngine()
    private let synthesizer = AVSpeechSynthesizer()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silence: Task<Void, Never>?
    private var onFinal: ((String) -> Void)?
    private var onSpoken: (() -> Void)?

    // How long a pause ends what the person is saying.
    private let endOfSpeech: Duration = .milliseconds(1600)

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func authorize() async -> Bool {
        let speech = await withCheckedContinuation { cont in
            SFSpeechRecognizer.requestAuthorization { cont.resume(returning: $0 == .authorized) }
        }
        let mic = await AVAudioApplication.requestRecordPermission()
        if !speech || !mic { error = "Allow Microphone and Speech Recognition for The Third Eye in Settings." }
        return speech && mic
    }

    /// Listens until the person pauses, then hands over what they said (empty
    /// when they said nothing).
    func listen(onFinal: @escaping (String) -> Void) async {
        guard !listening else { return }
        guard await authorize() else { return }
        guard let recognizer, recognizer.isAvailable else {
            error = "Speech recognition isn't available right now."
            return
        }
        stopSpeaking()
        error = nil
        partial = ""
        self.onFinal = onFinal
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .allowBluetooth, .duckOthers])
            try audio.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            // Apple's server model is markedly more accurate than on-device,
            // above all for Indian English; it falls back on its own offline.
            request.taskHint = .dictation
            self.request = request

            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()
            listening = true

            task = recognizer.recognitionTask(with: request) { [weak self] result, err in
                Task { @MainActor in
                    guard let self else { return }
                    if let result {
                        self.partial = result.bestTranscription.formattedString
                        if result.isFinal { self.finish() } else { self.armSilenceTimer() }
                    } else if err != nil, self.listening {
                        self.finish()
                    }
                }
            }
        } catch {
            self.error = "Couldn't start the microphone."
            stopListening()
        }
    }

    private func armSilenceTimer() {
        silence?.cancel()
        silence = Task { [endOfSpeech] in
            try? await Task.sleep(for: endOfSpeech)
            guard !Task.isCancelled else { return }
            finish()
        }
    }

    private func finish() {
        guard listening else { return }
        let text = partial.trimmingCharacters(in: .whitespacesAndNewlines)
        let deliver = onFinal
        stopListening()
        deliver?(text)
    }

    func stopListening() {
        silence?.cancel()
        silence = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        onFinal = nil
        listening = false
    }

    func speak(_ text: String, then: (() -> Void)? = nil) {
        let clean = Voice.speakable(text)
        guard !clean.isEmpty else { then?(); return }
        stopListening()
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
        try? AVAudioSession.sharedInstance().setActive(true)
        onSpoken = then
        let utterance = AVSpeechUtterance(string: clean)
        // Voices are named by BCP 47 tags (en-IN); Locale identifiers use an underscore (en_IN).
        let tag = [Locale.current.language.languageCode?.identifier, Locale.current.region?.identifier].compactMap { $0 }.joined(separator: "-")
        utterance.voice = AVSpeechSynthesisVoice(language: tag) ?? AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        speaking = true
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        onSpoken = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        speaking = false
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            self.speaking = false
            let next = self.onSpoken
            self.onSpoken = nil
            next?()
        }
    }

    /// Markdown and links read badly aloud: speak the words only.
    static func speakable(_ text: String) -> String {
        var s = text
        s = s.replacingOccurrences(of: #"\[([^\]]+)\]\([^)]+\)"#, with: "$1", options: .regularExpression)
        s = s.replacingOccurrences(of: #"https?://\S+"#, with: "", options: .regularExpression)
        s = s.replacingOccurrences(of: #"[*_`#>|]"#, with: "", options: .regularExpression)
        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
