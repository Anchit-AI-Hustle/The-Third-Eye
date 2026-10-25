import SwiftUI

// ANCHOR autopilot inside the app, as on the website (components/studio/AnchorPanel): the
// release robot's state from /api/tools/anchor and the buttons that start its workflows.
struct AnchorOverview: Decodable {
    struct LastRun: Decodable { let result: String; let stage: String; let title: String?; let finishedAt: String?; let error: String? }
    struct Drop: Decodable, Identifiable {
        let id: String
        let date: String
        let title: String
        let lane: String
        let bpm: Int?
        let seconds: Double?
        let cover: String?
        let youtubeUrl: String?
        let shortUrl: String?
        let status: String
    }
    struct Run: Decodable, Identifiable {
        let name: String
        let status: String
        let conclusion: String?
        let url: String
        let startedAt: String
        var id: String { url }
    }

    let lastRun: LastRun?
    let nextPostAt: String?
    let streak: Int
    let total: Int
    let drops: [Drop]
    let runs: [Run]
    let site: String
    let repo: String
    let canRun: Bool
}

enum Anchor {
    static let accent = Color(red: 1, green: 0x3B / 255, blue: 0x1F / 255)

    static func when(_ iso: String?) -> String {
        guard let iso, let date = ISO8601DateFormatter.lenient(iso) else { return "-" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    static func mmss(_ seconds: Double?) -> String {
        guard let seconds, seconds > 0 else { return "" }
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

extension ISO8601DateFormatter {
    /// GitHub and the robot write timestamps with and without fractional seconds.
    static func lenient(_ iso: String) -> Date? {
        let plain = ISO8601DateFormatter()
        if let date = plain.date(from: iso) { return date }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: iso)
    }
}

@MainActor
final class AnchorModel: ObservableObject {
    struct Action: Identifiable {
        let id: String
        let body: [String: Any]
        let confirm: String
    }

    @Published private(set) var data: AnchorOverview?
    @Published private(set) var error: String?
    @Published private(set) var busy: String?
    @Published private(set) var message: (ok: Bool, text: String)?

    func load() async {
        error = nil
        do {
            data = try await API.call("GET", "/api/tools/anchor", as: AnchorOverview.self)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func run(_ action: Action) async {
        busy = action.id
        message = nil
        defer { busy = nil }
        do {
            // Read directly: a refused run answers 400 with its reason in the body.
            let (body, response) = try await API.session.data(for: API.request("POST", "/api/tools/anchor", json: action.body))
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { NotificationCenter.default.post(name: .sessionExpired, object: nil) }
            let reply = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
            let ok = reply["ok"] as? Bool == true
            message = (ok, reply["message"] as? String ?? reply["error"] as? String ?? APIError(status: status).localizedDescription)
            if ok {
                try? await Task.sleep(for: .seconds(4))
                await load()
            }
        } catch {
            message = (false, error.localizedDescription)
        }
    }
}

struct AnchorView: View {
    @StateObject private var model = AnchorModel()
    @State private var song = ""
    @State private var pending: AnchorModel.Action?

    var body: some View {
        Form {
            if let error = model.error {
                Section {
                    Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
                    Button("Retry") { Task { await model.load() } }
                }
                .listRowBackground(Color.clear)
            } else if let data = model.data {
                content(data)
            } else {
                ProgressView("Reading ANCHOR…").frame(maxWidth: .infinity).listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("ANCHOR")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .refreshable { await model.load() }
        .confirmationDialog(pending?.confirm ?? "", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } }), titleVisibility: .visible) {
            Button("Start") {
                if let action = pending { Task { await model.run(action) } }
                pending = nil
            }
            Button("Cancel", role: .cancel) { pending = nil }
        }
    }

    @ViewBuilder
    private func content(_ data: AnchorOverview) -> some View {
        Section {
            let last = data.lastRun
            row("Last run", last.map { "\($0.result == "ok" ? "✓" : "✗") \($0.title ?? $0.stage)" } ?? "-", sub: last?.finishedAt.map { Anchor.when($0) })
            row("Next post", Anchor.when(data.nextPostAt))
            row("Streak", "\(data.streak) days")
            row("Released", "\(data.total) records")
            if let last, let error = last.error {
                Text("Last run failed at \(last.stage): \(error)").font(.system(size: 12)).foregroundStyle(Theme.red)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if !data.canRun {
                Text("Read-only here: starting ANCHOR's workflows needs ANCHOR_GITHUB_TOKEN (Actions write on \(data.repo)) and your account in ANCHOR_OPERATORS.")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            control("drop", "Run today's drop", "play.fill", ["action": "drop"],
                    "Start today's ANCHOR drop? It generates, releases and schedules the posts for 17:30 UTC.", data)
            control("rehearse", "Rehearse (render only)", "arrow.clockwise", ["action": "drop", "dryRun": true],
                    "Rehearse today's drop? It renders only; nothing is released or posted.", data)
            control("mix", "Weekly mix", "dot.radiowaves.left.and.right", ["action": "mix", "period": "week"],
                    "Build this week's continuous mix and publish it?", data)
            TextField("Suno song link or id", text: $song)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            control("queue", "Queue song", "waveform", ["action": "queue_song", "song": song.trimmingCharacters(in: .whitespaces)],
                    "Queue this Suno song for the next drop?", data, enabled: !song.trimmingCharacters(in: .whitespaces).isEmpty)
            if let message = model.message {
                Text(message.text).font(.system(size: 12)).foregroundStyle(message.ok ? Theme.green : Theme.red)
            }
            if let url = URL(string: "https://github.com/\(data.repo)/actions") {
                Link("Actions on GitHub", destination: url).font(.system(size: 13))
            }
        } header: { Text("Controls").foregroundStyle(Anchor.accent) }
        .listRowBackground(Theme.surface.opacity(0.7))

        if !data.runs.isEmpty {
            Section("Recent workflow runs") {
                ForEach(data.runs) { run in
                    if let url = URL(string: run.url) {
                        Link(destination: url) {
                            HStack {
                                Circle().fill(run.conclusion == "success" ? Theme.green : run.conclusion == nil ? Theme.amber : Theme.red).frame(width: 8, height: 8)
                                Text(run.name).font(.system(size: 13, weight: .medium)).foregroundStyle(.primary)
                                Text(run.conclusion ?? run.status).font(.system(size: 12)).foregroundStyle(Theme.muted)
                                Spacer()
                                Text(Anchor.when(run.startedAt)).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }

        Section {
            ForEach(data.drops.prefix(12)) { drop in
                HStack(alignment: .top, spacing: 12) {
                    if let cover = drop.cover, let url = URL(string: cover) {
                        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.elevated }
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(drop.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        Text(([drop.date, drop.lane] + [drop.bpm.map { "\($0) BPM" }, Anchor.mmss(drop.seconds)].compactMap { $0 }.filter { !$0.isEmpty }).joined(separator: " · "))
                            .font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted).lineLimit(1)
                        HStack(spacing: 12) {
                            if let yt = drop.youtubeUrl, let url = URL(string: yt) { Link("YouTube", destination: url) }
                            if let short = drop.shortUrl, let url = URL(string: short) { Link("Short", destination: url) }
                            Spacer()
                            Text(drop.status).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                        }
                        .font(.system(size: 12))
                        .buttonStyle(.borderless)
                    }
                }
            }
            if let url = URL(string: data.site) {
                Link(data.site.replacingOccurrences(of: "https://", with: ""), destination: url).font(.system(size: 13))
            }
        } header: { Text("Releases") }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func row(_ label: String, _ value: String, sub: String? = nil) -> some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.muted)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(value).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                if let sub { Text(sub).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
            }
        }
    }

    private func control(_ id: String, _ label: String, _ icon: String, _ body: [String: Any], _ confirm: String, _ data: AnchorOverview, enabled: Bool = true) -> some View {
        Button {
            pending = AnchorModel.Action(id: id, body: body, confirm: confirm)
        } label: {
            HStack {
                if model.busy == id { ProgressView() } else { Image(systemName: icon) }
                Text(label)
            }
        }
        .disabled(!data.canRun || model.busy != nil || !enabled)
    }
}
