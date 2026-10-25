import SwiftUI
import UIKit

// Tailor & Apply for one job, as on the website (components/jobAgent/ApplicationKitReview):
// /api/job-agent/application-kit builds the match, resume, cover letter and screening answers
// from the person's saved profile and facts; approving files them with the application.
// Nothing is submitted: the person applies on the employer's site.
struct TailorKit {
    struct Answer: Identifiable {
        let id: Int
        let question: String
        let answer: String
        let requiresUserInput: Bool
        let warning: String?
    }

    let raw: [String: Any]
    let score: Int
    let recommended: String
    let confidence: Double
    let eligibility: String
    let warnings: [String]
    let needsInformation: [String]
    let unsupportedKeywords: [String]
    let answers: [Answer]
    let resumeHtml: String
    let resumeMarkdown: String
    let coverHtml: String
    let coverText: String
    let resumeName: String
    let coverName: String

    init?(reply: [String: Any]) {
        guard let kit = reply["kit"] as? [String: Any], let docs = reply["documents"] as? [String: Any] else { return nil }
        let match = kit["match"] as? [String: Any] ?? [:]
        raw = kit
        score = (match["overallScore"] as? NSNumber)?.intValue ?? 0
        recommended = (match["recommendedAction"] as? String ?? "").replacingOccurrences(of: "_", with: " ")
        confidence = (match["confidence"] as? NSNumber)?.doubleValue ?? 0
        eligibility = (match["eligibility"] as? String ?? "").replacingOccurrences(of: "_", with: " ")
        warnings = kit["warnings"] as? [String] ?? []
        needsInformation = kit["needsInformation"] as? [String] ?? []
        unsupportedKeywords = (kit["resume"] as? [String: Any])?["unsupportedKeywords"] as? [String] ?? []
        answers = (kit["screeningAnswers"] as? [[String: Any]] ?? []).enumerated().map { i, a in
            Answer(id: i, question: a["question"] as? String ?? "", answer: a["answer"] as? String ?? "",
                   requiresUserInput: a["requiresUserInput"] as? Bool == true, warning: a["warning"] as? String)
        }
        resumeHtml = docs["resumeHtml"] as? String ?? ""
        resumeMarkdown = docs["resumeMarkdown"] as? String ?? ""
        coverHtml = docs["coverHtml"] as? String ?? ""
        coverText = docs["coverText"] as? String ?? ""
        resumeName = docs["resumeName"] as? String ?? "Resume"
        coverName = docs["coverName"] as? String ?? "Cover_Letter"
    }
}

@MainActor
final class TailorModel: ObservableObject {
    let job: JobPost
    @Published private(set) var kit: TailorKit?
    @Published private(set) var loading = false
    @Published private(set) var approving = false
    @Published private(set) var approved = false
    @Published var error: String?

    init(job: JobPost) { self.job = job }

    func build() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            let data = try await API.fetch("POST", "/api/job-agent/application-kit", json: ["job": job.raw.anyValue, "useSaved": true, "questions": [String]()])
            guard let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let kit = TailorKit(reply: reply) else {
                throw APIError(status: 502)
            }
            self.kit = kit
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Files the documents as they are now and marks the application ready to apply.
    func approve(applications: [ApplicationRow]) async {
        guard let kit, !approving else { return }
        approving = true
        error = nil
        defer { approving = false }
        let now = Fmt.now()
        let stamp = String(Int(Date().timeIntervalSince1970 * 1000), radix: 36)
        let resumeId = "resume_\(stamp)", coverId = "cover_\(stamp)"
        let name = "\(job.company ?? "Company") - \(job.title)"
        let resume = kit.raw["resume"] as? [String: Any] ?? [:]
        do {
            try await DataStore.insert("resume_documents", [
                "id": resumeId, "name": name, "target_job_id": job.id, "document_json": resume,
                "template_id": resume["templateId"] as? String ?? "classic-ats", "version_number": 1,
                "validation_json": ["warnings": kit.warnings],
                "generation_metadata_json": ["generatedAt": kit.raw["generatedAt"] ?? now, "provider": kit.raw["provider"] ?? NSNull()] as [String: Any],
                "created_at": now, "updated_at": now,
            ])
            try await DataStore.insert("cover_letters", [
                "id": coverId, "target_job_id": job.id, "title": name, "document_json": kit.raw["coverLetter"] ?? [String: Any](),
                "version_number": 1, "created_at": now, "updated_at": now,
            ])
            let fields: [String: Any] = [
                "status": "ready_to_apply", "match_score": kit.score, "submitted_resume_id": resumeId,
                "submitted_cover_letter_id": coverId, "submission_url": job.applyURL?.absoluteString ?? NSNull(), "updated_at": now,
            ]
            if let existing = applications.first(where: { $0.job_id == job.id }) {
                try await DataStore.update("applications", id: existing.id, fields)
            } else {
                try await DataStore.insert("applications", fields.merging(["id": "app_\(stamp)", "job_id": job.id, "job_json": job.jsonObject, "created_at": now]) { a, _ in a })
            }
            approved = true
        } catch {
            self.error = "Couldn't save these documents: \(error.localizedDescription)"
        }
    }
}

enum TailorDoc {
    /// The system print sheet, which also saves a PDF.
    @MainActor
    static func print(_ html: String, name: String) {
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = name
        info.outputType = .general
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)
        controller.present(animated: true)
    }

    static func file(_ text: String, name: String, ext: String) -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(name).\(ext)")
        try? text.write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}

