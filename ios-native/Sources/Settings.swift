import SwiftUI

struct GoogleStatus: Decodable {
    struct Caps: Decodable {
        let gmailRead: Bool?
        let gmailSend: Bool?
        let calendarRead: Bool?
    }

    let connected: Bool
    let capabilities: Caps?
    let available: Bool?
}

struct GitHubStatus: Decodable {
    let connected: Bool
    let login: String?
}

@MainActor
final class ConnectionsModel: ObservableObject {
    @Published var google: GoogleStatus?
    @Published var github: GitHubStatus?
    @Published var error: String?
    @Published var busy = false

    func load() async {
        google = try? await API.call("GET", "/api/connect/google/status", as: GoogleStatus.self)
        github = try? await API.call("GET", "/api/connect/github/status", as: GitHubStatus.self)
    }

    func disconnectGoogle() async {
        await run { try await API.fetch("DELETE", "/api/connect/google") }
    }

    func connectGitHub(token: String) async -> Bool {
        await run { try await API.fetch("POST", "/api/connect/github", json: ["token": token]) }
    }

    func disconnectGitHub() async {
        await run { try await API.fetch("DELETE", "/api/connect/github") }
    }

    @discardableResult
    private func run(_ call: () async throws -> Data) async -> Bool {
        busy = true
        error = nil
        defer { busy = false }
        do {
            _ = try await call()
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct WhatsAppState: Decodable {
    let configured: Bool
    let jarvisNumber: String?
    let linked: Bool
    let phone: String?
    let notify: Bool
}

struct WhatsAppLinkStart: Decodable {
    let code: String
    let link: String?
}

@MainActor
final class WhatsAppModel: ObservableObject {
    @Published var state: WhatsAppState?
    @Published var code: String?
    @Published var error: String?

    func load() async {
        do {
            state = try await API.call("GET", "/api/whatsapp/link", as: WhatsAppState.self)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// The one-time code, and the wa.me link that sends it.
    func startLink() async -> URL? {
        error = nil
        do {
            let start = try await API.call("POST", "/api/whatsapp/link", as: WhatsAppLinkStart.self)
            code = start.code
            return start.link.flatMap(URL.init(string:))
        } catch {
            self.error = error.localizedDescription
            return nil
        }
    }

    func setNotify(_ on: Bool) async {
        do { try await API.fetch("PATCH", "/api/whatsapp/link", json: ["notify": on]) } catch { self.error = error.localizedDescription }
        await load()
    }

    func unlink() async {
        do { try await API.fetch("DELETE", "/api/whatsapp/link") } catch { self.error = error.localizedDescription }
        code = nil
        await load()
    }
}

struct LastRun: Decodable {
    let channel: String
    let status: String
    let at: String
}

struct Automation: Decodable, Identifiable {
    let id: String
    let name: String
    let action: String?
    let fireAt: String
    let recurrence: String?
    var status: String
    let lastRun: LastRun?
}

@MainActor
final class AutomationsModel: ObservableObject {
    @Published var items: [Automation] = []
    @Published var loaded = false
    @Published var error: String?

    private struct Listing: Decodable { let automations: [Automation] }

    func load() async {
        do {
            items = try await API.call("GET", "/api/automations", as: Listing.self).automations
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func toggle(_ item: Automation) async {
        let next = item.status == "paused" ? "pending" : "paused"
        if let index = items.firstIndex(where: { $0.id == item.id }) { items[index].status = next }
        do { try await DataStore.update("reminders", id: item.id, ["status": next]) } catch {
            self.error = error.localizedDescription
            await load()
        }
        await Reminders.sync()
    }

    func delete(_ item: Automation) async {
        items.removeAll { $0.id == item.id }
        do { try await DataStore.delete("reminders", id: item.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
        await Reminders.sync()
    }
}

struct ProviderHealth: Decodable, Identifiable {
    let provider: String
    let status: String
    let model: String?
    let reason: String?
    var id: String { provider }
}

struct OwnKey: Decodable, Identifiable {
    let provider: String
    let hint: String
    var id: String { provider }
}

enum ProviderKeys {
    static let all = ["gemini", "groq", "openrouter", "mistral", "cerebras", "openai", "huggingface", "ollama"]
    static let keyPages: [String: String] = [
        "gemini": "https://aistudio.google.com/apikey", "groq": "https://console.groq.com/keys", "openrouter": "https://openrouter.ai/keys",
        "mistral": "https://console.mistral.ai/api-keys", "cerebras": "https://cloud.cerebras.ai", "openai": "https://platform.openai.com/api-keys",
        "huggingface": "https://huggingface.co/settings/tokens",
    ]
}

/** A provider that lets other apps sign in to the user's own account. */
struct ProviderSignIn: Identifiable {
    let name: String
    let path: String
    let note: String
    var id: String { path }
    static let all = [
        ProviderSignIn(name: "OpenRouter", path: "/api/connect/openrouter", note: "Uses your own OpenRouter account — free models, or your credit for paid ones."),
        ProviderSignIn(name: "Hugging Face", path: "/api/connect/huggingface", note: "Uses your own Hugging Face account's inference credit for open models."),
    ]
}

@MainActor
final class ProvidersModel: ObservableObject {
    @Published var providers: [ProviderHealth] = []
    @Published var keys: [OwnKey] = []
    @Published var checking = false
    @Published var error: String?

    private struct Health: Decodable { let providers: [ProviderHealth] }
    private struct Keys: Decodable { let keys: [OwnKey] }

    func load() async {
        do {
            providers = try await API.call("GET", "/api/providers", as: Health.self).providers
            keys = try await API.call("GET", "/api/user/provider-keys", as: Keys.self).keys
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    func recheck() async {
        checking = true
        error = nil
        defer { checking = false }
        do {
            providers = try await API.call("POST", "/api/providers", as: Health.self).providers
        } catch let failure as ServerError where failure.status == 429 {
            error = "Wait a minute before re-checking"
        } catch {
            self.error = error.localizedDescription
        }
    }

    func addKey(provider: String, value: String) async -> Bool {
        error = nil
        do {
            try await API.fetch("PUT", "/api/user/provider-keys", json: ["provider": provider, "value": value])
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func removeKey(_ key: OwnKey) async {
        do { try await API.fetch("DELETE", "/api/user/provider-keys?provider=\(Fmt.query(key.provider))") } catch { self.error = error.localizedDescription }
        await load()
    }
}

struct LocalModelState: Decodable {
    let connected: Bool
    let host: String?
    let localFirst: Bool
    let model: String?
    let assistantModels: [String: String]
    let hasToken: Bool
}

struct LocalModelTest: Decodable {
    let ok: Bool
    let models: [String]?
    let ms: Int?
    let error: String?
}

@MainActor
final class LocalComputerModel: ObservableObject {
    @Published var state: LocalModelState?
    @Published var models: [String]?
    @Published var testLine: String?
    @Published var testOK = false
    @Published var error: String?
    @Published var busy = false

    func load() async {
        do {
            state = try await API.call("GET", "/api/user/local-model", as: LocalModelState.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    @discardableResult
    func save(_ body: [String: Any]) async -> Bool {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await API.fetch("PUT", "/api/user/local-model", json: body)
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func test() async {
        busy = true
        error = nil
        testLine = nil
        defer { busy = false }
        do {
            let result = try await API.call("POST", "/api/user/local-model", as: LocalModelTest.self)
            testOK = result.ok
            if result.ok {
                let found = result.models ?? []
                models = found
                testLine = "Connected — \(found.count) \(found.count == 1 ? "model" : "models"), \(result.ms ?? 0) ms"
            } else {
                testLine = result.error ?? "No answer."
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SystemStatus: Decodable {
    let ai: Bool?
    let openai: Bool?
    let database: Bool?
    let google_oauth: Bool?
    let serper: Bool?
    let cascade: [String: Bool]?
}

@MainActor
final class StatusModel: ObservableObject {
    @Published var status: SystemStatus?

    func load() async {
        status = try? await API.call("GET", "/api/status", as: SystemStatus.self)
    }
}

struct SettingsView: View {
    @StateObject private var connections = ConnectionsModel()
    @StateObject private var whatsApp = WhatsAppModel()
    @StateObject private var automations = AutomationsModel()
    @StateObject private var providers = ProvidersModel()
    @StateObject private var status = StatusModel()

    var body: some View {
        List {
            AccountSection()
            ConnectionsSection(model: connections)
            WhatsAppSection(model: whatsApp)
            AutomationsSection(model: automations)
            ProvidersSection(model: providers)
            Section("Permissions") {
                PermissionTiles()
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
            AboutSection(model: status)
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Settings")
        .refreshable { await loadAll() }
        .task { await loadAll() }
    }

    private func loadAll() async {
        async let google: Void = connections.load()
        async let chat: Void = whatsApp.load()
        async let jobs: Void = automations.load()
        async let models: Void = providers.load()
        async let system: Void = status.load()
        await google
        await chat
        await jobs
        await models
        await system
    }
}

struct AccountSection: View {
    @EnvironmentObject private var session: Session
    @State private var confirming = false
    @State private var deleting = false
    @State private var failure: String?

    var body: some View {
        Section("Account") {
            VStack(alignment: .leading, spacing: 3) {
                Text(session.name ?? "Signed in").font(.system(size: 16, weight: .semibold))
                if let email = session.email { Text(email).font(.system(size: 13)).foregroundStyle(Theme.secondary) }
            }
            Button("Sign out", role: .destructive) { session.signOut() }
            Button("Delete account", role: .destructive) { confirming = true }
                .disabled(deleting)
                .confirmationDialog("Delete your account?", isPresented: $confirming, titleVisibility: .visible) {
                    Button("Delete everything", role: .destructive) { Task { @MainActor in await deleteAccount() } }
                } message: {
                    Text("This permanently deletes your tasks, notes, goals, documents, chats and every other record, and your sign-in. It can't be undone.")
                }
            if deleting { ProgressView() }
            if let failure { Text(failure).font(.system(size: 13)).foregroundStyle(Theme.red) }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func deleteAccount() async {
        deleting = true
        failure = nil
        defer { deleting = false }
        do {
            try await API.fetch("POST", "/api/account/delete")
            session.signOut()
        } catch let server as ServerError {
            let left = server.failed.isEmpty ? "" : " Not deleted: \(server.failed.joined(separator: ", "))."
            failure = (server.message ?? "Couldn't delete everything.") + left
        } catch {
            failure = error.localizedDescription
        }
    }
}

struct ConnectionsSection: View {
    @ObservedObject var model: ConnectionsModel
    @State private var connectingGoogle = false
    @State private var token = ""

    var body: some View {
        Section("Connections") {
            if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Label("Google", systemImage: "envelope")
                    Spacer()
                    if model.google?.connected == true {
                        Button("Disconnect", role: .destructive) { Task { await model.disconnectGoogle() } }
                            .buttonStyle(.borderless)
                    } else {
                        Button("Connect") { connectingGoogle = true }
                            .buttonStyle(.borderless)
                            .disabled(model.google?.available == false)
                    }
                }
                Text(googleLine).font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            .sheet(isPresented: $connectingGoogle, onDismiss: { Task { await model.load() } }) {
                NavigationStack {
                    WebScreen(path: "/api/connect/google")
                        .navigationTitle("Connect Google")
                        .navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { connectingGoogle = false } } }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label("GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                    Spacer()
                    if model.github?.connected == true {
                        Button("Disconnect", role: .destructive) { Task { await model.disconnectGitHub() } }
                            .buttonStyle(.borderless)
                    }
                }
                if model.github?.connected == true {
                    Text("Connected as \(model.github?.login ?? "your account")").font(.system(size: 12)).foregroundStyle(Theme.muted)
                } else {
                    SecureField("Personal access token", text: $token)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Connect GitHub") {
                        Task { @MainActor in if await model.connectGitHub(token: token.trimmingCharacters(in: .whitespacesAndNewlines)) { token = "" } }
                    }
                    .buttonStyle(.borderless)
                    .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy)
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private var googleLine: String {
        guard let google = model.google else { return "Checking…" }
        guard google.connected else { return google.available == false ? "Not available for this account." : "Not connected." }
        let caps = google.capabilities
        var allowed: [String] = []
        if caps?.gmailRead == true { allowed.append("read Gmail") }
        if caps?.gmailSend == true { allowed.append("send Gmail") }
        if caps?.calendarRead == true { allowed.append("read Calendar") }
        return allowed.isEmpty ? "Connected." : "Connected: \(allowed.joined(separator: ", "))."
    }
}

struct WhatsAppSection: View {
    @ObservedObject var model: WhatsAppModel
    @Environment(\.openURL) private var openURL

    var body: some View {
        Section("WhatsApp") {
            if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            if let state = model.state {
                if !state.configured {
                    Text("WhatsApp isn't set up on this server yet.").font(.system(size: 13)).foregroundStyle(Theme.muted)
                } else if state.linked {
                    HStack {
                        Label(state.phone ?? "Linked", systemImage: "message")
                        Spacer()
                        Button("Unlink", role: .destructive) { Task { await model.unlink() } }.buttonStyle(.borderless)
                    }
                    Toggle("Send reminders here", isOn: Binding(get: { state.notify }, set: { on in Task { await model.setNotify(on) } }))
                        .tint(Theme.blue)
                } else {
                    Button("Link WhatsApp") {
                        Task { if let url = await model.startLink() { openURL(url) } }
                    }
                    if let code = model.code {
                        Text("Send this code to \(state.jarvisNumber.map { "+\($0)" } ?? "the assistant") on WhatsApp to finish linking:")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                        Text(code).font(.system(size: 22, weight: .bold, design: .monospaced)).textSelection(.enabled)
                        Button("I sent the code") { Task { await model.load() } }
                    }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

struct AutomationsSection: View {
    @ObservedObject var model: AutomationsModel
    @State private var deleting: Automation?

    var body: some View {
        Section("Automations") {
            if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            if model.loaded && model.items.isEmpty && model.error == nil {
                Text("None yet. Ask the assistant to run something on a schedule.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            ForEach(model.items) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Toggle(isOn: Binding(get: { item.status == "pending" }, set: { _ in Task { await model.toggle(item) } })) {
                        Text(item.name).font(.system(size: 15, weight: .medium))
                    }
                    .tint(Theme.blue)
                    if let action = item.action { Text(action).font(.system(size: 12)).foregroundStyle(Theme.secondary).lineLimit(3) }
                    Text(schedule(item)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                    if let last = item.lastRun {
                        Text("Last run: \(last.channel), \(last.status), \(Fmt.date(last.at))").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { deleting = item } label: { Label("Delete", systemImage: "trash") }
                }
                .confirmationDialog("Delete this automation?", isPresented: Binding(get: { deleting?.id == item.id }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                    Button("Delete", role: .destructive) { Task { await model.delete(item) } }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func schedule(_ item: Automation) -> String {
        let when = "\(item.status == "paused" ? "Paused. Next" : "Next"): \(Fmt.date(item.fireAt))"
        guard let repeats = item.recurrence, repeats != "none" else { return when }
        return "\(when), repeats \(repeats)"
    }
}

struct ProvidersSection: View {
    @ObservedObject var model: ProvidersModel
    @State private var provider = ProviderKeys.all[0]
    @State private var value = ""
    @State private var signingIn: ProviderSignIn?

    var body: some View {
        Section("AI providers") {
            if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            ForEach(model.providers) { health in
                HStack(spacing: 10) {
                    Circle().fill(color(health.status)).frame(width: 8, height: 8)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(health.provider.capitalized).font(.system(size: 15, weight: .medium))
                        Text(health.reason ?? health.model ?? health.status.capitalized).font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2)
                    }
                }
            }
            Button(model.checking ? "Checking…" : "Re-check") { Task { await model.recheck() } }
                .disabled(model.checking)
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        Section("Your own keys") {
            ForEach(model.keys) { key in
                HStack {
                    Text(key.provider.capitalized).font(.system(size: 15, weight: .medium))
                    Spacer()
                    Text(key.hint).font(.system(size: 12, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.removeKey(key) } } label: { Label("Remove", systemImage: "trash") }
                }
            }
            Picker("Provider", selection: $provider) {
                ForEach(ProviderKeys.all, id: \.self) { Text($0.capitalized).tag($0) }
            }
            SecureField(provider == "ollama" ? "Server URL" : "API key", text: $value)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Save key") {
                Task { @MainActor in if await model.addKey(provider: provider, value: value.trimmingCharacters(in: .whitespacesAndNewlines)) { value = "" } }
            }
            .disabled(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            if let page = ProviderKeys.keyPages[provider], let url = URL(string: page) {
                Link("Get a \(provider.capitalized) key", destination: url).font(.system(size: 13))
            }
            ForEach(ProviderSignIn.all) { option in
                VStack(alignment: .leading, spacing: 4) {
                    Button("Sign in with \(option.name)") { signingIn = option }
                    Text(option.note).font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        .sheet(item: $signingIn, onDismiss: { Task { await model.load() } }) { option in
            NavigationStack {
                WebScreen(path: option.path)
                    .navigationTitle("Sign in with \(option.name)")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { signingIn = nil } } }
            }
        }
        if model.keys.contains(where: { $0.provider == "ollama" }) { ComputerSection() }
    }

    private func color(_ status: String) -> Color {
        switch status {
        case "ok": return Theme.green
        case "unknown": return Theme.muted
        default: return Theme.amber
        }
    }
}

struct ComputerSection: View {
    private struct Assistant: Identifiable { let id: String; let name: String }
    private static let assistants = [Assistant(id: "jarvis", name: "JARVIS"), Assistant(id: "friday", name: "FRIDAY"),
                                     Assistant(id: "edith", name: "E.D.I.T.H."), Assistant(id: "ultron", name: "ULTRON")]

    @StateObject private var model = LocalComputerModel()
    @State private var modelChoice = ""
    @State private var perAssistant: [String: String] = [:]
    @State private var token = ""

    var body: some View {
        Section("Your computer") {
            if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            if let state = model.state {
                header(state)
                localFirstRow(state)
                testRow
                modelRow
                assistantRows
                tokenRows(state)
            } else if model.error == nil {
                ProgressView()
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        .task {
            await model.load()
            syncDrafts()
        }
    }

    private func syncDrafts() {
        modelChoice = model.state?.model ?? ""
        perAssistant = model.state?.assistantModels ?? [:]
    }

    private func options(including selected: String) -> [String] {
        var list = model.models ?? []
        if !selected.isEmpty && !list.contains(selected) { list.insert(selected, at: 0) }
        return list
    }

    private func header(_ state: LocalModelState) -> some View {
        Label(state.host ?? "Your computer", systemImage: "desktopcomputer")
            .font(.system(size: 15, weight: .medium))
    }

    private func localFirstRow(_ state: LocalModelState) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle("Answer from my computer first (free)", isOn: Binding(get: { state.localFirst }, set: { on in Task { await model.save(["localFirst": on]) } }))
                .tint(Theme.blue)
                .disabled(model.busy)
            Text("Your computer answers first; the free cloud models take over when it's asleep or busy.")
                .font(.system(size: 12)).foregroundStyle(Theme.muted)
        }
    }

    private var testRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(model.busy ? "Testing…" : "Test connection") { Task { await model.test() } }
                .disabled(model.busy)
            if let line = model.testLine {
                Text(line).font(.system(size: 12)).foregroundStyle(model.testOK ? Theme.green : Theme.red)
            }
        }
    }

    @ViewBuilder
    private var modelRow: some View {
        if model.models == nil {
            TextField("Model, e.g. llama3.1:8b", text: $modelChoice)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        } else {
            Picker("Model", selection: $modelChoice) {
                Text("Default (llama3.1:8b)").tag("")
                ForEach(options(including: modelChoice), id: \.self) { Text($0).tag($0) }
            }
        }
        Button("Save model") {
            Task { @MainActor in
                if await model.save(["model": modelChoice.trimmingCharacters(in: .whitespacesAndNewlines)]) { syncDrafts() }
            }
        }
        .disabled(model.busy)
    }

    @ViewBuilder
    private var assistantRows: some View {
        ForEach(Self.assistants) { assistant in
            let name = assistant.name
            let binding = Binding(get: { perAssistant[assistant.id] ?? "" }, set: { perAssistant[assistant.id] = $0 })
            if model.models == nil {
                HStack {
                    Text(name).font(.system(size: 15, weight: .medium))
                    TextField("Same as above", text: binding)
                        .multilineTextAlignment(.trailing)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            } else {
                Picker(name, selection: binding) {
                    Text("Same as above").tag("")
                    ForEach(options(including: binding.wrappedValue), id: \.self) { Text($0).tag($0) }
                }
            }
        }
        Button("Save assistant models") {
            let map = perAssistant.compactMapValues { value -> String? in
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            Task { @MainActor in
                if await model.save(["assistantModels": map]) { syncDrafts() }
            }
        }
        .disabled(model.busy)
    }

    @ViewBuilder
    private func tokenRows(_ state: LocalModelState) -> some View {
        if state.hasToken {
            HStack {
                Text("Password saved").font(.system(size: 15))
                Spacer()
                Button("Remove", role: .destructive) { Task { await model.save(["token": ""]) } }
                    .buttonStyle(.borderless)
                    .disabled(model.busy)
            }
        } else {
            SecureField("Tunnel password", text: $token)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Save password") {
                Task { @MainActor in
                    if await model.save(["token": token.trimmingCharacters(in: .whitespacesAndNewlines)]) { token = "" }
                }
            }
            .disabled(token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.busy)
        }
        Text("Only if your tunnel asks for one. user:password is sent as Basic auth, anything else as a bearer token.")
            .font(.system(size: 12)).foregroundStyle(Theme.muted)
    }
}

struct AboutSection: View {
    @ObservedObject var model: StatusModel

    var body: some View {
        Section("About") {
            let info = Bundle.main.infoDictionary
            HStack {
                Text("Version")
                Spacer()
                Text("\(info?["CFBundleShortVersionString"] as? String ?? "") (\(info?["CFBundleVersion"] as? String ?? ""))")
                    .foregroundStyle(Theme.muted)
            }
            if let status = model.status {
                dot("AI", status.ai)
                dot("Voice transcription", status.openai)
                dot("Database", status.database)
                dot("Google sign-in", status.google_oauth)
                dot("Web search", status.serper)
                ForEach((status.cascade ?? [:]).keys.sorted(), id: \.self) { name in
                    dot(name.capitalized, status.cascade?[name])
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func dot(_ name: String, _ on: Bool?) -> some View {
        HStack(spacing: 10) {
            Circle().fill(on == true ? Theme.green : Theme.muted).frame(width: 8, height: 8)
            Text(name).font(.system(size: 14))
            Spacer()
            Text(on == true ? "On" : "Off").font(.system(size: 12)).foregroundStyle(Theme.muted)
        }
    }
}
