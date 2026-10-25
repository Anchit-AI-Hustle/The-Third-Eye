package com.thethirdeye.app

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class LogicTest {
    @Test fun `only a plain yes approves, and a no at the start cancels`() {
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("yes"))
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("Yes please, go ahead"))
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("haan ji"))
        assertEquals(VoiceAnswer.No, VoiceAnswer.of("no"))
        assertEquals(VoiceAnswer.No, VoiceAnswer.of("Don't"))
        assertNull(VoiceAnswer.of("yes but don't send it"))
        assertNull(VoiceAnswer.of("wait"))
        assertNull(VoiceAnswer.of("what's the weather"))
        assertNull(VoiceAnswer.of(""))
    }

    private fun v(name: String, tag: String, local: Boolean = true, quality: Int = 300) = Voice.VoiceInfo(name, tag, local, quality)

    @Test fun `JARVIS speaks in a British male voice, not the phone's default`() {
        val voices = listOf(
            v("en-in-x-ene-local", "en-IN"),
            v("en-gb-x-gba-local", "en-GB", quality = 400),
            v("en-gb-x-rjs-network", "en-GB", local = false, quality = 500),
            v("en-gb-x-rjs-local", "en-GB"),
        )
        assertEquals("en-gb-x-rjs-local", Voice.pickVoice(voices, Voice.JARVIS))
    }

    @Test fun `an agent without a known gendered voice still gets its accent`() {
        val voices = listOf(v("en-US-language", "en-US"), v("en-gb-x-gba-local", "en_GB"))
        assertEquals("en-gb-x-gba-local", Voice.pickVoice(voices, Voice.JARVIS))
        assertEquals("en-gb-x-gba-local", Voice.pickVoice(voices, Voice.Accent("en-GB", 1f, 1f, "female")))
        assertNull(Voice.pickVoice(voices, Voice.Accent("en-AU", 1f, 1f)))
    }

    @Test fun `replies are spoken without markdown or links`() {
        assertEquals("Done. See the docs", Voice.speakable("**Done.** See [the docs](https://x.com) https://y.com"))
    }

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun row(at: String, recurrence: String? = null) = ReminderRow(id = "r", title = "t", fire_at = at, recurrence = recurrence)

    @Test fun `a one-off reminder fires once, only if still ahead`() {
        val now = Instant.parse("2026-10-20T10:00:00Z")
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), Reminders.nextFire(row("2026-10-20T12:00:00.000Z"), now, ist))
        assertNull(Reminders.nextFire(row("2026-10-20T09:00:00Z"), now, ist))
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), Reminders.nextFire(row("2026-10-20 12:00:00+00:00"), now, ist))
        assertNull(Reminders.nextFire(row("not a date"), now, ist))
    }

    @Test fun `repeating reminders keep their time of day, weekday and day of month`() {
        val now = Instant.parse("2026-10-20T10:00:00Z")
        // 08:00 IST daily, first set months ago: next is tomorrow 08:00 IST.
        assertEquals(Instant.parse("2026-10-21T02:30:00Z"), Reminders.nextFire(row("2026-06-01T02:30:00Z", "daily"), now, ist))
        // Weekly from a Monday: next Monday.
        assertEquals(Instant.parse("2026-10-26T02:30:00Z"), Reminders.nextFire(row("2026-10-05T02:30:00Z", "weekly"), now, ist))
        // Monthly on the 31st: October 31st, not a date that drifted to the 28th.
        assertEquals(Instant.parse("2026-10-31T02:30:00Z"), Reminders.nextFire(row("2026-01-31T02:30:00Z", "monthly"), now, ist))
    }

    @Test fun `numbers decode whether the database sends them as numbers or strings`() {
        val j = Json { ignoreUnknownKeys = true }
        assertEquals(12.5, j.decodeFromString(Goal.serializer(), """{"id":"g","title":"Read","target":"12.5","current":3}""").target, 0.0)
        assertEquals(0.25f, j.decodeFromString(Goal.serializer(), """{"id":"g","title":"Read","target":12,"current":"3"}""").progress, 0.001f)
        assertEquals(0.0, j.decodeFromString(Expense.serializer(), """{"id":"e","amount":"oops"}""").amount, 0.0)
    }

    @Test fun `bold and code render, the rest stays as written`() {
        val text = inlineMarkdown("Your **3 tasks** are in `Tasks`.")
        assertEquals("Your 3 tasks are in Tasks.", text.text)
        assertEquals(2, text.spanStyles.size)
    }

    @Test fun `greeting uses the first name and the hour`() {
        assertEquals("Good morning, Anchit", greeting("Anchit Tandon", 8))
        assertEquals("Good evening", greeting(null, 20))
        assertEquals("Good afternoon", greeting("  ", 13))
    }

    private val skill = Skill("s", "Morning kickoff", "Start the day", listOf("Summarise my urgent tasks", "  ", " Give me today's calendar "), "t", "t")

    @Test fun `a skill runs as the website composes it`() {
        assertEquals(
            "Run my saved automation \"Morning kickoff\".\n" +
                "Goal: Start the day\n" +
                "Do these steps in order, using your tools. Pause for my approval on anything sensitive (payments, emails, messages). If a step can't be done, say so and continue with the rest.\n" +
                "1. Summarise my urgent tasks\n" +
                "2. Give me today's calendar",
            composeSkillRun(skill),
        )
        assertEquals(false, composeSkillRun(skill.copy(description = null)).contains("Goal:"))
    }

    private fun generation(n: Int, app: String = "studio", title: String = "Made $n", output: String = "text $n") =
        Generation("gen_$n", app, null, app, title, "markdown", "2026-10-23T00:00:00Z", emptyList(), output)

    @Test fun `generations keep the newest 500, newest first, and replace the same id`() {
        var list = emptyList<Generation>()
        for (n in 1..MAX_GENERATIONS + 20) list = withGeneration(list, generation(n))
        assertEquals(MAX_GENERATIONS, list.size)
        assertEquals("gen_${MAX_GENERATIONS + 20}", list.first().id)
        assertEquals("gen_21", list.last().id)
        val again = withGeneration(list, generation(300, title = "Renamed"))
        assertEquals(MAX_GENERATIONS, again.size)
        assertEquals(listOf("Renamed"), again.filter { it.id == "gen_300" }.map { it.title })
        assertEquals("gen_300", again.first().id)
    }

    @Test fun `generations search the title and the output and filter by app`() {
        val list = listOf(generation(1, "studio", "Trip to Goa", "beaches"), generation(2, "kolab", "Plan", "Goa launch"), generation(3, "studio", "Poem", "rain"))
        assertEquals(listOf("gen_1", "gen_2"), searchGenerations(list, "goa", null).map { it.id })
        assertEquals(listOf("gen_1"), searchGenerations(list, " GOA ", "studio").map { it.id })
        assertEquals(3, searchGenerations(list, "", null).size)
        assertEquals(listOf("gen_2"), searchGenerations(list, "", "kolab").map { it.id })
    }

    @Test fun `skills are capped at 200 and an edit keeps its place`() {
        var list = emptyList<Skill>()
        for (n in 1..MAX_SKILLS + 5) list = withSkill(list, skill.copy(id = "s$n"))
        assertEquals(MAX_SKILLS, list.size)
        assertEquals("s${MAX_SKILLS + 5}", list.first().id)
        val edited = withSkill(list, skill.copy(id = "s10", name = "Renamed"))
        assertEquals(list.map { it.id }, edited.map { it.id })
        assertEquals("Renamed", edited.first { it.id == "s10" }.name)
    }

    private val tools = setOf("creative", "travel", "music")

    @Test fun `an href goes to a native screen, a tab, the website, the browser or the dialer`() {
        assertEquals("Goals", (routeOf("/goals", tools) as Route.Screen).item.title)
        assertEquals("Settings", (routeOf("/settings?tab=ai", tools) as Route.Screen).item.title)
        assertEquals("Job Agent", (routeOf("/job-agent/", tools) as Route.Screen).item.title)
        assertEquals(Route.Tool("creative"), routeOf("/tools/creative", tools))
        assertEquals(Route.Web("/tools/music"), routeOf("/tools/music", tools))
        assertEquals(Route.Web("/tools/unknown"), routeOf("/tools/unknown", tools))
        assertEquals("Studio", (routeOf("/tools", tools) as Route.Screen).item.title)
        assertEquals(Route.Web("/job-agent/search"), routeOf("/job-agent/search", tools))
        assertEquals(Route.Web("/kolab/studio"), routeOf("/kolab/studio", tools))
        assertEquals(Route.Tab(AppState.Tab.Assistant), routeOf("/assistant", tools))
        assertEquals(Route.Tab(AppState.Tab.Tasks), routeOf("/tasks", tools))
        assertEquals(Route.Tab(AppState.Tab.Notes), routeOf("/notes", tools))
        assertEquals(Route.Tab(AppState.Tab.Today), routeOf("/today", tools))
        assertEquals(Route.Tab(AppState.Tab.Today), routeOf("/dashboard", tools))
        assertEquals(Route.Browser("https://open.spotify.com"), routeOf("https://open.spotify.com", tools))
        assertEquals(Route.Dial("tel:112"), routeOf("tel:112", tools))
        assertEquals(Route.Web("/privacy"), routeOf("/privacy", tools))
        assertEquals(Route.Web("/terms_of_service"), routeOf("/terms_of_service", tools))
    }

    @Test fun `the wallet level comes from creations made`() {
        val levels = listOf(0, 15, 50, 150).zip(listOf("Newcomer", "Explorer", "Operator", "Power User")).map { (min, name) -> CatalogData.Plans.Level(min.toDouble(), name, "") }
        val start = levelFor(levels, 0.0)!!
        assertEquals("Newcomer", start.level.name)
        assertEquals("Explorer", start.next?.name)
        assertEquals(15, start.remaining)
        val mid = levelFor(levels, 62.0)!!
        assertEquals("Operator", mid.level.name)
        assertEquals(88, mid.remaining)
        assertEquals(15, levelFor(levels, 15.0)!!.level.min.toInt())
        val top = levelFor(levels, 9999.0)!!
        assertEquals("Power User", top.level.name)
        assertNull(top.next)
        assertNull(top.remaining)
        assertNull(levelFor(emptyList(), 3.0))
    }

    @Test fun `the catalog parses with its optional fields missing`() {
        val catalog = Catalog.parse(
            """{"studioTools":[{"id":"t","label":"T","fields":[{"name":"a","label":"A"}]}],
                "apps":[{"id":"a","label":"A","href":"/x","modes":["personal"]}],
                "capabilities":[{"group":"G","name":"N"}],
                "systems":[{"id":"s","name":"S"}],
                "audits":[{"page":"P","issues":[{"text":"x"}]}],
                "plans":{"tiers":[{"id":"basic","label":"Basic"}],"costs":{"chat.message":1},"extra":true},
                "somethingNew":1}""",
        )
        val tool = catalog.studioTools.single()
        assertEquals("markdown", tool.format)
        assertEquals("More", tool.category)
        assertEquals(false, tool.fields.single().required)
        assertEquals("text", tool.fields.single().type)
        assertEquals(emptyList<String>(), tool.fields.single().options)
        assertEquals(false, catalog.apps.single().selfBuilt)
        assertNull(catalog.apps.single().blurb)
        assertEquals("planned", catalog.capabilities.single().status)
        assertEquals("agent", catalog.systems.single().kind)
        assertEquals("pending", catalog.audits.single().issues.single().status)
        assertEquals(0.0, catalog.plans.tiers.single().priceMonthlyInr, 0.0)
        assertEquals(1.0, catalog.plans.costs.getValue("chat.message"), 0.0)
        assertEquals(emptyList<String>(), catalog.categoryOrder["personal"].orEmpty())
        assertEquals(0, Catalog.parse("{}").apps.size)
    }

    @Test fun `studio tools group in the website's order with unknown categories last`() {
        fun tool(id: String, category: String) = CatalogData.StudioTool(id = id, label = id, category = category)
        val grouped = groupTools(listOf(tool("a", "Writing"), tool("b", "Made Up"), tool("c", "Health & Fitness"), tool("d", "Writing")), listOf("Health & Fitness", "Writing"))
        assertEquals(listOf("Health & Fitness", "Writing", "Made Up"), grouped.map { it.first })
        assertEquals(listOf("a", "d"), grouped[1].second.map { it.id })
    }

    @Test fun `apps filter by mode and search, grouped in the order first seen`() {
        fun app(id: String, category: String, vararg modes: String, blurb: String? = null) =
            CatalogData.AppEntry(id = id, label = id.uppercase(), category = category, modes = modes.toList(), href = "/$id", blurb = blurb)
        val apps = listOf(app("a", "Music", "personal"), app("b", "Work", "professional"), app("c", "Music", "personal", "professional"), app("d", "Health", "personal", blurb = "find a doctor"))
        assertEquals(listOf("Music", "Health"), appsFor(apps, "personal", "").map { it.first })
        assertEquals(listOf("a", "c"), appsFor(apps, "personal", "").first().second.map { it.id })
        assertEquals(listOf("Work", "Music"), appsFor(apps, "professional", "").map { it.first })
        assertEquals(listOf("d"), appsFor(apps, "personal", "DOCTOR").flatMap { it.second }.map { it.id })
        assertEquals(emptyList<Pair<String, List<CatalogData.AppEntry>>>(), appsFor(apps, "enterprise", ""))
    }

    @Test fun `audit totals average the scores and count issues not yet fixed`() {
        fun audit(current: Double, target: Double, vararg status: String) =
            CatalogData.Audit(page = "p", current = current, target = target, issues = status.map { CatalogData.Audit.Issue(status = it) })
        val totals = auditTotals(listOf(audit(9.0, 9.5, "fixed", "pending"), audit(8.0, 9.5, "in-progress")))
        assertEquals(8.5, totals.current, 0.0)
        assertEquals(9.5, totals.target, 0.0)
        assertEquals(2, totals.pages)
        assertEquals(2, totals.openIssues)
        assertEquals(0, auditTotals(emptyList()).pages)
    }

    @Test fun `costs list in the friendly order with unknown actions last`() {
        val rows = costRows(mapOf("video.render" to 50.0, "chat.message" to 1.0, "new.thing" to 9.0))
        assertEquals(listOf("Chat message" to 1.0, "Video" to 50.0, "new.thing" to 9.0), rows)
    }

    @Test fun `markdown becomes headings, lists, quotes, tables and code`() {
        val blocks = markdownBlocks("# Title\n\nA line\nwrapped.\n\n- one\n  - nested\n1. first\n> quoted\n---\n| A | B |\n|---|---|\n| 1 | 2 |\n```\ncode here\n```")
        assertEquals(
            listOf(
                MdBlock.Heading(1, "Title"),
                MdBlock.Para("A line wrapped."),
                MdBlock.Item("•", "one", 0),
                MdBlock.Item("•", "nested", 1),
                MdBlock.Item("1.", "first", 0),
                MdBlock.Quote("quoted"),
                MdBlock.Rule,
                MdBlock.Table(listOf(listOf("A", "B"), listOf("1", "2"))),
                MdBlock.Code("code here"),
            ),
            blocks,
        )
    }

    @Test fun `italic and links render inline`() {
        val text = inlineMarkdown("An *italic* word and [a link](https://example.com/x) and **bold**.")
        assertEquals("An italic word and a link and bold.", text.text)
        assertEquals(2, text.spanStyles.size)
        assertEquals(1, text.getLinkAnnotations(0, text.length).size)
    }

    @Test fun `a brand is sent with only what was filled in`() {
        val payload = brandPayload(Brand(name = " Northwind ", industry = "", pricePoint = "premium", channels = listOf("Email", "SMS"), goals = "Grow"))
        assertEquals(setOf("name", "pricePoint", "channels", "goals"), payload.keys)
        assertEquals("Northwind", (payload["name"] as kotlinx.serialization.json.JsonPrimitive).content)
        assertEquals(2, (payload["channels"] as kotlinx.serialization.json.JsonArray).size)
        assertEquals(listOf("Email", "SMS", "Push"), parseChannels(" Email, SMS ,, Push, "))
    }

    @Test fun `an imported profile fills in what the resume had and keeps the rest`() {
        fun obj(s: String) = Json.parseToJsonElement(s) as kotlinx.serialization.json.JsonObject
        val merged = mergeProfile(obj("""{"headline":"Old","city":"Pune"}"""), obj("""{"headline":"New","summary":"","city":null,"skills":[],"email":"a@x.com"}"""))
        assertEquals(obj("""{"headline":"New","city":"Pune","email":"a@x.com"}"""), merged)
        assertEquals(obj("""{"a":"b"}"""), mergeProfile(null, obj("""{"a":"b"}""")))
    }

    @Test fun `imported facts are posted with the table's columns`() {
        val fact = Json.parseToJsonElement("""{"id":"n1","factType":"skill","value":"SEO","confidence":0.9,"verified":"unverified","sensitivity":"normal","updatedAt":"x"}""") as kotlinx.serialization.json.JsonObject
        val row = factRow(fact, "japrofile_a@x.com", "2026-10-23T00:00:00Z")
        assertEquals(
            Json.parseToJsonElement("""{"id":"n1","profile_id":"japrofile_a@x.com","fact_type":"skill","value_json":"SEO","confidence":0.9,"verified":"unverified","sensitivity":"normal","updated_at":"2026-10-23T00:00:00Z"}"""),
            row,
        )
    }

    @Test fun `per-assistant models are sent as the whole map`() {
        val current = mapOf("jarvis" to "llama3.1:8b")
        assertEquals(mapOf("jarvis" to "llama3.1:8b", "edith" to "qwen2.5:14b"), withAssistantModel(current, "edith", " qwen2.5:14b "))
        assertEquals(mapOf("jarvis" to "mistral:7b"), withAssistantModel(current, "jarvis", "mistral:7b"))
        assertEquals(emptyMap<String, String>(), withAssistantModel(current, "jarvis", SAME_AS_ABOVE))
        assertEquals(current, withAssistantModel(current, "friday", ""))
        assertEquals("Connected — 1 model, 80 ms", LocalTest(true, listOf("a"), 80).summary)
        assertEquals("No answer.", LocalTest().summary)
    }

    @Test fun `phone numbers are masked and salaries read as the board wrote them`() {
        assertEquals("+91••••••3210", maskPhone("+919876543210"))
        assertEquals("12345", maskPhone("12345"))
        val job = Job(salaryMin = 2400000.0, salaryMax = 3200000.0, salaryCurrency = "INR")
        assertEquals("2400000–3200000 INR", salaryText(job))
        assertEquals("₹24L–32L", salaryText(job.copy(salaryOriginalText = "₹24L–32L")))
        assertEquals("From 90 USD", salaryText(Job(salaryMin = 90.0, salaryCurrency = "USD")))
        assertNull(salaryText(Job()))
        assertEquals("Northwind · Pune · remote", jobSubtitle(Job(company = "Northwind", locationText = "Pune", remoteType = "remote")))
    }

    @Test fun `the server's own words reach the person, with credits and the Job Agent switch explained`() {
        assertEquals("Not enough credits (needs 6, you have 2). See Plans & Credits.", ApiError(402, """{"error":"x","code":"insufficient_credits","cost":6,"balance":2}""").message)
        assertEquals("Missing: brief", ApiError(400, """{"error":"Missing: brief"}""").message)
        assertEquals("The server said 503. Try again.", ApiError(503, "<html>").message)
        assertEquals("You're signed out. Sign in again.", ApiError(401, """{"error":"Not authenticated"}""").message)
        assertEquals(true, ApiError(403, """{"error":"Job Agent is disabled","disabled":true}""").disabled)
        assertEquals(false, ApiError(403, """{"error":"nope"}""").disabled)
        assertEquals(listOf("goals", "notes"), ApiError(500, """{"error":"x","failed":["goals","notes"]}""").failed)
    }
}
