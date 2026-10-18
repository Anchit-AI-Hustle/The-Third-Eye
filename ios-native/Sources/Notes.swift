import SwiftUI

struct NoteItem: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var content: String?
    var pinned: Bool?
    var updated_at: String?
}

@MainActor
final class NotesModel: ObservableObject {
    @Published var notes: [NoteItem] = []
    @Published var error: String?
    @Published var loaded = false

    func load() async {
        do {
            notes = try await DataStore.list("notes", as: NoteItem.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func save(id: String?, title: String, content: String) async {
        let now = ISO8601DateFormatter().string(from: Date())
        do {
            if let id {
                try await DataStore.update("notes", id: id, ["title": title, "content": content, "updated_at": now])
            } else {
                try await DataStore.insert("notes", ["id": UUID().uuidString.lowercased(), "title": title, "content": content, "pinned": false, "created_at": now, "updated_at": now])
            }
        } catch {
            self.error = error.localizedDescription
        }
        await load()
    }

    func delete(_ note: NoteItem) async {
        notes.removeAll { $0.id == note.id }
        do { try await DataStore.delete("notes", id: note.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

struct NotesView: View {
    @StateObject private var model = NotesModel()
    @State private var editing: NoteItem?
    @State private var creating = false

    var body: some View {
        NavigationStack {
            List {
                if let error = model.error {
                    Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
                }
                if model.loaded && model.notes.isEmpty {
                    Text("No notes yet. Tap + to write one, or ask the assistant to take a note.").foregroundStyle(Theme.muted)
                }
                ForEach(model.notes) { note in
                    Button { editing = note } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                if note.pinned == true { Image(systemName: "pin.fill").font(.system(size: 11)).foregroundStyle(Theme.blue) }
                                Text(note.title.isEmpty ? "Untitled" : note.title).font(.system(size: 16, weight: .semibold))
                            }
                            Text(note.content ?? "").font(.system(size: 13)).foregroundStyle(Theme.secondary).lineLimit(2)
                        }
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(Theme.surface.opacity(0.7))
                    .swipeActions {
                        Button(role: .destructive) { Task { await model.delete(note) } } label: { Label("Delete", systemImage: "trash") }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Starfield())
            .navigationTitle("Notes")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { creating = true } label: { Image(systemName: "plus") }.accessibilityLabel("New note")
                }
            }
            .refreshable { await model.load() }
            .task { await model.load() }
            .overlay { if !model.loaded { ProgressView() } }
            .sheet(item: $editing) { note in
                NoteEditor(title: note.title, content: note.content ?? "") { t, c in Task { await model.save(id: note.id, title: t, content: c) } }
            }
            .sheet(isPresented: $creating) {
                NoteEditor(title: "", content: "") { t, c in Task { await model.save(id: nil, title: t, content: c) } }
            }
        }
    }
}

struct NoteEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var title: String
    @State var content: String
    let onSave: (String, String) -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TextField("Title", text: $title).font(.system(size: 20, weight: .semibold))
                TextEditor(text: $content)
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            }
            .padding(16)
            .background(Theme.background)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(title, content); dismiss() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty && content.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
