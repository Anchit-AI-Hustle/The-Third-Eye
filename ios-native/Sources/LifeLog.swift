import AVFoundation
import SwiftUI

struct LifeLogDay: Codable, Identifiable, Equatable {
    struct Segment: Codable, Equatable {
        let id: String
        let startTs: Double?
        var endTs: Double?
        let transcript: String?
        var hasAudio: Bool?
        var provider: String?
        let silent: Bool?
    }
    struct Event: Codable, Equatable { let id: String; let ts: Double?; let title: String; let kind: String?; let detail: String? }
    struct Diary: Codable, Equatable { let id: String; let ts: Double?; let text: String; let mood: String? }

    let id: String
    let date: String
    var segments: [Segment]?
    var events: [Event]?
    var diary: [Diary]?
    var summary: String?
}

@MainActor
final class LifeLogModel: ObservableObject {
    @Published var days: [LifeLogDay] = []
    @Published var error: String?
    @Published var loaded = false

    func load() async {
        do {
            days = try await DataStore.list("lifelog_days", as: LifeLogDay.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }
}

extension LifeLogDay {
    static func empty(_ date: String) -> LifeLogDay { LifeLogDay(id: date, date: date, segments: [], events: [], diary: [], summary: "") }

    /// The row the website writes too (lib/lifelog/store.ts): one per day, id = date, audio kept off the server.
    var row: [String: Any] {
        func json<T: Encodable>(_ value: T) -> Any { (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(value))) ?? [] }
        return ["id": date, "date": date, "segments": json(segments ?? []), "events": json(events ?? []),
                "diary": json(diary ?? []), "summary": summary ?? "", "updated_at": ISO8601DateFormatter().string(from: Date())]
    }
}

/// The local date key the website uses (lib/lifelog/types.ts localDateKey).
func localDateKey(_ date: Date = Date()) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

private extension Date { var ms: Double { (timeIntervalSince1970 * 1000).rounded() } }

/// Records the day in 45-second chunks like the website (hooks/useDayRecorder): each chunk is sent
/// to /api/transcribe unless it was near-silent, then dropped from the phone. Keeps running with the
/// screen locked (background audio).
@MainActor
final class DayRecorder: ObservableObject {
    @Published private(set) var recording = false
    @Published private(set) var lastChunkAt: Date?
    @Published var error: String?
    var onSegment: ((LifeLogDay.Segment) -> Void)?

    static let chunk: TimeInterval = 45
    // The website's silence peak (0.012) in decibels.
    static let silentBelow: Float = -38

    private var recorder: AVAudioRecorder?
    private var started = Date()
    private var peak: Float = -160
    private var meter: Timer?
    private var roll: Timer?

    func start() async {
        guard await AVAudioApplication.requestRecordPermission() else {
            error = "Allow the microphone for The Third Eye in Settings to record your day."
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            self.error = "Couldn't start the microphone: \(error.localizedDescription)"
            return
        }
        error = nil
        recording = true
        begin()
    }

    func stop() {
        recording = false
        finishChunk()
    }

    private func begin() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("lifelog-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 16_000, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 32_000]
        guard let next = try? AVAudioRecorder(url: url, settings: settings) else {
            error = "Couldn't start recording."
            recording = false
            return
        }
        next.isMeteringEnabled = true
        guard next.record() else {
            error = "Couldn't start recording."
            recording = false
            return
        }
        recorder = next
        started = Date()
        peak = -160
        meter = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in Task { @MainActor in self?.sample() } }
        roll = Timer.scheduledTimer(withTimeInterval: Self.chunk, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.finishChunk()
                if self.recording { self.begin() }
            }
        }
    }

    private func sample() {
        guard let recorder else { return }
        recorder.updateMeters()
        peak = max(peak, recorder.peakPower(forChannel: 0))
    }

    private func finishChunk() {
        meter?.invalidate()
        roll?.invalidate()
        guard let done = recorder else { return }
        sample()
        done.stop()
        recorder = nil
        let (url, start, end, silent) = (done.url, started, Date(), peak < Self.silentBelow)
        Task { await deliver(url: url, start: start, end: end, silent: silent) }
    }

    private func deliver(url: URL, start: Date, end: Date, silent: Bool) async {
        defer { try? FileManager.default.removeItem(at: url) }
        var transcript = ""
        var provider: String?
        if !silent, let data = try? Data(contentsOf: url), data.count > 2000 {
            struct Heard: Decodable { let text: String?; let provider: String? }
            if let reply = try? await API.upload("/api/transcribe", field: "audio", files: [("chunk.m4a", "audio/mp4", data)]),
               let heard = try? JSONDecoder().decode(Heard.self, from: reply) {
                transcript = (heard.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                provider = heard.provider
            }
        }
        lastChunkAt = end
        onSegment?(LifeLogDay.Segment(id: "\(Int(start.ms))", startTs: start.ms, endTs: end.ms, transcript: transcript,
                                      hasAudio: false, provider: provider, silent: silent))
    }
}

