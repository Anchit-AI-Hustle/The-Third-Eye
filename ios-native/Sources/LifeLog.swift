import SwiftUI

struct LifeLogDay: Codable, Identifiable, Equatable {
    struct Segment: Codable, Equatable { let id: String; let startTs: Double?; let transcript: String?; let silent: Bool? }
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

func clock(_ ms: Double?) -> String {
    guard let ms else { return "" }
    return Date(timeIntervalSince1970: ms / 1000).formatted(date: .omitted, time: .shortened)
}

struct LifeLogView: View {
    @StateObject private var model = LifeLogModel()
    @State private var recording = false

    var body: some View {
        List {
            if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
            Section {
                Button { recording = true } label: { Label("Record or write today", systemImage: "record.circle") }
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
        .overlay { if !model.loaded { ProgressView() } }
        // Recording, transcription and the day summary run on the website's pipeline.
        .sheet(isPresented: $recording, onDismiss: { Task { await model.load() } }) {
            NavigationStack {
                WebScreen(path: "/lifelog")
                    .navigationTitle("Today")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { recording = false } } }
            }
        }
    }
}

struct LifeLogDayView: View {
    let day: LifeLogDay

    var body: some View {
        List {
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
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle(day.date)
        .navigationBarTitleDisplayMode(.inline)
    }
}
