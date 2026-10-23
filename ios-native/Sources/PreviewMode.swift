import Foundation

// CI's layout screenshots: launched with -preview-screen NAME the app opens that
// screen inside More and answers every request from the fixtures below instead
// of the server, so the screens show realistic content with no account.
enum PreviewMode {
    static let screen = UserDefaults.standard.string(forKey: "preview-screen")
    static var active: Bool { screen != nil }
    static let name = "Alex Morgan"
    static let email = "alex@example.com"

    static let paths = [
        "studio": "/tools",
        "studio-tool": "/tools/social-media",
        "generations": "/generations",
        "generation": "/generations/gen_preview_1",
        "skills": "/skills",
        "apps": "/apps",
        "plans": "/plans",
        "capabilities": "/capabilities",
        "agents": "/agents",
        "audit": "/audit",
        "kolab": "/kolab",
        "job-agent": "/job-agent?q=product%20manager",
        "job-saved": "/job-agent?tab=saved",
        "job-applications": "/job-agent?tab=applications",
        "job-profile": "/job-agent?tab=profile",
        "settings": "/settings",
    ]

    static var path: String? { screen.flatMap { paths[$0] } }

    /// The files the on-phone screens read: creations, skills and a Kolab brand.
    static func seed() {
        guard active else { return }
        LocalStore.write(LocalFile.generations, generations)
        LocalStore.write(LocalFile.skills, skills)
        var brand = KolabBrand()
        brand.name = "Northwind Coffee"
        brand.industry = "Specialty coffee"
        brand.product = "Single-origin beans on subscription"
        brand.audience = "Remote workers who care about quality"
        brand.pricePoint = "premium"
        brand.region = "India"
        brand.channels = "Instagram, Email, WhatsApp"
        brand.stage = "growth"
        brand.goals = "Raise repeat purchase rate to 45%"
        LocalStore.write(LocalFile.kolab, KolabDraft(brand: brand, mode: "lifecycle", brief: "Focus on the first 60 days after the first order."))
    }

    static let generations = [
        Generation(id: "gen_preview_1", app: "studio", tool: "social-media", appLabel: "Social Media Studio",
                   title: "Social Media Studio: Launch week for our new roast", kind: "markdown", createdAt: "2026-10-22T09:30:00.000Z",
                   inputs: [.init(label: "Platform", value: "Instagram"), .init(label: "Topic", value: "Launch week for our new roast"), .init(label: "Tone", value: "Warm and playful")],
                   output: """
                   # Launch week plan

                   Three posts to build **anticipation** without overselling.

                   ## Post 1: the teaser
                   - Close-up of beans, no logo, caption: *something is roasting*
                   - Hashtags: #newroast #coffeetime

                   ## Post 2: the story
                   1. Where the beans come from
                   2. Who roasts them
                   3. How to brew them at home

                   > Keep every caption under 120 characters.

                   Read more on [our site](https://example.com/roast).

                   | Day | Post |
                   |---|---|
                   | Mon | Teaser |
                   | Wed | Story |
                   """),
        Generation(id: "gen_preview_2", app: "studio", tool: "landing-page", appLabel: "Landing Page Engine",
                   title: "Landing Page Engine: Northwind Coffee", kind: "html", createdAt: "2026-10-21T18:05:00.000Z",
                   inputs: [.init(label: "Brand", value: "Northwind Coffee"), .init(label: "Offer", value: "First bag free")],
                   output: "<html><body style=\"font-family:-apple-system;padding:24px\"><h1>Northwind Coffee</h1><p>Your first bag is free.</p><a href=\"https://example.com\">Claim it</a></body></html>"),
        Generation(id: "gen_preview_3", app: "kolab", tool: nil, appLabel: "Kolab",
                   title: "Lifecycle program: Northwind Coffee", kind: "markdown", createdAt: "2026-10-20T11:00:00.000Z",
                   inputs: [.init(label: "Program", value: "Lifecycle program"), .init(label: "Brand", value: "Northwind Coffee")],
                   output: "# Lifecycle program\n\n- Welcome flow\n- Win-back after 45 days"),
    ]

    static let skills = [
        Skill(id: "skill_preview_1", name: "Morning kickoff", description: "Start the day",
              steps: ["Summarise my urgent tasks and anything overdue", "Give me today's calendar", "Suggest my top 3 priorities"],
              createdAt: "2026-10-20T07:00:00.000Z", updatedAt: "2026-10-20T07:00:00.000Z"),
        Skill(id: "skill_preview_2", name: "Follow-up sweep", description: nil,
              steps: ["Find tasks assigned to others that are overdue", "Draft a short, polite follow-up for each"],
              createdAt: "2026-10-19T07:00:00.000Z", updatedAt: "2026-10-19T07:00:00.000Z"),
    ]