/// Today's log: recorded chunks, diary entries and the timeline the server extracts from the transcript.
/// One for the whole app, so recording carries on when you leave the screen.
@MainActor
final class LifeLogTodayModel: ObservableObject {
    static let shared = LifeLogTodayModel()

    @Published private(set) var day = LifeLogDay.empty(localDateKey())
    @Published private(set) var extracting = false
    @Published var error: String?
    let recorder = DayRecorder()
    private var heardSinceExtract = 0

    private init() {
        recorder.onSegment = { [weak self] segment in Task { await self?.add(segment) } }
    }

    func load() async {
        let today = localDateKey()
        if let rows = try? await DataStore.list("lifelog_days", as: LifeLogDay.self), let saved = rows.first(where: { $0.date == today }) {
            day = saved
        } else if day.date != today {
            day = .empty(today)
        }
    }

    func toggleRecording() async {
        if recorder.recording {
            recorder.stop()
            heardSinceExtract = 0
            // The last chunk is still being transcribed; extract once it lands.
            try? await Task.sleep(for: .seconds(3))
            await extract()
        } else {
            await recorder.start()
        }
    }

    func addDiary(_ text: String) async {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        rollOver()
        day.diary = (day.diary ?? []) + [LifeLogDay.Diary(id: UUID().uuidString, ts: Date().ms, text: clean, mood: nil)]
        await save()
    }

    private func add(_ segment: LifeLogDay.Segment) async {
        rollOver()
        day.segments = (day.segments ?? []) + [segment]
        await save()
        if !(segment.transcript ?? "").isEmpty {
            heardSinceExtract += 1
            if heardSinceExtract >= 3 { heardSinceExtract = 0; await extract() }
        }
    }

    /// Recording past midnight starts the new day's log, as the website does.
    private func rollOver() {
        let today = localDateKey()
        if day.date != today { day = .empty(today) }
    }

    func extract() async {
        let lines = (day.segments ?? []).compactMap { s -> String? in
            guard let text = s.transcript, !text.isEmpty else { return nil }
            return "[\(clock24(s.startTs))] \(text)"
        }
        let transcript = lines.joined(separator: "\n")
        guard transcript.count >= 20 else { return }
        extracting = true
        defer { extracting = false }
        struct Extracted: Decodable {
            struct Item: Decodable { let title: String; let kind: String?; let time: String?; let detail: String? }
            let events: [Item]?
            let summary: String?
            let error: String?
        }
        do {
            let reply = try await API.call("POST", "/api/tools/lifelog/extract", json: ["transcript": transcript, "date": day.date], as: Extracted.self)
            // A failed extraction never replaces the timeline already saved.
            guard reply.error == nil, let items = reply.events else {
                error = reply.error ?? "Couldn't build the timeline right now. Your recordings are safe; try again shortly."
                return
            }
            let base = day.segments?.first?.startTs ?? Date().ms
            let span = max(1, (day.segments?.last?.endTs ?? base) - base)
            day.events = items.enumerated().map { i, e in
                LifeLogDay.Event(id: UUID().uuidString, ts: time(e.time) ?? base + (Double(i) / Double(max(1, items.count))) * span,
                                 title: e.title, kind: e.kind ?? "other", detail: e.detail)
            }.sorted { ($0.ts ?? 0) < ($1.ts ?? 0) }
            if let summary = reply.summary, !summary.isEmpty { day.summary = summary }
            error = nil
            await save()
        } catch {
            self.error = "Couldn't reach the server. Your timeline is unchanged."
        }
    }

    private func time(_ hhmm: String?) -> Double? {
        guard let hhmm else { return nil }
        let parts = hhmm.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2, let date = DateFormatter.dayKey.date(from: day.date),
              let at = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: date) else { return nil }
        return at.ms
    }

    private func save() async {
        do {
            try await DataStore.insert("lifelog_days", day.row)
        } catch {
            self.error = "Couldn't save today's log: \(error.localizedDescription)"
        }
    }
}

private extension DateFormatter {
    static let dayKey: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
}

