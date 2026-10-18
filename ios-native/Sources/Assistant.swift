import SwiftUI

struct ChatMessage: Identifiable, Equatable {
    enum Role { case user, assistant }
    let id = UUID()
    let role: Role
    var text: String
    var tools: [String] = []
    var error: String?
}

// Streams a reply from /api/chat (server-sent events: text, tool, done, error),
// the same endpoint and tool loop the website uses.
@MainActor
final class Chat: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published private(set) var busy = false

    private var current: Task<Void, Never>?

    func send(_ text: String, onReply: ((String) -> Void)? = nil) {
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
            defer { busy = false }
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
            if messages[index].error == nil, messages[index].text.isEmpty, messages[index].tools.isEmpty {
                messages[index].error = "No reply came back. Try again."
            }
            if messages[index].error == nil { onReply?(messages[index].text) }
        }
    }

    private func handle(_ event: String, _ json: [String: Any], at index: Int) {
        switch event {
        case "text":
            messages[index].text += json["text"] as? String ?? ""
        case "tool":
            if let name = json["name"] as? String { messages[index].tools.append(name.replacingOccurrences(of: "_", with: " ")) }
        case "error":
            messages[index].error = json["message"] as? String ?? "Something went wrong."
        default:
            break
        }
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
                            ForEach(chat.messages) { MessageBubble(message: $0, busy: chat.busy && $0.id == chat.messages.last?.id) }
                            Color.clear.frame(height: 1).id("end")
                        }
                        .padding(16)
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: chat.messages) { _, _ in withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
                }
            }
            .safeAreaInset(edge: .bottom) { composer }
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
                Button(s) { chat.send(s, onReply: replyHandler) }
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

    private func sendDraft() {
        let text = draft
        draft = ""
        chat.send(text, onReply: replyHandler)
    }

    private func dictate() {
        if voice.listening { voice.stopListening(); return }
        focused = false
        Task { await voice.listen { draft = draft.isEmpty ? $0 : "\(draft) \($0)" } }
    }

    // Call mode: listen, send when the person pauses, speak the reply, listen again.
    private func toggleCall() {
        callMode.toggle()
        if callMode { focused = false; listenForCall() } else { voice.stopListening(); voice.stopSpeaking() }
    }

    private func listenForCall() {
        guard callMode else { return }
        Task { await voice.listen { chat.send($0, onReply: replyHandler) } }
    }

    private func replyHandler(_ reply: String) {
        guard callMode else { return }
        voice.speak(reply) { listenForCall() }
    }
}

struct MessageBubble: View {
    let message: ChatMessage
    let busy: Bool

    var body: some View {
        HStack {
            if message.role == .user { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 8) {
                if !message.tools.isEmpty {
                    FlowTools(tools: message.tools)
                }
                if !message.text.isEmpty {
                    Text(markdown(message.text))
                        .font(.system(size: 15))
                        .textSelection(.enabled)
                } else if busy, message.error == nil {
                    ProgressView().tint(Theme.blue)
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
