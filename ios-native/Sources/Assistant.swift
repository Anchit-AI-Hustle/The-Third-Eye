import SwiftUI

struct ChatMessage: Identifiable, Equatable {
    enum Role { case user, assistant }
    let id = UUID()
    let role: Role
    var text: String
    var tools: [String] = []
    var steps: [Step] = []
    var actions: [PendingAction] = []
    var links: [ActionLink] = []
    var error: String?

    var isEmpty: Bool { text.isEmpty && tools.isEmpty && actions.isEmpty && links.isEmpty }
}

struct Step: Equatable {
    let title: String
    let status: String
}

// Something the assistant wants to do that the person did not ask for in so
// many words: shown exactly as it will run, and run only on their OK.
struct PendingAction: Identifiable, Equatable {
    enum State: Equatable { case waiting, running, done(String), failed(String), cancelled }
    let id: String
    let tool: String
    let args: Data
    let summary: String
    let url: URL?
    let openLabel: String?
    var state: State = .waiting
}

struct ActionLink: Identifiable, Equatable {
    let id = UUID()
    let url: URL
    let label: String
    let outreach: Bool
}

// Streams a reply from /api/chat (server-sent events: text, tool, checklist,
// confirm, done, error), the same endpoint and tool loop the website uses.
@MainActor
final class Chat: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published private(set) var busy = false

    private var current: Task<Void, Never>?

    func send(_ text: String, onFinish: ((ChatMessage) -> Void)? = nil) {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty, !busy else { return }
        let history = messages.suffix(12).compactMap { m -> [String: String]? in
            m.text.isEmpty ? nil : ["role": m.role == .user ? "user" : "assistant", "content": m.text]
        }
        messages.append(ChatMessage(role: .user, text: message))
        messages.append(ChatMessage(role: .assistant, text: ""))
        let index = messages.count - 1
        busy = true
        current = Task {
            let body: [String: Any] = ["message": message, "history": history, "timezone": TimeZone.current.identifier]
            do {
                let (bytes, response) = try await API.session.bytes(for: API.request("POST", "/api/chat", json: body))
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard status == 200 else { throw APIError(status: status) }
                var event = ""
                for try await line in bytes.lines {
                    if line.hasPrefix("event: ") {
                        event = String(line.dropFirst(7))
                    } else if line.hasPrefix("data: "), let data = line.dropFirst(6).data(using: .utf8),
                              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        handle(event, json, at: index)
                    }
                }
            } catch is CancellationError {
            } catch {
                messages[index].error = error.localizedDescription
            }
            if messages[index].error == nil, messages[index].isEmpty {
                messages[index].error = "No reply came back. Try again."
            }
            busy = false
            onFinish?(messages[index])
        }
    }

    private func handle(_ event: String, _ json: [String: Any], at index: Int) {
        switch event {
        case "text":
            messages[index].text += json["text"] as? String ?? ""
        case "tool":
            if let name = json["name"] as? String { messages[index].tools.append(name.replacingOccurrences(of: "_", with: " ")) }
        case "checklist":
            let steps = json["steps"] as? [[String: Any]] ?? []
            messages[index].steps = steps.map { Step(title: $0["title"] as? String ?? "", status: $0["status"] as? String ?? "pending") }
        case "confirm":
            guard let tool = json["tool"] as? String else { return }
            let args = (try? JSONSerialization.data(withJSONObject: json["args"] ?? [String: Any]())) ?? Data("{}".utf8)
            let url = (json["clientAction"] as? Bool == true) ? (json["url"] as? String).flatMap(URL.init(string:)) : nil
            messages[index].actions.append(PendingAction(
                id: json["id"] as? String ?? UUID().uuidString, tool: tool, args: args,
                summary: json["summary"] as? String ?? tool, url: url, openLabel: json["openLabel"] as? String))
        case "done":
            let effects = json["sideEffects"] as? [[String: Any]] ?? []
            for fx in effects where fx["type"] as? String == "open_url" {
                let data = fx["data"] as? [String: Any] ?? [:]
                guard let raw = (data["nativeUrl"] as? String) ?? (data["url"] as? String), let url = URL(string: raw) else { continue }
                let outreach = data["action"] != nil && data["missingPhone"] as? Bool != true
                messages[index].links.append(ActionLink(url: url, label: data["label"] as? String ?? "Open", outreach: outreach))
            }
            // Asked for in so many words (message, call, text): open it now, like the website.
            if let first = messages[index].links.first(where: \.outreach) { UIApplication.shared.open(first.url) }
        case "error":
            messages[index].error = json["message"] as? String ?? "Something went wrong."
        default:
            break
        }
    }

    /// The newest action still waiting for the person's OK.
    var waitingAction: PendingAction? {
        messages.last(where: { $0.role == .assistant })?.actions.last(where: { $0.state == .waiting })
    }

    /// Runs an approved action exactly as it was shown, and says what happened.
    @discardableResult
    func approve(_ action: PendingAction) async -> String {
        guard let at = locate(action) else { return "" }
        set(at, .running)
        let outcome: PendingAction.State
        if let url = action.url {
            outcome = await UIApplication.shared.open(url) ? .done(action.openLabel ?? "Opened") : .failed("Couldn't open that on this iPhone.")
        } else {
            do {
                let args = try JSONSerialization.jsonObject(with: action.args)
                let data = try await API.send("POST", "/api/act", json: ["tool": action.tool, "args": args])
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                if json?["ok"] as? Bool == false {
                    outcome = .failed(json?["result"] as? String ?? "It didn't go through.")
                } else {
                    if let raw = json?["openUrl"] as? String, let url = URL(string: raw) { _ = await UIApplication.shared.open(url) }
                    outcome = .done(json?["result"] as? String ?? "Done.")
                }
            } catch {
                outcome = .failed(error.localizedDescription)
            }
        }
        set(at, outcome)
        switch outcome {
        case .done(let text): return text
        case .failed(let text): return "That didn't work: \(text)"
        default: return ""
        }
    }

    func cancel(_ action: PendingAction) {
        if let at = locate(action) { set(at, .cancelled) }
    }

    private func locate(_ action: PendingAction) -> (Int, Int)? {
        for (m, message) in messages.enumerated() {
            if let a = message.actions.firstIndex(where: { $0.id == action.id }) { return (m, a) }
        }
        return nil
    }

    private func set(_ at: (Int, Int), _ state: PendingAction.State) {
        messages[at.0].actions[at.1].state = state
    }

    func stop() {
        current?.cancel()
        busy = false
    }

    func clear() {
        stop()
        messages = []
    }
}

