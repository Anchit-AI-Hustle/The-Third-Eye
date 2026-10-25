import AVFoundation
import SwiftUI

// Music Studio, as on the website (components/studio/MusicStudio): describe a song, let the
// Musicologist fill the form, generate through /api/tools/music, play it and keep it in the library.
struct MusicForm: Equatable {
    var description = ""
    var title = ""
    var genre = ""
    var subgenre = ""
    var mood = ""
    var tempo = 120
    var energy = 6
    var duration = 30
    var structure = ""
    var instruments = ""
    var artistInspiration = ""
    var vocals = true
    var vocalStyle = ""
    var vocalLanguage = "English"
    var vocalIntensity = 5
    var vocalEffects = ""
    var lyricsMode = "auto"
    var lyricsText = ""

    var payload: [String: Any] {
        ["description": description, "title": title, "genre": genre, "subgenre": subgenre, "mood": mood,
         "tempo": tempo, "energy": energy, "duration": duration, "structure": structure, "instruments": instruments,
         "artistInspiration": artistInspiration, "vocals": vocals, "vocalStyle": vocalStyle, "vocalLanguage": vocalLanguage,
         "vocalIntensity": vocalIntensity, "vocalEffects": vocalEffects, "lyricsMode": lyricsMode, "lyricsText": lyricsText]
    }

    /// /api/tools/music/infer's fields; a value it left out keeps what is there.
    mutating func apply(inferred x: [String: Any]) {
        func text(_ key: String) -> String? { (x[key] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        func number(_ key: String, _ range: ClosedRange<Int>) -> Int? {
            (x[key] as? NSNumber).map { Int($0.doubleValue.rounded()) }.flatMap { range.contains($0) ? $0 : nil }
        }
        description = text("description") ?? description
        title = text("title") ?? title
        genre = text("genre") ?? genre
        subgenre = text("subgenre") ?? subgenre
        mood = text("mood") ?? mood
        structure = text("structure") ?? structure
        instruments = text("instruments") ?? instruments
        artistInspiration = text("artistInspiration") ?? artistInspiration
        vocalStyle = text("vocalStyle") ?? vocalStyle
        vocalLanguage = text("vocalLanguage") ?? vocalLanguage
        vocalEffects = text("vocalEffects") ?? vocalEffects
        tempo = number("tempo", Music.bpm) ?? tempo
        energy = number("energy", 1...10) ?? energy
        duration = number("duration", 10...120) ?? duration
        vocalIntensity = number("vocalIntensity", 1...10) ?? vocalIntensity
        if let sung = x["vocals"] as? Bool { vocals = sung }
    }
}

enum Music {
    static let bpm = 40...400
    static let genres = ["Hard Techno", "Psytrance", "Full-on psytrance", "Dark psytrance", "Hi-tech psytrance", "Hardtek",
                         "Acid techno", "Rap", "Hip-hop", "Trap", "Drill", "Boom bap", "Techno", "House", "Drum & bass",
                         "Dubstep", "Pop", "Rock", "R&B", "Lo-fi", "Ambient", "Cinematic", "Bollywood", "Afrobeats"]
    static let moods = ["Uplifting", "Dark", "Hypnotic", "Driving", "Relentless", "Psychedelic", "Euphoric", "Aggressive",
                        "Chill", "Melancholic", "Epic", "Dreamy", "Confident", "Gritty"]
    static let durations: [(Int, String)] = [(30, "30 s"), (60, "1 min"), (120, "2 min"), (300, "5 min"), (1800, "30 min"), (3600, "1 hour")]

    /// A song's audio as a playable file: inline data: URLs, this server's stored songs
    /// (which need the session cookie) and provider URLs.
    static func file(for audio: String, name: String) async throws -> URL {
        let data: Data
        var ext = "mp3"
        if audio.hasPrefix("data:"), let comma = audio.firstIndex(of: ",") {
            let header = audio[..<comma]
            guard let bytes = Data(base64Encoded: String(audio[audio.index(after: comma)...])) else { throw APIError(status: 0) }
            data = bytes
            ext = header.contains("wav") ? "wav" : header.contains("mp4") || header.contains("m4a") ? "m4a" : "mp3"
        } else {
            if audio.hasPrefix("/") {
                data = try await API.send("GET", audio)
            } else {
                data = try await API.session.data(from: API.url(audio)).0
            }
            if let found = URL(string: audio)?.pathExtension, ["wav", "mp3", "m4a", "flac", "ogg"].contains(found) { ext = found }
            else if data.starts(with: Data("RIFF".utf8)) { ext = "wav" }
        }
        let safe = name.replacingOccurrences(of: "[^A-Za-z0-9 _-]", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safe.isEmpty ? "track" : safe).\(ext)")
        try data.write(to: url, options: .atomic)
        return url
    }
}

struct MusicTrack: Decodable, Identifiable, Equatable {
    let id: String
    let title: String?
    let description: String?
    let lyrics: String?
    let audio_url: String?
    let created_at: String?
}

@MainActor
final class MusicPlayer: ObservableObject {
    @Published private(set) var playing: String?
    @Published private(set) var loading: String?
    @Published private(set) var files: [String: URL] = [:]
    @Published var error: String?
    private var player: AVAudioPlayer?

    func file(_ key: String, audio: String, name: String) async -> URL? {
        if let found = files[key] { return found }
        loading = key
        defer { loading = nil }
        do {
            let url = try await Music.file(for: audio, name: name)
            files[key] = url
            return url
        } catch {
            self.error = "Couldn't load the audio: \(error.localizedDescription)"
            return nil
        }
    }

    func toggle(_ key: String, audio: String, name: String, loop: Bool = false) async {
        if playing == key { stop(); return }
        guard let url = await file(key, audio: audio, name: name) else { return }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
            let next = try AVAudioPlayer(contentsOf: url)
            next.numberOfLoops = loop ? -1 : 0
            next.play()
            player = next
            playing = key
        } catch {
            self.error = "This audio won't play here: \(error.localizedDescription)"
        }
    }

    func stop() {
        player?.stop()
        player = nil
        playing = nil
    }
}

@MainActor
final class MusicModel: ObservableObject {
    enum Phase: Equatable { case idle, composing, ready, failed }

