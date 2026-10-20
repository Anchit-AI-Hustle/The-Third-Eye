import SwiftUI

struct Connector: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var host: String?
    var enabled: Bool
    var tool_count: Flex?
}

// /api/connectors: the same MCP connectors the website's Connectors page adds.
@MainActor
final class ConnectorsModel: ObservableObject {
    @Published var connectors: [Connector] = []
    @Published var error: String?
    @Published var notice: String?
    @Published var loaded = false
    @Published var unavailable = false

    private struct Listing: Decodable { let connectors: [Connector] }
    private struct Added: Decodable { let connector: Connector }

    /// The server's own error text, which says why a URL was refused.
    private func call(_ method: String, _ path: String, json: Any? = nil) async throws -> Data {
        let (data, response) = try await API.session.data(for: API.request(method, path, json: json))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 501 { unavailable = true }
        guard (200..<300).contains(status) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw message.map { NSError(domain: "connectors", code: status, userInfo: [NSLocalizedDescriptionKey: $0]) } ?? APIError(status: status)
        }
        return data
    }

    func load() async {
        do {
            connectors = try JSONDecoder().decode(Listing.self, from: try await call("GET", "/api/connectors")).connectors
            error = nil
        } catch {
            if !unavailable { self.error = error.localizedDescription }
        }
        loaded = true
    }

    func add(name: String, url: String, token: String) async -> Bool {
        do {
            let data = try await call("POST", "/api/connectors", json: ["name": name, "url": url, "token": token])
            let c = try JSONDecoder().decode(Added.self, from: data).connector
            let tools = Int(c.tool_count?.value ?? 0)
            notice = "\(c.name) connected: \(tools) tool\(tools == 1 ? "" : "s") available to the assistant."
            error = nil
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func toggle(_ c: Connector) async {
        do { _ = try await call("PATCH", "/api/connectors", json: ["id": c.id, "enabled": !c.enabled]) } catch { self.error = error.localizedDescription }
        await load()
    }

    func delete(_ c: Connector) async {
        let id = c.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? c.id
        do { _ = try await call("DELETE", "/api/connectors?id=\(id)") } catch { self.error = error.localizedDescription }
        await load()
    }
}

struct ConnectorsView: View {
    @StateObject private var model = ConnectorsModel()
    @State private var adding = false

    private struct Directory: Identifiable { let name: String; let blurb: String; let link: URL; var id: String { name } }
    private let directories = [
        Directory(name: "Zapier", blurb: "8,000+ apps: Slack, Notion, Sheets, HubSpot. Copy your personal MCP URL.", link: URL(string: "https://mcp.zapier.com")!),
        Directory(name: "Composio", blurb: "250+ apps with managed sign-in. Copy a server URL from your dashboard.", link: URL(string: "https://composio.dev")!),
        Directory(name: "Pipedream", blurb: "2,500+ APIs. Create an MCP server and copy its URL.", link: URL(string: "https://mcp.pipedream.com")!),
    ]

    var body: some View {
        List {
            if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
            if let notice = model.notice { Text(notice).foregroundStyle(Theme.blue).font(.system(size: 13)) }
            if model.unavailable {
                Text("Connectors aren't set up on this server yet.").foregroundStyle(Theme.muted)
            }
            Section("Your connectors") {
                if model.loaded && model.connectors.isEmpty && !model.unavailable {
                    Text("None yet. Add an MCP server to give the assistant new tools.").foregroundStyle(Theme.muted)
                }
                ForEach(model.connectors) { c in
                    Toggle(isOn: Binding(get: { c.enabled }, set: { _ in Task { await model.toggle(c) } })) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).font(.system(size: 15, weight: .medium))
                            Text("\(c.host ?? "") · \(Int(c.tool_count?.value ?? 0)) tools").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                    .tint(Theme.blue)
                    .swipeActions {
                        Button(role: .destructive) { Task { await model.delete(c) } } label: { Label("Remove", systemImage: "trash") }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
            Section("Find servers") {
                ForEach(directories) { d in
                    Link(destination: d.link) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.name).font(.system(size: 15, weight: .medium))
                            Text(d.blurb).font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Connectors")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add connector").disabled(model.unavailable)
            }
        }
        .refreshable { await model.load() }
        .task { await model.load() }
        .overlay { if !model.loaded { ProgressView() } }
        .sheet(isPresented: $adding) { AddConnector(model: model) }
    }
}

struct AddConnector: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var model: ConnectorsModel
    @State private var name = ""
    @State private var url = ""
    @State private var token = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name, e.g. Notion", text: $name)
                TextField("https://… server URL", text: $url).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Token (optional)", text: $token)
                if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background)
            .navigationTitle("Add connector")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() } else {
                        Button("Connect") {
                            busy = true
                            Task {
                                if await model.add(name: name, url: url, token: token) { dismiss() }
                                busy = false
                            }
                        }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || url.isEmpty)
                    }
                }
            }
        }
    }
}
