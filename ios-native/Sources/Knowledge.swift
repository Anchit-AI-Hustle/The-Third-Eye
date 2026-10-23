import SwiftUI

struct KnowledgeDoc: Codable, Identifiable, Equatable {
    let id: String
    var title: String
    var content: String?
    var file_type: String?
    var file_size_bytes: Flex?
    var chunk_count: Flex?
    var processing_status: String?
    var error: String?
}

@MainActor
final class KnowledgeModel: ObservableObject {
    @Published var docs: [KnowledgeDoc] = []
    @Published var error: String?
    @Published var loaded = false

    func load() async {
        do {
            docs = try await DataStore.list("knowledge_docs", as: KnowledgeDoc.self)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
        loaded = true
    }

    func delete(_ doc: KnowledgeDoc) async {
        docs.removeAll { $0.id == doc.id }
        do { try await DataStore.delete("knowledge_docs", id: doc.id) } catch {
            self.error = error.localizedDescription
            await load()
        }
    }
}

struct KnowledgeView: View {
    @EnvironmentObject private var app: AppState
    @StateObject private var model = KnowledgeModel()
    @State private var upload = false

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(Theme.red).font(.system(size: 13))
            }
            Section {
                Text("\(model.docs.filter { $0.processing_status == "ready" }.count) of \(model.docs.count) documents ready. The assistant answers from them.")
                    .font(.system(size: 13)).foregroundStyle(Theme.secondary)
                Button { app.ask("What's in my knowledge base? Give me a short overview.") } label: {
                    Label("Ask about my documents", systemImage: "bubble.left.and.text.bubble.right")
                }
                Button { upload = true } label: { Label("Upload a document", systemImage: "arrow.up.doc") }
            }
            .listRowBackground(Theme.surface.opacity(0.7))

            Section("Documents") {
                if model.loaded && model.docs.isEmpty {
                    Text("No documents yet. Upload a PDF, Word or text file to search it with the assistant.").foregroundStyle(Theme.muted)
                }
                ForEach(model.docs) { doc in
                    NavigationLink { DocumentView(doc: doc) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(doc.title).font(.system(size: 15, weight: .medium)).lineLimit(2)
                            Text(details(doc)).font(.system(size: 12))
                                .foregroundStyle(doc.processing_status == "ready" ? Theme.muted : Theme.red)
                        }
                    }
                    .swipeActions {
                        Button(role: .destructive) { Task { await model.delete(doc) } } label: { Label("Delete", systemImage: "trash") }
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Knowledge")
        .refreshable { await model.load() }
        .task { await model.load() }
        .reloadsOnDataChange { await model.load() }
        .overlay { if !model.loaded { ProgressView() } }
        // Uploading and text extraction stay on the website's tested pipeline.
        .sheet(isPresented: $upload, onDismiss: { Task { await model.load() } }) {
            NavigationStack {
                WebScreen(path: "/knowledge")
                    .navigationTitle("Upload")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { upload = false } } }
            }
        }
    }

    private func details(_ doc: KnowledgeDoc) -> String {
        let kb = Int((doc.file_size_bytes?.value ?? 0) / 1024)
        let type = (doc.file_type ?? "txt").uppercased()
        if doc.processing_status == "ready" { return "\(type) · \(kb) KB · \(Int(doc.chunk_count?.value ?? 0)) chunks" }
        return "\(type) · \(doc.processing_status ?? "processing")\(doc.error.map { ": \($0)" } ?? "")"
    }
}

struct DocumentView: View {
    let doc: KnowledgeDoc

    var body: some View {
        ScrollView {
            Text(doc.content?.isEmpty == false ? doc.content! : "No text was extracted from this document.")
                .font(.system(size: 14))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
        }
        .background(Starfield())
        .navigationTitle(doc.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