struct AssistantView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var chat = Chat()
    @StateObject private var voice = Voice()
    @State private var draft = ""
    @State private var callMode = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                Starfield()
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 14) {
                            if chat.messages.isEmpty { emptyState }
                            ForEach(chat.messages) { m in
                                MessageBubble(message: m, busy: chat.busy && m.id == chat.messages.last?.id,
                                              approve: { action in Task { await chat.approve(action) } },
                                              cancel: { chat.cancel($0) })
                            }
                            Color.clear.frame(height: 1).id("end")
                        }
                        .padding(16)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: chat.messages) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                }
            }
            .safeAreaInset(edge: .bottom) { composer }
            .onAppear(perform: takePendingAsk)
            .onChange(of: app.pendingAsk) { _, _ in takePendingAsk() }
            .navigationTitle("Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { chat.clear() } label: { Image(systemName: "square.and.pencil") }
                        .accessibilityLabel("New chat")
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image("LaunchLogo").resizable().scaledToFit().frame(maxWidth: 180)
            StatusPill(text: "All systems online")
            Text("Ask anything, or tap the phone to talk hands-free.")
                .font(.system(size: 15))
                .foregroundStyle(Theme.secondary)
                .multilineTextAlignment(.center)
            ForEach(["Give me my morning briefing", "What's due today?", "Remind me to call Mom at 7pm"], id: \.self) { s in
                Button(s) { chat.send(s, onFinish: replied) }
                    .font(.system(size: 14))
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Theme.surface, in: Capsule())
                    .overlay(Capsule().stroke(Theme.border))
            }
        }
        .padding(.top, 40)
    }

    private var composer: some View {
        VStack(spacing: 6) {
            if callMode || voice.listening || voice.speaking {
                Text(voice.speaking ? "Speaking…" : voice.listening ? (voice.partial.isEmpty ? "Listening…" : voice.partial) : "Call mode: speak naturally")
                    .font(.system(size: 13))
                    .foregroundStyle(voice.listening ? Theme.blue : Theme.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let error = voice.error {
                Text(error).font(.system(size: 12)).foregroundStyle(Theme.red).frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Message The Third Eye", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .focused($focused)
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border))
                    .submitLabel(.send)
                    .onSubmit(sendDraft)
                circleButton(voice.listening && !callMode ? "stop.fill" : "mic.fill", active: voice.listening && !callMode, label: "Dictate") { dictate() }
                circleButton(callMode ? "phone.down.fill" : "phone.fill", active: callMode, label: callMode ? "End call" : "Call") { toggleCall() }
                if chat.busy {
                    circleButton("stop.circle.fill", active: false, label: "Stop") { chat.stop() }
                } else {
                    circleButton("arrow.up", active: !draft.isEmpty, label: "Send") { sendDraft() }
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .padding(.horizontal, 12).padding(.top, 8).padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private func circleButton(_ icon: String, active: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .frame(width: 42, height: 42)
                .foregroundStyle(active ? Theme.background : Theme.blue)
                .background(active ? Theme.blue : Theme.surface, in: Circle())
                .overlay(Circle().stroke(Theme.border))
        }
        .accessibilityLabel(label)
    }

    private func takePendingAsk() {
        guard let ask = app.pendingAsk else { return }
        app.pendingAsk = nil
        chat.send(ask, onFinish: replied)
    }

    private func sendDraft() {
        let text = draft
        draft = ""
        chat.send(text, onFinish: replied)
    }

    private func dictate() {
        if voice.listening { voice.stopListening(); return }
        focused = false
        Task { await voice.listen { said in if !said.isEmpty { draft = draft.isEmpty ? said : "\(draft) \(said)" } } }
    }

    // Call mode: listen, send when the person pauses, speak the reply, listen
    // again. An action waiting for an OK is answered by voice: yes runs it,
    // no drops it, anything else is a new request.
    private func toggleCall() {
        callMode.toggle()
        if callMode { focused = false; listenForCall() } else { voice.stopListening(); voice.stopSpeaking() }
    }

    private func listenForCall() {
        guard callMode, !chat.busy else { return }
        Task {
            await voice.listen { said in
                guard callMode else { return }
                if said.isEmpty { return listenForCall() }
                if let action = chat.waitingAction, let answer = VoiceAnswer(said) {
                    if answer == .yes {
                        Task { say(await chat.approve(action)) }
                    } else {
                        chat.cancel(action)
                        say("Okay, I won't.")
                    }
                } else {
                    chat.send(said, onFinish: replied)
                }
            }
            // Mic or permission trouble: stop the call rather than loop on it.
            if voice.error != nil { callMode = false }
        }
    }

    private func replied(_ message: ChatMessage) {
        guard callMode else { return }
        var spoken = message.error ?? message.text
        if message.error == nil, let action = message.actions.last(where: { $0.state == .waiting }), !spoken.localizedCaseInsensitiveContains("?") {
            spoken += " Shall I go ahead and \(action.summary)? Say yes or no."
        }
        say(spoken)
    }

    private func say(_ text: String) {
        guard callMode else { return }
        voice.speak(text.isEmpty ? "Done." : text) { listenForCall() }
    }
}

enum VoiceAnswer {
    case yes, no

    // Only a short, plain answer counts: "yes, and also..." is a new request.
    init?(_ said: String) {
        let words = said.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }
        guard !words.isEmpty, words.count <= 4 else { return nil }
        let phrase = words.joined(separator: " ")
        let yes = ["yes", "yeah", "yep", "yup", "sure", "ok", "okay", "go ahead", "do it", "send it", "confirm", "approve", "haan", "ha", "ji"]
        let no = ["no", "nope", "nah", "cancel", "don't", "dont", "stop", "nahi", "mat", "leave it"]
        if no.contains(where: { phrase == $0 || phrase.hasPrefix($0 + " ") }) { self = .no }
        else if yes.contains(where: { phrase == $0 || phrase.hasPrefix($0 + " ") }) { self = .yes }
        else { return nil }
    }
}

struct MessageBubble: View {
    let message: ChatMessage
    let busy: Bool
    let approve: (PendingAction) -> Void
    let cancel: (PendingAction) -> Void

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 8) {
                if !message.steps.isEmpty { StepList(steps: message.steps) }
                if !message.tools.isEmpty { FlowTools(tools: message.tools) }
                if !message.text.isEmpty {
                    Text(markdown(message.text))
                        .font(.system(size: 15))
                        .textSelection(.enabled)
                } else if busy, message.error == nil {
                    ProgressView().tint(Theme.blue)
                }
                ForEach(message.actions) { ActionCard(action: $0, approve: approve, cancel: cancel) }
                ForEach(message.links) { link in
                    Link(destination: link.url) { Label(link.label, systemImage: "arrow.up.right.square") }
                        .font(.system(size: 14, weight: .semibold))
                }
                if let error = message.error {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.red)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(message.role == .user ? Theme.elevated : Theme.surface.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(message.error == nil ? Theme.border : Theme.red.opacity(0.4)))
            if message.role == .assistant { Spacer(minLength: 24) }
        }
    }

    private func markdown(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }
}

