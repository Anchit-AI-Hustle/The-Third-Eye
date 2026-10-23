import SwiftUI

// A job from the search, kept exactly as the server sent it so a saved or tracked
// copy carries every field the website's editor reads.
struct JobPost: Codable, Identifiable, Equatable {
    let raw: JSONValue

    init(from decoder: Decoder) throws { raw = try JSONValue(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    private func string(_ key: String) -> String? {
        if case .string(let value)? = raw[key], !value.isEmpty { return value }
        return nil
    }

    private func number(_ key: String) -> Double? {
        if case .number(let value)? = raw[key] { return value }
        return nil
    }

    var title: String { string("title") ?? "Untitled role" }
    var id: String { string("id") ?? title }
    var company: String? { string("company") }
    var location: String? { string("locationText") }
    var remoteType: String? { string("remoteType") }
    var employmentType: String? { string("employmentType") }
    var published: String? { string("publishedAt") }
    var details: String? { string("descriptionText") }
    var attribution: String? { string("sourceAttribution") }

    /// Only web links open: the server's URL is data, not something to hand to any app.
    var applyURL: URL? {
        guard let url = (string("applyUrl") ?? string("canonicalUrl")).flatMap(URL.init(string:)),
              ["http", "https"].contains(url.scheme ?? "") else { return nil }
        return url
    }

    var salary: String? {
        if let text = string("salaryOriginalText") { return text }
        let currency = string("salaryCurrency") ?? ""
        let range: String
        switch (number("salaryMin"), number("salaryMax")) {
        case let (low?, high?): range = "\(Fmt.number(low))–\(Fmt.number(high))"
        case let (low?, nil): range = "\(Fmt.number(low))+"
        case let (nil, high?): range = "up to \(Fmt.number(high))"
        default: return nil
        }
        return "\(currency) \(range)".trimmingCharacters(in: .whitespaces)
    }
}

struct JobSource: Decodable, Identifiable {
    let id: String
    let displayName: String
    let state: String
    let url: String?
}

struct JobSearchReply: Decodable {
    let jobs: [JobPost]
    let sources: [JobSource]
}

struct SavedJobRow: Decodable, Identifiable {
    let id: String
    let job_id: String
    let job_json: JobPost?
    let state: String?
}

struct ApplicationRow: Decodable, Identifiable {
    let id: String
    let job_id: String
    let job_json: JobPost?
    var status: String?
}

struct JobFact: Decodable, Identifiable {
    let id: String
    let factType: String?
    let value: JSONValue?
    let confidence: Double?
    let verified: String?
    let sensitivity: String?

    enum CodingKeys: String, CodingKey { case id, factType, value, confidence, verified, sensitivity }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        factType = try? c.decodeIfPresent(String.self, forKey: .factType)
        value = try? c.decodeIfPresent(JSONValue.self, forKey: .value)
        confidence = (try? c.decodeIfPresent(Flex.self, forKey: .confidence))?.value
        verified = try? c.decodeIfPresent(String.self, forKey: .verified)
        sensitivity = try? c.decodeIfPresent(String.self, forKey: .sensitivity)
    }
}

struct ProfileImport: Decodable {
    let profile: JSONValue
    var facts: [JobFact]

    var headline: String? { profile["headline"]?.text }
    var summary: String? { profile["summary"]?.text }
}

struct ProfileRow: Decodable {
    let id: String
    let headline: String?
    let summary: String?
}

enum JobTab: String, CaseIterable, Identifiable {
    case search, saved, applications, profile
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
}

enum JobAgent {
    static let statuses = ["preparing", "needs_review", "ready_to_apply", "applying", "submitted", "recruiter_contact", "assessment",
                           "interview", "final_interview", "offer", "accepted", "rejected", "withdrawn", "archived"]
    static let remoteChoices = ["any", "remote", "hybrid", "onsite"]