struct JobTailorView: View {
    @StateObject private var tailor: TailorModel
    @ObservedObject var model: JobModel
    @State private var tab = 0

    init(job: JobPost, model: JobModel) {
        _tailor = StateObject(wrappedValue: TailorModel(job: job))
        self.model = model
    }

    var body: some View {
        List {
            Section {
                Text(tailor.job.title).font(.system(size: 17, weight: .semibold))
                Text([tailor.job.company, tailor.job.attribution].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            if tailor.loading {
                Section {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Analyzing the role and tailoring your documents…").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                    }
                }
                .listRowBackground(Color.clear)
            }
            if let error = tailor.error {
                Section {
                    Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
                    if tailor.kit == nil { Button("Try again") { Task { await tailor.build() } } }
                }
                .listRowBackground(Color.clear)
            }
            if let kit = tailor.kit { content(kit) }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Tailor & Apply")
        .navigationBarTitleDisplayMode(.inline)
        .task { if tailor.kit == nil { await tailor.build() } }
    }

    @ViewBuilder
    private func content(_ kit: TailorKit) -> some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                VStack(alignment: .leading) {
                    Text("\(kit.score)").font(.system(size: 28, weight: .bold)).foregroundStyle(Theme.blue)
                    Text("MATCH SCORE").font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Recommended: \(kit.recommended)").font(.system(size: 12, weight: .medium))
                    Text("Confidence \(Int((kit.confidence * 100).rounded()))% · \(kit.eligibility)").font(.system(size: 12)).foregroundStyle(Theme.secondary)
                }
            }
            if !kit.warnings.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Review these before applying").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.amber)
                    ForEach(kit.warnings, id: \.self) { Text("• \($0)").font(.system(size: 12)).foregroundStyle(Theme.secondary) }
                }
            }
            if !kit.needsInformation.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Needs your input").font(.system(size: 12, weight: .semibold))
                    ForEach(kit.needsInformation, id: \.self) { Text("• \($0)").font(.system(size: 12)).foregroundStyle(Theme.muted) }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            Picker("Document", selection: $tab) {
                Text("Resume").tag(0)
                Text("Cover letter").tag(1)
                Text("Screening").tag(2)
            }
            .pickerStyle(.segmented)
            switch tab {
            case 0:
                docActions(html: kit.resumeHtml, name: kit.resumeName, text: kit.resumeMarkdown, ext: "md")
                if !kit.unsupportedKeywords.isEmpty {
                    Text("Unsupported keywords left out: \(kit.unsupportedKeywords.joined(separator: ", "))").font(.system(size: 11)).foregroundStyle(Theme.red)
                }
                HTMLView(html: kit.resumeHtml).frame(height: 420)
            case 1:
                docActions(html: kit.coverHtml, name: kit.coverName, text: kit.coverText, ext: "txt")
                HTMLView(html: kit.coverHtml).frame(height: 360)
            default:
                if kit.answers.isEmpty {
                    Text("No screening questions were detected. Add them from the employer's form on the website and run it again.")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
                ForEach(kit.answers) { a in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(a.question).font(.system(size: 13, weight: .medium))
                        if a.requiresUserInput {
                            Text(a.warning ?? "You must answer this yourself.").font(.system(size: 12)).foregroundStyle(Theme.amber)
                        } else {
                            Text(a.answer).font(.system(size: 13)).foregroundStyle(Theme.secondary).textSelection(.enabled)
                            Button("Copy") { UIPasteboard.general.string = a.answer }.font(.system(size: 12)).buttonStyle(.borderless)
                        }
                    }
                }
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))

        Section {
            if tailor.approved {
                Label("Approved and saved to your applications.", systemImage: "checkmark").foregroundStyle(Theme.green)
                Text("Open the employer's posting, then copy your answers and attach your documents. You review CAPTCHA, attestations and the final submit yourself.")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
                if let url = tailor.job.applyURL { Link(destination: url) { Label("Open application", systemImage: "arrow.up.right.square") } }
            } else {
                Text("Approving saves a snapshot of these documents with this application. Nothing is submitted automatically; you apply on the employer's site yourself.")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
                Button {
                    Task {
                        await tailor.approve(applications: model.applications)
                        if tailor.approved { await model.loadLists() }
                    }
                } label: {
                    if tailor.approving { ProgressView() } else { Text("Approve & save") }
                }
                .buttonStyle(GlowButtonStyle())
                .disabled(tailor.approving)
            }
            Text("Match scores are a candidate-side relevance heuristic, not an employer decision or a guarantee of an interview or offer.")
                .font(.system(size: 10)).foregroundStyle(Theme.muted)
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }

    private func docActions(html: String, name: String, text: String, ext: String) -> some View {
        HStack(spacing: 18) {
            Button { TailorDoc.print(html, name: name) } label: { Label("PDF", systemImage: "doc.richtext") }
            ShareLink(item: TailorDoc.file(text, name: name, ext: ext)) { Label(".\(ext)", systemImage: "square.and.arrow.up") }
            Button { UIPasteboard.general.string = text } label: { Label("Copy", systemImage: "doc.on.doc") }
        }
        .font(.system(size: 13))
        .buttonStyle(.borderless)
    }
}