/// HH:MM in 24-hour time, the stamp the extractor reads.
func clock24(_ ms: Double?) -> String {
    guard let ms else { return "" }
    let c = Calendar.current.dateComponents([.hour, .minute], from: Date(timeIntervalSince1970: ms / 1000))
    return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
}

func clock(_ ms: Double?) -> String {
    guard let ms else { return "" }
    return Date(timeIntervalSince1970: ms / 1000).formatted(date: .omitted, time: .shortened)
}

struct LifeLogView: View {
    @StateObject private var model = LifeLogModel()

    var body: some View {
        List {
            if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
            Section {
                NavigationLink { LifeLogTodayView() } label: { Label("Record or write today", systemImage: "record.circle") }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section("Days") {
                if model.loaded && model.days.isEmpty {
                    Text("Nothing logged yet. Record your day or write a diary entry and it shows here.").foregroundStyle(Theme.muted)
                }
                ForEach(model.days) { day in
                    NavigationLink { LifeLogDayView(day: day) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(day.date).font(.system(size: 15, weight: .medium))
                            Text(day.summary?.isEmpty == false ? day.summary! : "\(day.events?.count ?? 0) events · \(day.diary?.count ?? 0) diary entries")
                                .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Life Log")
        .refreshable { await model.load() }
        .task { await model.load() }
        .reloadsOnDataChange { await model.load() }
        .overlay { if !model.loaded { ProgressView() } }
    }
}

/// Today: record (keeps going with the screen locked), write a diary entry, and the timeline built from both.
struct LifeLogTodayView: View {
    @ObservedObject private var model = LifeLogTodayModel.shared
    @State private var diary = ""

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
            Section {
                RecordButton(recorder: model.recorder) { Task { await model.toggleRecording() } }
                HStack {
                    TextField("Write in your diary…", text: $diary, axis: .vertical)
                    Button("Add") { let text = diary; diary = ""; Task { await model.addDiary(text) } }
                        .disabled(diary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Button { Task { await model.extract() } } label: {
                    Label(model.extracting ? "Building the timeline…" : "Rebuild the timeline", systemImage: "sparkles")
                }
                .disabled(model.extracting)
            } footer: {
                Text("Recording runs while the screen is locked. Each 45-second chunk is transcribed and the audio is deleted; silence is skipped.")
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            DaySections(day: model.day)
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
    }
}

private struct RecordButton: View {
    @ObservedObject var recorder: DayRecorder
    let toggle: () -> Void

    var body: some View {
        if let error = recorder.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
        Button(action: toggle) {
            HStack {
                Label(recorder.recording ? "Stop recording" : "Record my day", systemImage: recorder.recording ? "stop.circle.fill" : "record.circle")
                    .foregroundStyle(recorder.recording ? Theme.red : Theme.blue)
                Spacer()
                if recorder.recording {
                    Text(recorder.lastChunkAt.map { "last saved \(clock($0.timeIntervalSince1970 * 1000))" } ?? "listening…")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

struct LifeLogDayView: View {
    let day: LifeLogDay

    var body: some View {
        List { DaySections(day: day) }
            .scrollContentBackground(.hidden)
            .background(Starfield())
            .navigationTitle(day.date)
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct DaySections: View {
    let day: LifeLogDay

    var body: some View {
        Group {
            if let summary = day.summary, !summary.isEmpty {
                Section("Summary") { Text(summary).font(.system(size: 14)) }.listRowBackground(Theme.surface.opacity(0.7))
            }
            if let events = day.events, !events.isEmpty {
                Section("Timeline") {
                    ForEach(events, id: \.id) { e in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack { Text(e.title).font(.system(size: 14, weight: .medium)); Spacer(); Text(clock(e.ts)).font(.system(size: 12)).foregroundStyle(Theme.muted) }
                            if let detail = e.detail, !detail.isEmpty { Text(detail).font(.system(size: 12)).foregroundStyle(Theme.secondary) }
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
            if let diary = day.diary, !diary.isEmpty {
                Section("Diary") {
                    ForEach(diary, id: \.id) { d in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.text).font(.system(size: 14))
                            Text([clock(d.ts), d.mood ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
            let spoken = (day.segments ?? []).filter { $0.silent != true && !($0.transcript ?? "").isEmpty }
            if !spoken.isEmpty {
                Section("Transcript") {
                    ForEach(spoken, id: \.id) { s in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(clock(s.startTs)).font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.blue)
                            Text(s.transcript ?? "").font(.system(size: 13)).textSelection(.enabled)
                        }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
    }
}