    @Published var form = MusicForm()
    @Published private(set) var phase = Phase.idle
    @Published private(set) var status = ""
    @Published private(set) var filling = false
    @Published private(set) var suggesting: String?
    @Published private(set) var audioUrl: String?
    @Published private(set) var lyrics = ""
    @Published private(set) var loop = false
    @Published private(set) var tracks: [MusicTrack] = []
    @Published private(set) var loadingLibrary = false
    @Published var note: String?
    @Published var error: String?
    private var previous: [String: [String]] = [:]
    private var made = MusicForm()

    func autoFill() async {
        guard !form.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !filling else { return }
        filling = true
        error = nil
        defer { filling = false }
        do {
            let data = try await API.fetch("POST", "/api/tools/music/infer", json: ["description": form.description])
            let fields = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["fields"] as? [String: Any] ?? [:]
            form.apply(inferred: fields)
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// One field from the Musicologist, as the website's per-field Suggest.
    func suggest(_ field: WritableKeyPath<MusicForm, String>, name: String) async {
        guard suggesting == nil else { return }
        suggesting = name
        error = nil
        defer { suggesting = nil }
        var context = form.payload
        context.removeValue(forKey: "lyricsText")
        let value = form[keyPath: field]
        do {
            let data = try await API.fetch("POST", "/api/tools/music/suggest", json: [
                "field": name, "value": value, "action": value.isEmpty ? "suggest" : "new",
                "previous": previous[name] ?? [], "context": context,
            ])
            if let suggestion = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["suggestion"] as? String, !suggestion.isEmpty {
                previous[name] = Array(((previous[name] ?? []) + [value]).filter { !$0.isEmpty }.suffix(6))
                form[keyPath: field] = suggestion
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func generate() async {
        guard phase != .composing else { return }
        made = form
        phase = .composing
        error = nil
        note = nil
        audioUrl = nil
        lyrics = ""
        status = "Writing and composing the track. This can take a minute or two."
        do {
            let data = try await API.fetch("POST", "/api/tools/music", json: form.payload)
            let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            lyrics = reply["lyrics"] as? String ?? ""
            loop = reply["loop"] as? Bool == true
            if reply["configured"] as? Bool == false {
                fail(reply["note"] as? String ?? "Music generation isn't set up on the server.")
                return
            }
            var notes: [String] = []
            if let el = reply["elevenLabsError"] as? String { notes.append("ElevenLabs couldn't make this one (\(el.prefix(160))), so a backup model is used.") }
            if reply["fellBackToInstrumental"] as? Bool == true { notes.append("Couldn't generate sung vocals, so this is an instrumental version (lyrics below).") }
            if reply["provider"] as? String == "code", let n = reply["note"] as? String { notes.append(n) }
            if loop, let clip = reply["clipSeconds"] as? NSNumber { notes.append("Long session: a \(clip.intValue) s clip loops to fill it.") }
            note = notes.isEmpty ? nil : notes.joined(separator: " ")
            if reply["done"] as? Bool == true, let url = reply["audioUrl"] as? String {
                await ready(url)
            } else if let job = reply["jobId"] as? String {
                await poll(job)
            } else {
                fail("No song came back. Try again.")
            }
        } catch {
            fail(error.localizedDescription)
        }
    }

    private func poll(_ job: String) async {
        status = "Composing audio. This can take up to a minute."
        let giveUp = Date().addingTimeInterval(600)
        let escaped = job.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? job
        while Date() < giveUp {
            try? await Task.sleep(for: .seconds(3))
            guard let data = try? await API.fetch("GET", "/api/tools/music?id=\(escaped)"),
                  let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
            let state = reply["status"] as? String ?? ""
            if !state.isEmpty { status = "Composing audio (\(state))" }
            if state == "succeeded", let url = reply["audioUrl"] as? String { await ready(url); return }
            if ["failed", "canceled"].contains(state) || reply["error"] is String {
                fail(reply["error"] as? String ?? "Generation failed.")
                return
            }
        }
        fail("Still not finished after 10 minutes. The provider may be stuck; try again.")
    }

    private func fail(_ message: String) {
        phase = .failed
        status = ""
        error = message
    }

    private func ready(_ url: String) async {
        audioUrl = url
        phase = .ready
        status = ""
        let title = made.title.isEmpty ? String(made.description.prefix(60)) : made.title
        let row: [String: Any] = [
            "id": UUID().uuidString.lowercased(), "title": title, "description": made.description, "lyrics": lyrics,
            "audio_url": url, "created_at": Fmt.now(),
            "params": ["genres": made.genre, "moods": made.mood, "tempo": made.tempo, "vocals": made.vocals, "duration": made.duration],
        ]
        do { try await DataStore.insert("music_tracks", row) } catch { note = "Made, but not saved to your library: \(error.localizedDescription)" }
        let inputs = [("Genres", made.genre), ("Moods", made.mood), ("Tempo", "\(made.tempo) BPM"), ("Structure", made.structure),
                      ("Instruments", made.instruments), ("Artist vibe", made.artistInspiration),
                      ("Vocals", made.vocals ? "\(made.vocalStyle) (\(made.vocalIntensity)/10)" : "instrumental"),
                      ("Vocal languages", made.vocalLanguage), ("Vocal effects", made.vocalEffects)]
            .filter { !$0.1.isEmpty }
            .map { Generation.Input(label: $0.0, value: $0.1) }
        GenerationStore.shared.add(app: "music", tool: nil, appLabel: "Music Studio", title: title, kind: "audio", inputs: inputs, output: url)
    }

    var madeTitle: String { made.title.isEmpty ? "Track" : made.title }

    func loadLibrary() async {
        loadingLibrary = true
        defer { loadingLibrary = false }
        do {
            tracks = try await DataStore.list("music_tracks", as: MusicTrack.self)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func delete(_ track: MusicTrack) async {
        do {
            try await DataStore.delete("music_tracks", id: track.id)
            tracks.removeAll { $0.id == track.id }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct MusicStudioView: View {
    @StateObject private var model = MusicModel()
    @StateObject private var player = MusicPlayer()
    @State private var tab = 0

    var body: some View {
        Form {
            Section {
                Picker("View", selection: $tab) {
                    Text("Create").tag(0)
                    Text("Library").tag(1)
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.clear)
            if tab == 0 { create } else { library }
            if let error = model.error ?? player.error {
                Section { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }.listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Music Studio")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: tab) { _, tab in if tab == 1 { Task { await model.loadLibrary() } } }
        .onDisappear { player.stop() }
    }

    @ViewBuilder
    private var create: some View {
        Section {
            TextField("A dark, driving hard techno track for a 4am warehouse", text: $model.form.description, axis: .vertical)
                .lineLimit(3...8)
            Button {
                Task { await model.autoFill() }
            } label: {
                HStack(spacing: 8) {
                    if model.filling { ProgressView() } else { Image(systemName: "wand.and.stars") }
                    Text("Fill the rest from this")
                }
            }
            .disabled(model.filling || model.form.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } header: { Text("Describe the song") }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section("Sound") {
            suggestField("Title", \.title, "title")
            suggestField("Genre", \.genre, "genre", chips: Music.genres)
            suggestField("Subgenre", \.subgenre, "subgenre")
            suggestField("Mood", \.mood, "mood", chips: Music.moods)
            Stepper("Tempo: \(model.form.tempo) BPM", value: $model.form.tempo, in: Music.bpm, step: 2)
            Stepper("Energy: \(model.form.energy)/10", value: $model.form.energy, in: 1...10)
            Picker("Length", selection: $model.form.duration) {
                if !Music.durations.contains(where: { $0.0 == model.form.duration }) {
                    Text("\(model.form.duration) s").tag(model.form.duration)
                }
                ForEach(Music.durations, id: \.0) { Text($0.1).tag($0.0) }
            }
            suggestField("Structure", \.structure, "structure")
            suggestField("Instruments", \.instruments, "instruments")
            suggestField("Artist vibe", \.artistInspiration, "artistInspiration")
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section("Vocals") {
            Toggle("Sung vocals", isOn: $model.form.vocals)
            if model.form.vocals {
                suggestField("Vocal style", \.vocalStyle, "vocalStyle")
                suggestField("Language", \.vocalLanguage, "vocalLanguage")
                Stepper("Intensity: \(model.form.vocalIntensity)/10", value: $model.form.vocalIntensity, in: 1...10)
                suggestField("Vocal effects", \.vocalEffects, "vocalEffects")
                Picker("Lyrics", selection: $model.form.lyricsMode) {
                    Text("Written for me").tag("auto")
                    Text("My own").tag("manual")
                    Text("None").tag("none")
                }
                if model.form.lyricsMode == "manual" {
                    TextField("Your lyrics", text: $model.form.lyricsText, axis: .vertical).lineLimit(4...12)
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if model.phase == .composing {
                HStack(spacing: 10) {
                    ProgressView()
                    Text(model.status).font(.system(size: 13)).foregroundStyle(Theme.secondary)
                }
            } else {
                let empty = model.form.description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                Button("Generate track") { Task { await model.generate() } }
                    .buttonStyle(GlowButtonStyle())
                    .disabled(empty)
                    .opacity(empty ? 0.4 : 1)
            }
            if let note = model.note {
                Text(note).font(.system(size: 12)).foregroundStyle(Theme.secondary)
            }
        }
        .listRowBackground(Color.clear)

        if let url = model.audioUrl {
            Section(model.madeTitle) {
                trackControls(key: "new", audio: url, name: model.madeTitle, loop: model.loop)
                if !model.lyrics.isEmpty {
                    Text(model.lyrics).font(.system(size: 13)).foregroundStyle(Theme.secondary).textSelection(.enabled)
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    @ViewBuilder
    private var library: some View {
        Section {
            if model.loadingLibrary && model.tracks.isEmpty {
                ProgressView().frame(maxWidth: .infinity)
            } else if model.tracks.isEmpty {
                Text("No tracks yet. Create one and it'll appear here.").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            ForEach(model.tracks) { track in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "music.note").foregroundStyle(Theme.blue)
                        Text(track.title?.isEmpty == false ? track.title! : "Untitled").font(.system(size: 15, weight: .medium)).lineLimit(1)
                        Spacer()
                        Text(track.created_at.map { String($0.prefix(10)) } ?? "").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
                    }
                    if let audio = track.audio_url, !audio.isEmpty {
                        trackControls(key: track.id, audio: audio, name: track.title ?? "track")
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.delete(track) } } label: { Label("Delete", systemImage: "trash") }
                }
            }
        } header: { Text("Your tracks (\(model.tracks.count))") }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func trackControls(key: String, audio: String, name: String, loop: Bool = false) -> some View {
        HStack(spacing: 16) {
            Button {
                Task { await player.toggle(key, audio: audio, name: name, loop: loop) }
            } label: {
                if player.loading == key { ProgressView() } else {
                    Label(player.playing == key ? "Stop" : "Play", systemImage: player.playing == key ? "stop.fill" : "play.fill")
                }
            }
            .buttonStyle(.borderless)
            if let file = player.files[key] {
                ShareLink(item: file) { Label("Save", systemImage: "square.and.arrow.down") }.buttonStyle(.borderless)
            } else {
                Button { Task { _ = await player.file(key, audio: audio, name: name) } } label: {
                    Label("Get file", systemImage: "arrow.down.circle")
                }
                .buttonStyle(.borderless)
            }
        }
        .font(.system(size: 14))
    }

    private func suggestField(_ label: String, _ path: WritableKeyPath<MusicForm, String>, _ name: String, chips: [String] = []) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.secondary)
                Spacer()
                Button { Task { await model.suggest(path, name: name) } } label: {
                    if model.suggesting == name { ProgressView() } else { Image(systemName: "wand.and.stars") }
                }
                .buttonStyle(.borderless)
                .disabled(model.suggesting != nil)
                .accessibilityLabel("Suggest \(label.lowercased())")
            }
            TextField(label, text: Binding(get: { model.form[keyPath: path] }, set: { model.form[keyPath: path] = $0 }))
            if !chips.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(chips, id: \.self) { chip in
                            Button(chip) { model.form[keyPath: path] = chip }
                                .font(.system(size: 11))
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background(Capsule().stroke(model.form[keyPath: path] == chip ? Theme.blue : Theme.muted.opacity(0.4)))
                                .foregroundStyle(model.form[keyPath: path] == chip ? Theme.blue : Theme.secondary)
                                .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}
