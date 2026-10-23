package com.thethirdeye.app

// Server replies the screens are drawn against: /api/catalog in the shape the website sends, trimmed.
object Fixtures {
    val catalog = """{
      "studios": {
        "personal": {"name":"Hobby Studio","tagline":"Create for the joy of it - music, writing, plans","accent":"#34D399","icon":"Palette"},
        "professional": {"name":"Startup Studio","tagline":"Ship growth assets - pages, mailers, decks, ads","accent":"#4FC3F7","icon":"Rocket"},
        "enterprise": {"name":"Office Studio","tagline":"Run the org - lifecycle, reports, meetings, SOPs","accent":"#A78BFA","icon":"Building2"}
      },
      "categoryOrder": {
        "personal": ["Health & Fitness","Music & Audio","Social & Video","Writing","Life & Plans"],
        "professional": ["Ads & Campaigns","Website & Email","Content","Sales & Fundraising"],
        "enterprise": ["Programs","Docs & Specs","Ops","People & Deals"]
      },
      "studioTools": [
        {"id":"music","label":"Music Studio","mode":"personal","icon":"Music","accent":"#34D399","blurb":"Generate actual music - a playable, downloadable audio track - from a description.","format":"markdown","downloadExt":"mp3","cta":"Generate music","category":"Music & Audio","fields":[]},
        {"id":"health","label":"Health Coach","mode":"personal","icon":"HeartPulse","accent":"#34D399","blurb":"A weekly plan for training, food and sleep.","format":"markdown","downloadExt":"md","cta":"Plan","category":"Health & Fitness","fields":[]},
        {"id":"creative","label":"Creative Studio","mode":"personal","icon":"PenLine","accent":"#F0C94E","blurb":"Text-only creative: song lyrics, a music-gen prompt, poems, or social captions.","format":"markdown","downloadExt":"md","cta":"Create","category":"Writing","fields":[
          {"name":"brief","label":"Your idea","type":"textarea","placeholder":"Theme, mood, story, occasion…","required":true},
          {"name":"format","label":"What to create","type":"select","options":["Song lyrics","Music-gen prompt (Suno/Udio)","Poem","Social caption set"]},
          {"name":"vibe","label":"Genre / vibe","type":"text","placeholder":"e.g. lo-fi acoustic, upbeat pop"}]},
        {"id":"travel","label":"Trip Planner","mode":"personal","icon":"Plane","accent":"#34D399","blurb":"A day-by-day travel itinerary tuned to your dates, budget, and interests.","format":"markdown","downloadExt":"md","cta":"Plan trip","category":"Life & Plans","fields":[
          {"name":"destination","label":"Destination","type":"text","required":true},
          {"name":"days","label":"Days","type":"text"}]},
        {"id":"landing","label":"Landing Page Engine","mode":"professional","icon":"LayoutTemplate","accent":"#4FC3F7","blurb":"A complete, responsive landing page as one HTML file.","format":"html","downloadExt":"html","cta":"Build page","category":"Website & Email","fields":[
          {"name":"product","label":"Product","type":"text","required":true}]},
        {"id":"lifecycle","label":"Lifecycle OS","mode":"enterprise","icon":"Workflow","accent":"#A78BFA","blurb":"A full customer-lifecycle program with segments, triggers and KPIs.","format":"markdown","downloadExt":"md","cta":"Build program","category":"Programs","fields":[
          {"name":"brand","label":"Brand","type":"text","required":true}]},
        {"id":"extra","label":"Extra tool","mode":"personal","icon":"Wand","accent":"#34D399","blurb":"A tool in a category the website has not ordered.","format":"markdown","downloadExt":"md","cta":"Go","category":"More","fields":[]}
      ],
      "apps": [
        {"id":"music-studio","label":"Music Studio","category":"Music & Media","modes":["personal"],"kind":"internal","href":"/tools/music","icon":"Music","selfBuilt":true,"blurb":"Generate & play your own tracks"},
        {"id":"spotify","label":"Spotify","category":"Music & Media","modes":["personal"],"kind":"external","href":"https://open.spotify.com","icon":"Music2"},
        {"id":"whatsapp","label":"WhatsApp","category":"Social","modes":["personal","professional"],"kind":"external","href":"https://web.whatsapp.com","icon":"MessageCircle"},
        {"id":"goals","label":"Goals","category":"Productivity","modes":["personal","professional","enterprise"],"kind":"internal","href":"/goals","icon":"Target","selfBuilt":true,"blurb":"Targets and progress"},
        {"id":"sos-112","label":"Emergency 112","category":"Health & Emergency","modes":["personal"],"kind":"external","href":"tel:112","icon":"Siren","emergency":true,"blurb":"All-in-one emergency"},
        {"id":"ambulance","label":"Ambulance 102","category":"Health & Emergency","modes":["personal"],"kind":"external","href":"tel:102","icon":"Ambulance","emergency":true},
        {"id":"slack","label":"Slack","category":"Work","modes":["professional","enterprise"],"kind":"external","href":"https://slack.com","icon":"Hash"}
      ],
      "capabilities": [
        {"group":"JARVIS","name":"Natural conversation","blurb":"Streaming voice + text dialog with personality","inspiration":"Iron Man","required":["mic"],"status":"live"},
        {"group":"JARVIS","name":"Daily briefing","blurb":"Date, tasks, weather, motivational quote on demand","inspiration":"Iron Man 2","required":[],"status":"live","premium":true},
        {"group":"JARVIS","name":"Calendar integration","blurb":"Read & write events on Google Calendar","inspiration":"Iron Man 2","required":["key"],"envKey":"GOOGLE_CALENDAR_OAUTH","status":"live","premium":true,"logo":"gcal"},
        {"group":"JARVIS","name":"Local weather","blurb":"Current weather + 12h forecast at your location","inspiration":"Iron Man","required":["loc","key"],"envKey":"OPENWEATHER_API_KEY","status":"live"},
        {"group":"JARVIS","name":"Document Q&A","blurb":"Upload text docs; chat searches them","inspiration":"Iron Man","required":[],"status":"partial"},
        {"group":"E.D.I.T.H.","name":"Vision analysis","blurb":"Share your screen or webcam and the AI describes it and extracts text","inspiration":"Far From Home","required":["cam"],"status":"live"},
        {"group":"E.D.I.T.H.","name":"Predictive routine","blurb":"You usually do X at this time suggestions","inspiration":"Iron Man 3","required":["notif"],"status":"planned"},
        {"group":"ULTRON","name":"Autonomous goals","blurb":"Pursues a goal across days, asking before it acts","inspiration":"Age of Ultron","required":[],"status":"planned","premium":true}
      ],
      "systems": [
        {"id":"jarvis","name":"J.A.R.V.I.S.","accentColor":"#4FC3F7","purpose":"Primary assistant - plans, answers & executes actions.","href":"/assistant","kind":"agent","lang":"en-GB","pitch":0.92,"rate":1.0,"lines":["Jarvis online. All core functions nominal, sir."]},
        {"id":"friday","name":"F.R.I.D.A.Y.","accentColor":"#34D399","purpose":"Fast, friendly second voice for quick questions.","href":"/assistant","kind":"agent","lang":"en-IE","pitch":1.1,"rate":1.05,"lines":["Friday online. Standing by, boss."]},
        {"id":"edith","name":"E.D.I.T.H.","accentColor":"#A78BFA","purpose":"Vision and situational awareness.","href":"/capabilities","kind":"agent","lang":"en-US","pitch":1.0,"rate":1.0,"lines":["Edith online."]},
        {"id":"vault","name":"Vault","accentColor":"#F59E0B","purpose":"Encrypted storage for documents and secrets.","href":"/knowledge","kind":"subsystem","lang":"en-US","pitch":0.9,"rate":0.95,"lines":["Vault sealed."]}
      ],
      "audits": [
        {"page":"Dashboard","href":"/dashboard","current":9.5,"target":9.5,"dims":{"accuracy":10,"implementation":10,"execution":9,"results":9},"verdict":"Data flows through the session-scoped server route and the Command Center surfaces every feature as a live widget. Solid.","issues":[
          {"severity":"critical","text":"Browser Supabase client used the anon key with no NextAuth bridge, so RLS blocked reads and writes.","fix":"All reads and writes go through a server route that authenticates the session.","status":"fixed"},
          {"severity":"medium","text":"A missing service-role key silently dropped the app into local-only mode.","fix":"Added a Cloud synced / Local only badge.","status":"pending"}]},
        {"page":"Assistant","href":"/assistant","current":8.5,"target":9.5,"dims":{"accuracy":9,"implementation":8,"execution":8.5,"results":8.5},"verdict":"Tool loop is solid; long replies could stream faster.","issues":[
          {"severity":"high","text":"Replies were not saved across devices.","fix":"Chat history now syncs.","status":"in-progress"}]}
      ],
      "plans": {
        "tiers": [
          {"id":"basic","label":"Basic","level":0,"badge":"BASIC","color":"#8E8EBC","monthlyCredits":200,"priceMonthlyInr":0,"features":["Core apps","200 credits / month","Standard AI"],"personas":false,"prices":{"daily":0,"weekly":0,"monthly":0,"quarterly":0,"annual":0}},
          {"id":"plus","label":"Plus","level":1,"badge":"PLUS","color":"#34D399","monthlyCredits":2500,"priceMonthlyInr":399,"features":["Everything in Basic","2,500 credits / month","All Studio tools","1 AI persona"],"personas":true,"prices":{"daily":19,"weekly":109,"monthly":399,"quarterly":1079,"annual":3829}},
          {"id":"pro","label":"Pro","level":2,"badge":"PRO","color":"#4FC3F7","monthlyCredits":7000,"priceMonthlyInr":999,"features":["Everything in Plus","7,000 credits / month","Priority generation","All AI personas","Job Agent + Kolab"],"personas":true,"prices":{"daily":44,"weekly":274,"monthly":999,"quarterly":2699,"annual":9589}}
        ],
        "periods": [
          {"id":"daily","label":"Daily","days":1,"factorVsMonthly":0.0454,"note":"pay-as-you-go"},
          {"id":"weekly","label":"Weekly","days":7,"factorVsMonthly":0.277},
          {"id":"monthly","label":"Monthly","days":30,"factorVsMonthly":1},
          {"id":"quarterly","label":"3-monthly","days":90,"factorVsMonthly":2.7,"note":"~10% off"},
          {"id":"annual","label":"Annual","days":365,"factorVsMonthly":9.6,"note":"~20% off · installments allowed"}
        ],
        "bundles": [
          {"id":"spark","label":"Spark","credits":500,"bonus":0,"priceInr":149},
          {"id":"value","label":"Value","credits":3000,"bonus":400,"priceInr":649,"best":true},
          {"id":"mega","label":"Mega","credits":20000,"bonus":5000,"priceInr":3499}
        ],
        "costs": {"chat.message":1,"assistant.action":2,"studio.text":3,"studio.html":6,"music.generate":20,"video.render":50,"vision.analyze":5,"transcribe.minute":2,"jobagent.kit":8,"health.plan":3,"kolab.generate":6},
        "levels": [
          {"min":0,"name":"Newcomer","avatar":"🌱"},{"min":15,"name":"Explorer","avatar":"🧭"},{"min":50,"name":"Operator","avatar":"⚙️"},
          {"min":150,"name":"Power User","avatar":"⚡"},{"min":400,"name":"Architect","avatar":"🛰️"},{"min":1000,"name":"Legend","avatar":"👑"}
        ]
      }
    }"""

    val job = """{"id":"job_1","source":"remotive","title":"Senior Growth Marketer","company":"Northwind Labs","locationText":"Bengaluru, India","remoteType":"hybrid","employmentType":"full-time","salaryMin":2400000,"salaryMax":3200000,"salaryCurrency":"INR","publishedAt":"2026-10-20T08:00:00Z","applyUrl":"https://example.com/apply/1","canonicalUrl":"https://example.com/jobs/1","descriptionText":"Own acquisition and lifecycle across paid, email and partnerships. You will run experiments weekly and report on CAC and retention.","sourceAttribution":"via Remotive","sourceUrl":"https://remotive.com","fetchedAt":"2026-10-22T08:00:00Z","contentHash":"abc"}"""
}