    static func body(method: String, path: String) -> String {
        switch (method, path) {
        case ("GET", "/api/catalog"): return catalog
        case ("GET", "/api/billing/credits"): return credits
        case ("POST", "/api/job-agent/search"): return jobSearch
        case ("GET", "/api/data/saved_jobs"): return #"{"rows":[{"id":"sj_1","job_id":"job-1","state":"saved","job_json":\#(job)}]}"#
        case ("GET", "/api/data/applications"):
            return #"{"rows":[{"id":"app_1","job_id":"job-1","status":"interview","job_json":\#(job)},{"id":"app_2","job_id":"job-2","status":"submitted","job_json":\#(jobTwo)}]}"#
        case ("GET", "/api/connect/google/status"): return #"{"connected":true,"scopes":[],"capabilities":{"gmailRead":true,"gmailSend":false,"calendarRead":true},"available":true,"updatedAt":null}"#
        case ("GET", "/api/connect/github/status"): return #"{"connected":false,"login":null,"configured":true}"#
        case ("GET", "/api/whatsapp/link"): return #"{"configured":true,"jarvisNumber":"15550100","linked":true,"phone":"+•••••••1234","notify":true}"#
        case ("GET", "/api/automations"):
            return #"{"automations":[{"id":"r1","name":"Weekly review","action":"Summarise my week and plan the next one","fireAt":"2026-10-25T04:30:00.000Z","recurrence":"weekly","status":"pending","lastRun":{"channel":"push","status":"sent","at":"2026-10-18T04:30:00.000Z"}},{"id":"r2","name":"Water plants","action":"Remind me to water the plants","fireAt":"2026-10-24T13:00:00.000Z","recurrence":"daily","status":"paused","lastRun":null}]}"#
        case ("GET", "/api/providers"):
            return #"{"providers":[{"provider":"gemini","status":"ok","model":"gemini-2.5-flash","reason":null,"benchedUntil":null,"checkedAt":null},{"provider":"groq","status":"ok","model":"llama-3.3-70b","reason":null,"benchedUntil":null,"checkedAt":null},{"provider":"mistral","status":"rate_limited","model":null,"reason":"Rate limited until 10:40","benchedUntil":null,"checkedAt":null}]}"#
        case ("GET", "/api/user/provider-keys"): return #"{"keys":[{"provider":"groq","hint":"…a1b2"}]}"#
        case ("GET", "/api/status"):
            return #"{"ai":true,"openai":true,"database":true,"google_oauth":true,"serper":false,"cascade":{"gemini":true,"grok":false,"groq":true,"cerebras":false,"openrouter":true,"mistral":true}}"#
        case ("POST", "/api/tools/generate"), ("POST", "/api/kolab/generate"): return #"{"output":"Preview\n\n- A sample result","format":"markdown"}"#
        default: return method == "GET" ? #"{"rows":[]}"# : #"{"ok":true}"#
        }
    }

    private static let job = #"{"id":"job-1","source":"adzuna","title":"Senior Product Manager","company":"Lumen Labs","locationText":"Bengaluru, India","remoteType":"hybrid","employmentType":"full-time","salaryMin":3000000,"salaryMax":4200000,"salaryCurrency":"INR","publishedAt":"2026-10-20T00:00:00.000Z","applyUrl":"https://example.com/apply/1","canonicalUrl":"https://example.com/jobs/1","descriptionText":"Own the roadmap for a growing B2B product. You will work with design and engineering to ship weekly, talk to customers every week and set the metrics the team is held to.","sourceAttribution":"Via Adzuna"}"#
    private static let jobTwo = #"{"id":"job-2","source":"adzuna","title":"Product Manager, Growth","company":"Fernway","locationText":"Remote, India","remoteType":"remote","employmentType":"full-time","applyUrl":"https://example.com/apply/2","canonicalUrl":"https://example.com/jobs/2","descriptionText":"Run growth experiments across onboarding and retention.","sourceAttribution":"Via Adzuna"}"#
    private static let jobThree = #"{"id":"job-3","source":"adzuna","title":"Associate Product Manager","company":"Orbit Pay","locationText":"Mumbai, India","remoteType":"onsite","employmentType":"full-time","salaryOriginalText":"INR 18-24 LPA","applyUrl":"https://example.com/apply/3","canonicalUrl":"https://example.com/jobs/3","descriptionText":"Support the payments roadmap.","sourceAttribution":"Via Adzuna"}"#