// Shows the action word for word, and runs it only on Approve.
struct ActionCard: View {
    let action: PendingAction
    let approve: (PendingAction) -> Void
    let cancel: (PendingAction) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Needs your OK", systemImage: "hand.raised.fill")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Theme.violet)
            Text(action.summary).font(.system(size: 14))
            switch action.state {
            case .waiting:
                HStack(spacing: 10) {
                    Button(action.openLabel ?? "Approve") { approve(action) }.buttonStyle(GlowButtonStyle())
                    Button("Cancel") { cancel(action) }.foregroundStyle(Theme.secondary)
                }
            case .running:
                ProgressView().tint(Theme.blue)
            case .done(let text):
                Label(text, systemImage: "checkmark.circle.fill").font(.system(size: 13)).foregroundStyle(Theme.blue)
            case .failed(let text):
                Label(text, systemImage: "xmark.octagon").font(.system(size: 13)).foregroundStyle(Theme.red)
            case .cancelled:
                Text("Cancelled. Nothing was sent.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
        }
        .padding(12)
        .background(Theme.background.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.violet.opacity(0.4)))
    }
}

struct StepList: View {
    let steps: [Step]
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
                Label(step.title, systemImage: icon(step.status))
                    .font(.system(size: 12))
                    .foregroundStyle(step.status == "failed" ? Theme.red : step.status == "done" ? Theme.blue : Theme.secondary)
            }
        }
    }

    private func icon(_ status: String) -> String {
        switch status {
        case "done": return "checkmark.circle.fill"
        case "failed": return "xmark.circle"
        case "awaiting": return "hand.raised"
        case "active": return "circle.dotted"
        default: return "circle"
        }
    }
}

struct FlowTools: View {
    let tools: [String]
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(tools.enumerated()), id: \.offset) { _, tool in
                Label(tool, systemImage: "bolt.fill")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Theme.blue)
            }
        }
    }
}
