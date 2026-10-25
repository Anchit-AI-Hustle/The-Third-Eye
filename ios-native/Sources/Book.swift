import CryptoKit
import SwiftUI

// Book Studio's writer, as on the website (components/studio/BookWriter): writes the planned
// outline out chapter by chapter through /api/tools/book, keeps the draft on the phone, and
// exports an EPUB, the manuscript and the store listing.
struct BookOutline: Equatable {
    struct Chapter: Equatable, Identifiable {
        let n: Int
        let title: String
        let beats: String
        var id: Int { n }
    }

    let title: String
    let subtitle: String
    let chapters: [Chapter]

    /// "### Chapter 3: The Fall" blocks with the bullets under each, as lib/book parseOutline.
    init(markdown: String) {
        let lines = markdown.components(separatedBy: "\n")
        let heading = #/^#\s+\S/#
        let titleAt = lines.firstIndex { $0.contains(heading) }
        title = titleAt.map { lines[$0].replacing(#/^#\s+/#, with: "").trimmingCharacters(in: .whitespaces) } ?? "Untitled"
        let next = titleAt.flatMap { at in lines[(at + 1)...].first { !$0.trimmingCharacters(in: .whitespaces).isEmpty } }?
            .trimmingCharacters(in: .whitespaces).replacing(#/^[*_]+|[*_]+$/#, with: "") ?? ""
        subtitle = next.hasPrefix("#") ? "" : next
        var found: [(n: Int, title: String, beats: [String])] = []
        var inChapter = false
        for raw in lines {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if let m = line.wholeMatch(of: #/(?i)#{2,4}\s*Chapter\s+(\d+)\s*[:.—–-]?\s*(.*)/#) {
                let n = Int(m.1) ?? found.count + 1
                let name = String(m.2).trimmingCharacters(in: .whitespaces)
                found.append((n, name.isEmpty ? "Chapter \(n)" : name, []))
                inChapter = true
            } else if line.contains(#/^#{1,3}\s/#) {
                inChapter = false
            } else if inChapter, !line.isEmpty {
                found[found.count - 1].beats.append(line)
            }
        }
        chapters = found.map { Chapter(n: $0.n, title: $0.title, beats: $0.beats.joined(separator: "\n")) }
    }
}

enum Book {
    static let partWords = 2500
    static func parts(_ words: Int) -> Int { max(1, Int((Double(words) / Double(partWords)).rounded(.up))) }
    static func words(_ text: String) -> Int { text.split(whereSeparator: \.isWhitespace).count }
    static let stores = [
        ("Kindle Direct Publishing", "https://kdp.amazon.com/en_US/title-setup/kindle/new/details"),
        ("Google Play Books", "https://play.google.com/books/publish/"),
        ("Draft2Digital (Apple, Kobo, B&N…)", "https://draft2digital.com/book/new"),
    ]
}

struct BookListing: Codable, Equatable {
    var title: String?
    var subtitle: String?
    var description: String
    var keywords: [String]
    var categories: [String]?
    var audience: String?
}

@MainActor
final class BookModel: ObservableObject {
    private struct Draft: Codable {
        var texts: [Int: String]
        var author: String
        var listing: BookListing?
    }

    let outline: BookOutline
    let inputs: [String: String]
    private let markdown: String
    private let key: String

    @Published var texts: [Int: String] = [:] { didSet { persist() } }
    @Published var author = "" { didSet { persist() } }
    @Published private(set) var listing: BookListing? { didSet { persist() } }
    @Published private(set) var busy: Set<Int> = []
    @Published private(set) var progress: [Int: String] = [:]
    @Published private(set) var failures: [Int: String] = [:]
    @Published private(set) var writingAll = false
    @Published private(set) var listingBusy = false
    @Published private(set) var epub: URL?
    @Published private(set) var exporting = false
    @Published var error: String?
    private var stopAll = false

    init(markdown: String, inputs: [String: String]) {
        self.markdown = markdown
        self.inputs = inputs
        outline = BookOutline(markdown: markdown)
        key = "book-studio:" + SHA256.hash(data: Data(markdown.utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
        if let data = UserDefaults.standard.data(forKey: key), let draft = try? JSONDecoder().decode(Draft.self, from: data) {
            texts = draft.texts
            author = draft.author
            listing = draft.listing
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(Draft(texts: texts, author: author, listing: listing)) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    var perChapter: Int { Int(inputs["length"] ?? "") ?? 2500 }
    var written: [BookOutline.Chapter] { outline.chapters.filter { !(texts[$0.n] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } }
    var totalWords: Int { written.reduce(0) { $0 + Book.words(texts[$1.n] ?? "") } }

    private var book: [String: Any] {
        ["title": outline.title, "premise": inputs["premise"] ?? "", "genre": inputs["genre"] ?? "", "voice": inputs["voice"] ?? "", "outline": markdown]
    }

    @discardableResult
    func write(_ chapter: BookOutline.Chapter) async -> Bool {
        guard !busy.contains(chapter.n) else { return false }
        busy.insert(chapter.n)
        failures[chapter.n] = nil
        defer { busy.remove(chapter.n); progress[chapter.n] = nil }
        let of = Book.parts(perChapter)
        let index = outline.chapters.firstIndex(of: chapter) ?? 0
        let before = index > 0 ? String((texts[outline.chapters[index - 1].n] ?? "").suffix(2000)) : ""
        var text = ""
        do {
            for part in 1...of {
                if of > 1 { progress[chapter.n] = "part \(part) of \(of)" }
                let data = try await API.fetch("POST", "/api/tools/book", json: [
                    "action": "chapter", "book": book,
                    "chapter": ["n": chapter.n, "title": chapter.title, "beats": chapter.beats],
                    "part": part, "of": of, "words": perChapter, "before": before, "sofar": String(text.suffix(3000)),
                ])
                guard let piece = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["text"] as? String, !piece.isEmpty else {
                    throw APIError(status: 502)
                }
                text = text.isEmpty ? piece : text + "\n\n" + piece
            }
            texts[chapter.n] = text
            epub = nil
            return true
        } catch {
            failures[chapter.n] = error.localizedDescription
            return false
        }
    }

    /// In order, so each chapter picks up from how the one before it actually ended.
    func writeAll() async {
        writingAll = true
        stopAll = false
        defer { writingAll = false }
        for chapter in outline.chapters {
            if stopAll { break }
            if !(texts[chapter.n] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { continue }
            if !(await write(chapter)) { break }
        }
    }

    func stop() { stopAll = true }

    private var meta: [String: String] {
        ["title": listing?.title ?? outline.title, "subtitle": listing?.subtitle ?? outline.subtitle,
         "author": author.trimmingCharacters(in: .whitespaces).isEmpty ? "Anonymous" : author]
    }

    var manuscript: String {
        ([ "# \(meta["title"] ?? "")", meta["subtitle"] ?? "", "by \(meta["author"] ?? "")" ]
            + written.map { "## Chapter \($0.n): \($0.title)\n\n\(texts[$0.n] ?? "")" })
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
    }

    var slug: String {
        let s = outline.title.lowercased().replacing(#/[^\w\s-]/#, with: "").trimmingCharacters(in: .whitespaces).replacing(#/\s+/#, with: "-")
        return s.isEmpty ? "book" : s
    }

    func exportEpub() async {
        guard !written.isEmpty, !exporting else { return }
        exporting = true
        error = nil
        defer { exporting = false }
        do {
            let data = try await API.fetch("POST", "/api/tools/book", json: [
                "action": "epub", "meta": meta,
                "chapters": written.map { ["title": "Chapter \($0.n): \($0.title)", "text": texts[$0.n] ?? ""] },
            ])
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(slug).epub")
            try data.write(to: url, options: .atomic)
            epub = url
            GenerationStore.shared.add(app: "book", tool: "book", appLabel: "Book Studio", title: outline.title, kind: "markdown",
                                       inputs: [Generation.Input(label: "Premise", value: inputs["premise"] ?? ""),
                                                Generation.Input(label: "Chapters", value: "\(written.count) of \(outline.chapters.count)")],
                                       output: manuscript)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func makeListing() async {
        listingBusy = true
        error = nil
        defer { listingBusy = false }
        do {
            let sample = written.first.map { String((texts[$0.n] ?? "").prefix(4000)) } ?? ""
            struct Reply: Decodable { let listing: BookListing }
            listing = try await API.call("POST", "/api/tools/book", json: ["action": "listing", "book": book, "sample": sample], as: Reply.self).listing
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct BookWriterView: View {
    @StateObject private var model: BookModel
    @State private var open: Int?

    init(markdown: String, inputs: [String: String]) {
        _model = StateObject(wrappedValue: BookModel(markdown: markdown, inputs: inputs))
    }

    var body: some View {
        Form {
            if model.outline.chapters.isEmpty {
                Text("The outline has no \"### Chapter N: …\" headings to write from. Plan the book again.")
                    .font(.system(size: 13)).foregroundStyle(Theme.amber)
            } else {
                Section {
                    Text("\(model.written.count)/\(model.outline.chapters.count) chapters · \(model.totalWords.formatted()) words")
                        .font(.system(size: 13, design: .monospaced)).foregroundStyle(Theme.secondary)
                    Text("Each chapter is written in order, about \(model.perChapter.formatted()) words, picking up from how the last one ended. The draft is kept on this phone; edit any chapter before you export.")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    if let asked = Int(model.inputs["chapters"] ?? ""), model.outline.chapters.count < asked {
                        Text("The outline came back with \(model.outline.chapters.count) of the \(asked) chapters asked for. Plan the book again for the full set.")
                            .font(.system(size: 12)).foregroundStyle(Theme.amber)
                    }
                    if model.writingAll {
                        Button("Stop after this chapter") { model.stop() }
                    } else if model.written.count < model.outline.chapters.count {
                        Button(model.written.isEmpty ? "Write every chapter" : "Write the rest") { Task { await model.writeAll() } }
                            .buttonStyle(GlowButtonStyle())
                    }
                }
                .listRowBackground(Theme.surface.opacity(0.7))

                Section("Chapters") {
                    ForEach(model.outline.chapters) { chapter in chapterRow(chapter) }
                }
                .listRowBackground(Theme.surface.opacity(0.7))

                publish
            }
            if let error = model.error {
                Text(error).font(.system(size: 13)).foregroundStyle(Theme.red).listRowBackground(Color.clear)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle(model.outline.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func chapterRow(_ chapter: BookOutline.Chapter) -> some View {
        let text = model.texts[chapter.n] ?? ""
        let busy = model.busy.contains(chapter.n)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Button { open = open == chapter.n ? nil : chapter.n } label: {
                    Text("\(chapter.n). \(chapter.title)").font(.system(size: 14, weight: .semibold)).multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
                Spacer()
                if busy {
                    ProgressView()
                    if let step = model.progress[chapter.n] { Text(step).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                } else {
                    Button(text.isEmpty ? "Write" : "Rewrite") { Task { await model.write(chapter) } }
                        .buttonStyle(.borderless)
                        .disabled(model.writingAll)
                }
            }
            if !text.isEmpty {
                Text("\(Book.words(text).formatted()) words").font(.system(size: 11, design: .monospaced)).foregroundStyle(Theme.muted)
            }
            if let failure = model.failures[chapter.n] {
                Text(failure).font(.system(size: 12)).foregroundStyle(Theme.red)
            }
            if open == chapter.n {
                Text(chapter.beats).font(.system(size: 12)).foregroundStyle(Theme.muted)
                TextField("Write it yourself, or tap Write.", text: Binding(get: { model.texts[chapter.n] ?? "" }, set: { model.texts[chapter.n] = $0 }), axis: .vertical)
                    .lineLimit(8...30)
                    .font(.system(size: 14))
            }
        }
    }

    @ViewBuilder
    private var publish: some View {
        Section("Publish") {
            TextField("Author name (pen name is fine)", text: $model.author)
            HStack(spacing: 16) {
                if let epub = model.epub {
                    ShareLink(item: epub) { Label("Share EPUB", systemImage: "book.closed") }
                } else {
                    Button {
                        Task { await model.exportEpub() }
                    } label: {
                        if model.exporting { ProgressView() } else { Label("EPUB\(model.written.count < model.outline.chapters.count ? " (\(model.written.count) ch.)" : "")", systemImage: "arrow.down.doc") }
                    }
                    .disabled(model.written.isEmpty)
                }
                ShareLink(item: model.manuscript) { Label("Manuscript", systemImage: "doc.text") }
                    .disabled(model.written.isEmpty)
            }
            .buttonStyle(.borderless)
            Button {
                Task { await model.makeListing() }
            } label: {
                if model.listingBusy { ProgressView() } else { Text(model.listing == nil ? "Write store listing" : "Redo store listing") }
            }
            .disabled(model.listingBusy)
            if let listing = model.listing {
                listingRow("Title", listing.title ?? model.outline.title)
                listingRow("Subtitle", listing.subtitle ?? "")
                listingRow("Description", listing.description)
                listingRow("Keywords", listing.keywords.joined(separator: "\n"))
                listingRow("Categories", (listing.categories ?? []).joined(separator: "\n"))
                listingRow("Audience", listing.audience ?? "")
            }
            ForEach(Book.stores, id: \.1) { store in
                if let url = URL(string: store.1) { Link(store.0, destination: url).font(.system(size: 13)) }
            }
            Text("These stores have no publishing API, so the last step is yours: upload the EPUB, paste the listing, add a cover, set the price. Mark the book as AI-assisted where the store asks.")
                .font(.system(size: 11)).foregroundStyle(Theme.muted)
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    @ViewBuilder
    private func listingRow(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(label).font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.muted)
                    Spacer()
                    Button { UIPasteboard.general.string = value } label: { Image(systemName: "doc.on.doc") }
                        .buttonStyle(.borderless)
                        .accessibilityLabel("Copy \(label)")
                }
                Text(value).font(.system(size: 13)).foregroundStyle(Theme.secondary).textSelection(.enabled)
            }
        }
    }
}