    private static let jobSearch = #"{"jobs":[\#(job),\#(jobTwo),\#(jobThree)],"sources":[{"id":"adzuna","displayName":"Adzuna","state":"complete","count":3},{"id":"linkedin","displayName":"LinkedIn","state":"external-search","url":"https://www.linkedin.com/jobs/search/?keywords=product%20manager"}]}"#

    private static let credits = #"{"unlimited":false,"balance":1240,"used":22,"ledger":[{"delta":-6,"reason":"Studio page","balance_after":1240,"created_at":"2026-10-22T09:30:00.000Z"},{"delta":-3,"reason":"Studio text","balance_after":1246,"created_at":"2026-10-22T09:10:00.000Z"},{"delta":500,"reason":"Unlock code","balance_after":1249,"created_at":"2026-10-21T12:00:00.000Z"},{"delta":-1,"reason":"Chat message","balance_after":749,"created_at":"2026-10-21T08:00:00.000Z"}]}"#

    private static let catalog = #"""
    {
      "studios": {
        "personal": {"name": "Personal Studio", "tagline": "Write, plan and create for your own life.", "accent": "#4FC3F7", "icon": "Sparkles"},
        "professional": {"name": "Professional Studio", "tagline": "Pages, mailers and campaigns for your work.", "accent": "#7B5CF0", "icon": "Briefcase"},
        "enterprise": {"name": "Enterprise Studio", "tagline": "Programs and reports for teams.", "accent": "#34D399", "icon": "Building2"}
      },
      "categoryOrder": {"personal": ["Write", "Create"], "professional": ["Web", "Email"], "enterprise": ["Lifecycle"]},
      "studioTools": [
        {"id": "social-media", "label": "Social Media Studio", "mode": "personal", "icon": "Share2", "accent": "#4FC3F7", "blurb": "Draft posts for any platform", "format": "markdown", "downloadExt": "md", "cta": "Generate posts", "category": "Write",
         "fields": [
           {"name": "platform", "label": "Platform", "type": "select", "options": ["Instagram", "LinkedIn", "X", "Facebook"], "required": true},
           {"name": "topic", "label": "Topic", "type": "textarea", "placeholder": "What is the post about?", "required": true},
           {"name": "tone", "label": "Tone", "type": "text", "placeholder": "Warm, witty, direct"}
         ]},
        {"id": "journal", "label": "Journal Prompts", "mode": "personal", "icon": "BookOpen", "accent": "#F59E0B", "blurb": "Prompts for a reflective evening", "format": "markdown", "downloadExt": "md", "cta": "Write prompts", "category": "Write",
         "fields": [{"name": "focus", "label": "Focus", "type": "text", "placeholder": "Work, family, health"}]},
        {"id": "music", "label": "Music Studio", "mode": "personal", "icon": "Music", "accent": "#EF4444", "blurb": "Generate and play your own tracks", "format": "markdown", "downloadExt": "md", "cta": "Make a song", "category": "Create", "fields": []},
        {"id": "landing-page", "label": "Landing Page Engine", "mode": "professional", "icon": "Layout", "accent": "#7B5CF0", "blurb": "A complete landing page from a short brief", "format": "html", "downloadExt": "html", "cta": "Build page", "category": "Web",
         "fields": [
           {"name": "brand", "label": "Brand", "type": "text", "required": true},
           {"name": "offer", "label": "Offer", "type": "textarea", "required": true},
           {"name": "style", "label": "Style", "type": "select", "options": ["Minimal", "Bold", "Playful"]}
         ]},
        {"id": "html-mailer", "label": "HTML Mailer Architect", "mode": "professional", "icon": "Mail", "accent": "#34D399", "blurb": "Responsive email, ready to send", "format": "html", "downloadExt": "html", "cta": "Build mailer", "category": "Email",
         "fields": [{"name": "subject", "label": "Subject", "type": "text", "required": true}]},
        {"id": "lifecycle-os", "label": "Lifecycle OS", "mode": "enterprise", "icon": "Workflow", "accent": "#34D399", "blurb": "A customer lifecycle program", "format": "markdown", "downloadExt": "md", "cta": "Plan lifecycle", "category": "Lifecycle",
         "fields": [{"name": "brand", "label": "Brand", "type": "text", "required": true}]}
      ],
      "apps": [
        {"id": "music-studio", "label": "Music Studio", "category": "Music & Media", "modes": ["personal"], "kind": "internal", "href": "/tools/music", "icon": "Music", "selfBuilt": true, "blurb": "Generate & play your own tracks"},
        {"id": "youtube", "label": "YouTube", "category": "Music & Media", "modes": ["personal"], "kind": "external", "href": "https://www.youtube.com", "icon": "Play"},
        {"id": "spotify", "label": "Spotify", "category": "Music & Media", "modes": ["personal"], "kind": "external", "href": "https://open.spotify.com", "icon": "Music2"},
        {"id": "goals", "label": "Goals", "category": "Planning", "modes": ["personal", "professional"], "kind": "internal", "href": "/goals", "icon": "Target", "selfBuilt": true, "blurb": "Set and track what matters"},
        {"id": "finance", "label": "Finance", "category": "Planning", "modes": ["personal"], "kind": "internal", "href": "/finance", "icon": "Wallet", "selfBuilt": true, "blurb": "Spending and budgets, kept on your account"},
        {"id": "emergency-112", "label": "Emergency 112", "category": "Safety", "modes": ["personal", "professional"], "kind": "external", "href": "tel:112", "icon": "Phone", "blurb": "Call emergency services", "emergency": true},
        {"id": "linkedin", "label": "LinkedIn", "category": "Work", "modes": ["professional"], "kind": "external", "href": "https://www.linkedin.com", "icon": "Linkedin"}
      ],
      "capabilities": [
        {"group": "JARVIS", "name": "Natural conversation", "blurb": "Streaming voice and text dialog with personality", "inspiration": "Iron Man", "required": ["mic"], "status": "live"},
        {"group": "JARVIS", "name": "Daily briefing", "blurb": "Date, tasks, weather and a quote on demand", "inspiration": "Iron Man 2", "required": [], "status": "live", "premium": true},
        {"group": "JARVIS", "name": "Proactive nudges", "blurb": "Reminders that arrive before you ask", "inspiration": "Iron Man 3", "required": ["notif"], "status": "partial"},
        {"group": "JARVIS", "name": "Location-aware tips", "blurb": "Suggestions that know where you are", "inspiration": "Iron Man 3", "required": ["loc"], "status": "planned"},
        {"group": "E.D.I.T.H.", "name": "Visual analysis", "blurb": "Point the camera at something and ask", "inspiration": "Spider-Man: Far From Home", "required": ["cam"], "status": "live"},
        {"group": "E.D.I.T.H.", "name": "Smart home control", "blurb": "Lights, locks and more", "inspiration": "Spider-Man: Far From Home", "required": ["key"], "status": "planned"},
        {"group": "ULTRON", "name": "Autonomous research", "blurb": "Reads many sources and reports back", "inspiration": "Avengers: Age of Ultron", "required": [], "status": "partial"}
      ],
      "systems": [
        {"id": "jarvis", "name": "J.A.R.V.I.S.", "accentColor": "#4FC3F7", "purpose": "Your everyday assistant", "href": "/assistant", "kind": "agent", "lang": "en-GB", "pitch": 0.9, "rate": 1.0, "lines": ["All systems online."]},
        {"id": "friday", "name": "F.R.I.D.A.Y.", "accentColor": "#34D399", "purpose": "Quick answers and reminders", "href": "/tasks", "kind": "agent", "lang": "en-IE", "pitch": 1.1, "rate": 1.05, "lines": ["Ready when you are."]},
        {"id": "edith", "name": "E.D.I.T.H.", "accentColor": "#7B5CF0", "purpose": "Sees and explains what is in front of you", "href": "/capabilities", "kind": "agent", "lang": "en-US", "pitch": 1.0, "rate": 1.0, "lines": ["Vision online."]},
        {"id": "kolab", "name": "Kolab", "accentColor": "#F59E0B", "purpose": "Marketing programs for any brand", "href": "/kolab", "kind": "subsystem", "lang": "en-US", "pitch": 1.0, "rate": 1.0, "lines": ["Kolab is online."]}
      ],
      "audits": [
        {"page": "Dashboard", "href": "/dashboard", "current": 9.5, "target": 9.5, "dims": {"accuracy": 10, "implementation": 10, "execution": 9, "results": 9},
         "verdict": "Data flows through the session-scoped server route and every feature shows as a live widget.",
         "issues": [
           {"severity": "critical", "text": "The browser client was blocked by row-level security once the database was configured.", "fix": "All reads and writes go through a server route scoped to the signed-in person.", "status": "fixed"},
           {"severity": "low", "text": "Empty and loading states could be richer.", "fix": "Per-card skeletons are in place; more polish is optional.", "status": "pending"}
         ]},
        {"page": "Assistant", "href": "/assistant", "current": 8.5, "target": 9.5, "dims": {"accuracy": 9, "implementation": 8, "execution": 9, "results": 8},
         "verdict": "The strongest page: streaming chat, dictation and honest results.",
         "issues": [{"severity": "medium", "text": "Agent actions applied immediately with no undo.", "fix": "Agent-created items now show a short Undo.", "status": "in-progress"}]}
      ],
      "plans": {
        "tiers": [
          {"id": "basic", "label": "Basic", "level": 0, "badge": "BASIC", "color": "#8E8EBC", "monthlyCredits": 200, "priceMonthlyInr": 0, "features": ["Core apps", "200 credits / month", "Standard AI"], "personas": false, "prices": {"daily": 0, "weekly": 0, "monthly": 0, "quarterly": 0, "annual": 0}},
          {"id": "plus", "label": "Plus", "level": 1, "badge": "PLUS", "color": "#34D399", "monthlyCredits": 2500, "priceMonthlyInr": 399, "features": ["Everything in Basic", "2,500 credits / month", "All Studio tools", "1 AI persona"], "personas": true, "prices": {"daily": 19, "weekly": 109, "monthly": 399, "quarterly": 1074, "annual": 3829}},
          {"id": "pro", "label": "Pro", "level": 2, "badge": "PRO", "color": "#4FC3F7", "monthlyCredits": 7000, "priceMonthlyInr": 999, "features": ["Everything in Plus", "7,000 credits / month", "Priority generation", "All AI personas", "Job Agent + Kolab"], "personas": true, "prices": {"daily": 44, "weekly": 279, "monthly": 999, "quarterly": 2699, "annual": 9599}},
          {"id": "max", "label": "Max", "level": 3, "badge": "MAX", "color": "#A78BFA", "monthlyCredits": 25000, "priceMonthlyInr": 1999, "features": ["Everything in Pro", "25,000 credits / month", "Highest limits", "Early features", "Priority support"], "personas": true, "prices": {"daily": 89, "weekly": 554, "monthly": 1999, "quarterly": 5399, "annual": 19189}}
        ],
        "periods": [
          {"id": "daily", "label": "Daily", "days": 1, "factorVsMonthly": 0.045, "note": "pay-as-you-go"},
          {"id": "weekly", "label": "Weekly", "days": 7, "factorVsMonthly": 0.277},
          {"id": "monthly", "label": "Monthly", "days": 30, "factorVsMonthly": 1},
          {"id": "quarterly", "label": "3-monthly", "days": 90, "factorVsMonthly": 2.7, "note": "~10% off"},
          {"id": "annual", "label": "Annual", "days": 365, "factorVsMonthly": 9.6, "note": "~20% off · installments allowed"}
        ],
        "bundles": [
          {"id": "spark", "label": "Spark", "credits": 500, "bonus": 0, "priceInr": 149},
          {"id": "boost", "label": "Boost", "credits": 1200, "bonus": 100, "priceInr": 299},
          {"id": "value", "label": "Value", "credits": 3000, "bonus": 400, "priceInr": 649, "best": true}
        ],
        "costs": {"chat.message": 1, "assistant.action": 2, "studio.text": 3, "studio.html": 6, "music.generate": 20, "video.render": 50, "vision.analyze": 5, "transcribe.minute": 2, "jobagent.kit": 8, "health.plan": 3, "kolab.generate": 6},
        "levels": [
          {"min": 0, "name": "Newcomer", "avatar": "🌱"}, {"min": 15, "name": "Explorer", "avatar": "🧭"}, {"min": 50, "name": "Operator", "avatar": "⚙️"},
          {"min": 150, "name": "Power User", "avatar": "⚡"}, {"min": 400, "name": "Architect", "avatar": "🛰️"}, {"min": 1000, "name": "Legend", "avatar": "👑"}
        ]
      }
    }
    """#
}

final class PreviewProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url ?? API.base
        let body = Data(PreviewMode.body(method: request.httpMethod ?? "GET", path: url.path).utf8)
        if let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"]) {
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        }
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