    static func statusLabel(_ status: String) -> String {
        status.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

@MainActor
final class JobModel: ObservableObject {
    @Published var jobs: [JobPost] = []
    @Published var sources: [JobSource] = []
    @Published var searched = false
    @Published var searching = false
    @Published var saved: [SavedJobRow] = []
    private var savedRows: [SavedJobRow] = []
    @Published var applications: [ApplicationRow] = []
    @Published var savedProfile: ProfileRow?
    @Published var imported: ProfileImport?
    @Published var working = false
    @Published var disabled = false
    @Published var error: String?
    @Published var notice: String?

    private func report(_ failure: Error) {
        if let server = failure as? ServerError, server.disabled { disabled = true } else { error = failure.localizedDescription }
    }

    func loadLists() async {
        do {
            savedRows = try await DataStore.list("saved_jobs", as: SavedJobRow.self)
            saved = savedRows.filter { ($0.state ?? "saved") == "saved" }
            applications = try await DataStore.list("applications", as: ApplicationRow.self)
            error = nil
        } catch {
            report(error)
        }
    }

    func loadProfile(email: String) async {
        do {
            savedProfile = try await DataStore.list("job_agent_profiles?id=\(Fmt.query("japrofile_\(email)"))", as: ProfileRow.self).first
        } catch {
            report(error)
        }
    }

    func search(query: String, location: String, remote: String) async {
        searching = true
        error = nil
        defer { searching = false }
        var body: [String: Any] = ["query": query, "remotePreference": remote, "limit": 30]
        if !location.isEmpty { body["location"] = location }
        do {
            let reply = try await API.call("POST", "/api/job-agent/search", json: body, as: JobSearchReply.self)
            jobs = reply.jobs
            sources = reply.sources
            searched = true
        } catch {
            report(error)
        }
    }

    func save(_ job: JobPost) async {
        if saved.contains(where: { $0.job_id == job.id }) {
            notice = "Already saved."
            return
        }
        do {
            if let existing = savedRows.first(where: { $0.job_id == job.id }) {
                try await DataStore.update("saved_jobs", id: existing.id, ["state": "saved"])
            } else {
                try await DataStore.insert("saved_jobs", ["id": "sj_\(UUID().uuidString.lowercased())", "job_id": job.id,
                                                          "job_json": job.jsonObject, "state": "saved", "created_at": Fmt.now()])
            }
            notice = "Saved."
            await loadLists()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func track(_ job: JobPost) async {
        if applications.contains(where: { $0.job_id == job.id }) {
            notice = "Already tracked."
            return
        }
        let now = Fmt.now()
        do {
            try await DataStore.insert("applications", ["id": "app_\(UUID().uuidString.lowercased())", "job_id": job.id, "job_json": job.jsonObject,
                                                        "status": "preparing", "match_score": NSNull(), "created_at": now, "updated_at": now])
            notice = "Tracking this application."
            await loadLists()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func removeSaved(_ row: SavedJobRow) async {
        saved.removeAll { $0.id == row.id }
        savedRows.removeAll { $0.id == row.id }
        do { try await DataStore.delete("saved_jobs", id: row.id) } catch {
            self.error = error.localizedDescription
            await loadLists()
        }
    }

    func setStatus(_ row: ApplicationRow, _ status: String) async {
        if let index = applications.firstIndex(where: { $0.id == row.id }) { applications[index].status = status }
        do { try await DataStore.update("applications", id: row.id, ["status": status, "updated_at": Fmt.now()]) } catch {
            self.error = error.localizedDescription
            await loadLists()
        }
    }

    func importResume(_ text: String) async {
        working = true
        error = nil
        defer { working = false }
        do {
            var batch = try await API.call("POST", "/api/job-agent/profile/import", json: ["text": text], as: ProfileImport.self)
            batch.facts = (imported?.facts ?? []) + batch.facts
            imported = batch
        } catch {
            report(error)
        }
    }

    /// The profile row, then each fact in the vault's own columns.
    func saveProfile(email: String) async {
        guard let imported else { return }
        working = true
        error = nil
        defer { working = false }
        let id = "japrofile_\(email)"
        let now = Fmt.now()
        var fields: [String: Any] = ["profile_json": imported.profile.anyValue, "updated_at": now]
        if let headline = imported.headline { fields["headline"] = headline }
        if let summary = imported.summary { fields["summary"] = summary }
        do {
            let existing = try await DataStore.list("job_agent_profiles?id=\(Fmt.query(id))", as: ProfileRow.self)
            if existing.isEmpty {
                var row = fields
                row["id"] = id
                try await DataStore.insert("job_agent_profiles", row)
            } else {
                try await DataStore.update("job_agent_profiles", id: id, fields)
            }
            if !imported.facts.isEmpty {
                let rows = imported.facts.map { fact -> [String: Any] in
                    ["id": fact.id, "profile_id": id, "fact_type": fact.factType ?? "fact", "value_json": fact.value?.anyValue ?? NSNull(),
                     "confidence": fact.confidence ?? 0.5, "verified": fact.verified ?? "unverified",
                     "sensitivity": fact.sensitivity ?? "normal", "updated_at": now]
                }
                try await API.fetch("POST", "/api/data/candidate_facts", json: rows)
            }
            self.imported = nil
            notice = "Profile saved."
            await loadProfile(email: email)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct JobAgentView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = JobModel()
    @State private var tab: JobTab
    @State private var query: String
    @State private var location = ""
    @State private var remote = "any"
    @State private var resume = ""
    private let searchesOnOpen: Bool

    init(tab: String?, query: String?) {
        _tab = State(initialValue: JobTab(rawValue: tab ?? "") ?? .search)
        _query = State(initialValue: query ?? "")
        searchesOnOpen = !(query ?? "").isEmpty
    }

    var body: some View {
        List {
            if model.disabled {
                Text("Job Agent is turned off on this server.").foregroundStyle(Theme.muted)
            } else {
                Section {
                    Picker("Section", selection: $tab) {
                        ForEach(JobTab.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                }
                if let error = model.error { Text(error).foregroundStyle(Theme.red).font(.system(size: 13)) }
                if let notice = model.notice { Text(notice).foregroundStyle(Theme.blue).font(.system(size: 13)) }
                switch tab {
                case .search: searchSections
                case .saved: savedSection
                case .applications: applicationsSection
                case .profile: profileSections
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Job Agent")
        .refreshable {
            await model.loadLists()
            await model.loadProfile(email: session.email ?? "")
        }
        .task {
            await model.loadLists()
            await model.loadProfile(email: session.email ?? "")
            if searchesOnOpen { await model.search(query: query, location: location, remote: remote) }
        }
        .reloadsOnDataChange { await model.loadLists() }
    }

    @ViewBuilder
    private var searchSections: some View {
        Section {
            TextField("Job title or keywords", text: $query)
            TextField("Location (optional)", text: $location)
            Picker("Work style", selection: $remote) {
                ForEach(JobAgent.remoteChoices, id: \.self) { Text($0.capitalized).tag($0) }
            }
            if model.searching {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Searching job boards…").font(.system(size: 13)).foregroundStyle(Theme.secondary)
                }
            } else {
                Button("Search") {
                    Task { await model.search(query: query.trimmingCharacters(in: .whitespacesAndNewlines), location: location.trimmingCharacters(in: .whitespacesAndNewlines), remote: remote) }
                }
                .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        if model.searched {
            Section("\(model.jobs.count) jobs") {
                if model.jobs.isEmpty { Text("No jobs found. Try other words.").foregroundStyle(Theme.muted) }
                ForEach(model.jobs) { job in
                    NavigationLink { JobDetailView(job: job, model: model) } label: { JobRow(job: job) }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
            let external = model.sources.filter { $0.state == "external-search" && $0.url.flatMap(URL.init(string:)) != nil }
            if !external.isEmpty {
                Section("Search elsewhere") {
                    ForEach(external) { source in
                        if let url = source.url.flatMap(URL.init(string:)) {
                            Link("Search on \(source.displayName)", destination: url)
                        }
                    }
                    .listRowBackground(Theme.surface.opacity(0.7))
                }
            }
        }
    }

    @ViewBuilder
    private var savedSection: some View {
        Section("Saved jobs") {
            if model.saved.isEmpty { Text("Nothing saved yet. Save a job from the search results.").foregroundStyle(Theme.muted) }
            ForEach(model.saved) { row in
                Group {
                    if let job = row.job_json {
                        NavigationLink { JobDetailView(job: job, model: model) } label: { JobRow(job: job) }
                    } else {
                        Text(row.job_id).foregroundStyle(Theme.secondary)
                    }
                }
                .swipeActions {
                    Button(role: .destructive) { Task { await model.removeSaved(row) } } label: { Label("Remove", systemImage: "trash") }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    @ViewBuilder
    private var applicationsSection: some View {
        Section("Applications") {
            if model.applications.isEmpty { Text("No applications yet. Tap Track application on a job.").foregroundStyle(Theme.muted) }
            ForEach(model.applications) { row in
                VStack(alignment: .leading, spacing: 6) {
                    if let job = row.job_json {
                        JobRow(job: job)
                    } else {
                        Text(row.job_id).font(.system(size: 15, weight: .medium))
                    }
                    Picker("Status", selection: Binding(get: { row.status ?? "preparing" }, set: { status in Task { await model.setStatus(row, status) } })) {
                        ForEach(JobAgent.statuses, id: \.self) { Text(JobAgent.statusLabel($0)).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
    }

    @ViewBuilder
    private var profileSections: some View {
        if let saved = model.savedProfile {
            Section("Saved profile") {
                VStack(alignment: .leading, spacing: 4) {
                    if let headline = saved.headline, !headline.isEmpty { Text(headline).font(.system(size: 15, weight: .semibold)) }
                    if let summary = saved.summary, !summary.isEmpty { Text(summary).font(.system(size: 13)).foregroundStyle(Theme.secondary) }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
        Section("Import your resume") {
            TextField("Paste your resume text here", text: $resume, axis: .vertical).lineLimit(6...12)
            if model.working {
                ProgressView()
            } else {
                Button("Read resume") { Task { await model.importResume(resume.trimmingCharacters(in: .whitespacesAndNewlines)) } }
                    .disabled(resume.trimmingCharacters(in: .whitespacesAndNewlines).count < 40)
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
        if let imported = model.imported {
            Section("What we found") {
                if let headline = imported.headline, !headline.isEmpty { Text(headline).font(.system(size: 15, weight: .semibold)) }
                if let summary = imported.summary, !summary.isEmpty { Text(summary).font(.system(size: 13)).foregroundStyle(Theme.secondary) }
                ForEach(imported.facts) { fact in
                    VStack(alignment: .leading, spacing: 2) {
                        Text((fact.factType ?? "fact").capitalized).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.muted)
                        Text(fact.value?.text ?? "").font(.system(size: 13))
                    }
                }
                Button("Save profile") { Task { await model.saveProfile(email: session.email ?? "") } }
                    .disabled(model.working)
            }
            .listRowBackground(Theme.surface.opacity(0.7))
        }
        Section {
            NavigationLink { RouteView(path: "/job-agent/search", title: "Tailor resume") } label: {
                Label("Tailor resume & cover letter", systemImage: "doc.richtext")
            }
        }
        .listRowBackground(Theme.surface.opacity(0.7))
    }
}

struct JobRow: View {
    let job: JobPost

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(job.title).font(.system(size: 15, weight: .medium)).lineLimit(2)
            Text([job.company, job.location].compactMap { $0 }.joined(separator: " · ")).font(.system(size: 12)).foregroundStyle(Theme.secondary)
            HStack(spacing: 6) {
                if let remote = job.remoteType { Badge(text: remote.capitalized, color: Theme.blue) }
                if let salary = job.salary { Text(salary).font(.system(size: 12)).foregroundStyle(Theme.muted) }
            }
        }
    }
}

struct JobDetailView: View {
    let job: JobPost
    @ObservedObject var model: JobModel

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(job.title).font(.system(size: 20, weight: .bold))
                    if let company = job.company { Text(company).font(.system(size: 15)).foregroundStyle(Theme.secondary) }
                    Text([job.location, job.employmentType?.capitalized, job.remoteType?.capitalized].compactMap { $0 }.joined(separator: " · "))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    if let salary = job.salary { Text(salary).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.blue) }
                    if let published = job.published { Text("Posted \(Fmt.date(published))").font(.system(size: 12)).foregroundStyle(Theme.muted) }
                }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            Section {
                if let url = job.applyURL {
                    Link(destination: url) { Label("Apply", systemImage: "arrow.up.right.square") }
                }
                Button { Task { await model.save(job) } } label: { Label("Save", systemImage: "bookmark") }
                Button { Task { await model.track(job) } } label: { Label("Track application", systemImage: "checklist") }
                if let notice = model.notice { Text(notice).font(.system(size: 13)).foregroundStyle(Theme.blue) }
                if let error = model.error { Text(error).font(.system(size: 13)).foregroundStyle(Theme.red) }
            }
            .listRowBackground(Theme.surface.opacity(0.7))
            if let details = job.details {
                Section("Description") {
                    Text(details).font(.system(size: 14)).textSelection(.enabled)
                    if let attribution = job.attribution { Text(attribution).font(.system(size: 11)).foregroundStyle(Theme.muted) }
                }
                .listRowBackground(Theme.surface.opacity(0.7))
            }
        }
        .scrollContentBackground(.hidden)
        .background(Starfield())
        .navigationTitle("Job")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { model.notice = nil }
    }
}
