import SwiftUI
import WebKit

enum MDBlock: Equatable {
    case heading(Int, String)
    case bullet(Int, String)
    case number(String, String)
    case quote(String)
    case code(String)
    case rule
    case text(String)
}

// Headings, bullets, numbered lists, quotes, code, bold, italic and links: what
// Studio and Kolab answers use.
enum Markdown {
    static func blocks(_ source: String) -> [MDBlock] {
        var blocks: [MDBlock] = []
        var paragraph: [String] = []
        var code: [String]?

        func flush() {
            if !paragraph.isEmpty { blocks.append(.text(paragraph.joined(separator: "\n"))) }
            paragraph = []
        }

        for raw in source.components(separatedBy: .newlines) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("```") {
                if let open = code {
                    blocks.append(.code(open.joined(separator: "\n")))
                    code = nil
                } else {
                    flush()
                    code = []
                }
                continue
            }
            if code != nil {
                code?.append(raw)
                continue
            }
            if line.isEmpty {
                flush()
                continue
            }
            let hashes = line.prefix { $0 == "#" }.count
            if (1...6).contains(hashes), line.dropFirst(hashes).first == " " {
                flush()
                blocks.append(.heading(hashes, line.dropFirst(hashes).trimmingCharacters(in: .whitespaces)))
                continue
            }
            if line.count >= 3, let mark = line.first, "-*_".contains(mark), line.allSatisfy({ $0 == mark }) {
                flush()
                blocks.append(.rule)
                continue
            }
            if let marker = ["- ", "* ", "+ ", "• "].first(where: { line.hasPrefix($0) }) {
                flush()
                let indent = min(3, raw.prefix { $0 == " " }.count / 2)
                blocks.append(.bullet(indent, String(line.dropFirst(marker.count))))
                continue
            }
            if let range = line.range(of: #"^\d+[.)]\s+"#, options: .regularExpression) {
                flush()
                blocks.append(.number(line[..<range.upperBound].trimmingCharacters(in: .whitespaces), String(line[range.upperBound...])))
                continue
            }
            if line.hasPrefix(">") {
                flush()
                blocks.append(.quote(line.dropFirst().trimmingCharacters(in: .whitespaces)))
                continue
            }
            if line.hasPrefix("|") {
                flush()
                if line.allSatisfy({ "|-: ".contains($0) }) { continue }
                let cells = line.split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                blocks.append(.text(cells.joined(separator: "  ·  ")))
                continue
            }
            paragraph.append(line)
        }
        if let open = code { blocks.append(.code(open.joined(separator: "\n"))) }
        flush()
        return blocks
    }

    static func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }
}

struct MarkdownView: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(Markdown.blocks(text).enumerated()), id: \.offset) { _, block in
                row(block).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .font(.system(size: 15))
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func row(_ block: MDBlock) -> some View {
        switch block {
        case .heading(let level, let text):
            Text(Markdown.inline(text))
                .font(.system(size: level == 1 ? 22 : level == 2 ? 19 : level == 3 ? 17 : 15, weight: .bold))
                .padding(.top, level <= 2 ? 6 : 2)
        case .bullet(let indent, let text):
            HStack(alignment: .top, spacing: 8) {
                Text("•").foregroundStyle(Theme.blue)
                Text(Markdown.inline(text))
            }
            .padding(.leading, CGFloat(indent) * 16)
        case .number(let label, let text):
            HStack(alignment: .top, spacing: 8) {
                Text(label).foregroundStyle(Theme.blue).monospacedDigit()
                Text(Markdown.inline(text))
            }
        case .quote(let text):
            Text(Markdown.inline(text))
                .foregroundStyle(Theme.secondary)
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Rectangle().fill(Theme.violet).frame(width: 2) }
        case .code(let text):
            ScrollView(.horizontal) {
                Text(text).font(.system(size: 12, design: .monospaced)).padding(10)
            }
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 8))
        case .rule:
            Divider()
        case .text(let text):
            Text(Markdown.inline(text))
        }
    }
}

// Generated pages: the string is loaded as is, scripts are off, and a tapped
// link opens in Safari instead of navigating inside.
struct HTMLView: UIViewRepresentable {
    let html: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        context.coordinator.shown = html
        view.loadHTMLString(html, baseURL: nil)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.shown != html else { return }
        context.coordinator.shown = html
        view.loadHTMLString(html, baseURL: nil)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        var shown = ""

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            switch action.navigationType {
            case .other:
                return .allow
            case .linkActivated:
                if let url = action.request.url { await UIApplication.shared.open(url) }
                return .cancel
            default:
                return .cancel
            }
        }
    }
}

/// A finished answer: Markdown as text, a page in a web view.
struct OutputBody: View {
    let text: String
    let format: String

    var body: some View {
        if format == "html" {
            HTMLView(html: text)
        } else {
            ScrollView {
                MarkdownView(text: text)
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

struct ActionLabel: View {
    let icon: String
    let text: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 17))
            Text(text).font(.system(size: 11))
        }
        .foregroundStyle(Theme.blue)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
    }
}

struct ActionBar<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        HStack(spacing: 0) { content }
            .padding(.vertical, 4)
            .background(Theme.surface.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
    }
}

struct CopyAction: View {
    let text: String
    @State private var copied = false

    var body: some View {
        Button {
            UIPasteboard.general.string = text
            copied = true
            Task {
                try? await Task.sleep(for: .seconds(2))
                copied = false
            }
        } label: {
            ActionLabel(icon: copied ? "checkmark" : "doc.on.doc", text: copied ? "Copied" : "Copy")
        }
        .buttonStyle(.plain)
    }
}

/// Shares the answer as a file named after the tool, or as plain text until the file is written.
struct ShareAction: View {
    let name: String
    let ext: String
    let text: String
    @State private var file: URL?

    var body: some View {
        Group {
            if let file {
                ShareLink(item: file) { ActionLabel(icon: "square.and.arrow.up", text: "Share") }
            } else {
                ShareLink(item: text) { ActionLabel(icon: "square.and.arrow.up", text: "Share") }
            }
        }
        .buttonStyle(.plain)
        .task(id: text) {
            let safe = name.lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
            let url = FileManager.default.temporaryDirectory.appending(path: "\(safe).\(ext)")
            file = (try? text.write(to: url, atomically: true, encoding: .utf8)) == nil ? nil : url
        }
    }
}
