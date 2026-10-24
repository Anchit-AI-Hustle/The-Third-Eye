package com.thethirdeye.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.time.LocalDate

// Every screen, drawn against a fake server, at a phone and a tablet size. The
// images land in app/build/screenshots so a cut-off or overlapping layout is
// caught before anyone installs the app.
class FakeBackend : Backend {
    val sent = mutableListOf<Pair<String, String>>()
    var chatBody: JsonElement? = null
    private val today = LocalDate.now().toString()
    private val month = today.take(7)

    private val data = mapOf(
        "/api/auth/session" to """{"user":{"name":"Anchit Tandon","email":"a@x.com"}}""",
        "/api/data/tasks" to """{"rows":[
            {"id":"t1","title":"Review clause 7 of the Northwind agreement","status":"todo","priority":"high","due_date":"$today"},
            {"id":"t2","title":"Send Q3 usage numbers to Priya","status":"todo","priority":"medium"},
            {"id":"t3","title":"Dentist check-up at 10:30","status":"todo","priority":"low","due_date":"2026-10-24"},
            {"id":"t4","title":"Renew passport","status":"done","priority":"urgent"}]}""",
        "/api/data/notes" to """{"rows":[
            {"id":"n1","title":"Launch plan","content":"Beta invites go out Monday. Fix onboarding step 3 first.","pinned":true},
            {"id":"n2","title":"Book list","content":"Atomic Habits, Deep Work, The Psychology of Money"}]}""",
        "/api/data/goals" to """{"rows":[
            {"id":"g1","title":"Read 12 books","category":"Learning","target":"12","current":"5","unit":"books"},
            {"id":"g2","title":"Run 100 km","category":"Health","target":100,"current":64,"unit":"km"}]}""",
        "/api/data/expenses" to """{"rows":[
            {"id":"e1","amount":"1250","category":"Groceries","note":"Weekly shop","spent_on":"$month-02"},
            {"id":"e2","amount":420,"category":"Food","note":"Lunch with team","spent_on":"$month-03"},
            {"id":"e3","amount":2999,"category":"Bills","note":"Broadband","spent_on":"$month-01"}]}""",
        "/api/data/knowledge_docs" to """{"rows":[
            {"id":"k1","title":"Northwind_Services_Agreement.pdf","file_type":"pdf","file_size_bytes":"248000","chunk_count":42,"processing_status":"ready","content":"7. Auto-renewal..."},
            {"id":"k2","title":"Tax notes 2026.docx","file_type":"docx","processing_status":"failed","error":"No text found"}]}""",
        "/api/data/lifelog_days" to """{"rows":[{"id":"$today","date":"$today","summary":"Planned the launch, two calls, a long walk.","events":[{"id":"ev1","ts":1760000000000,"title":"Call with Priya"}]}]}""",
        "/api/data/reminders" to """{"rows":[]}""",
        "/api/connectors" to """{"connectors":[{"id":"c1","name":"Notion","host":"mcp.notion.com","enabled":true,"tool_count":12}]}""",
        "/api/catalog" to Fixtures.catalog,
        "/api/billing/credits" to """{"unlimited":false,"balance":1840,"used":62,"ledger":[
            {"delta":-3,"reason":"studio.text","balance_after":1840,"created_at":"${today}T09:12:00Z"},
            {"delta":-1,"reason":"chat.message","balance_after":1843,"created_at":"${today}T08:40:00Z"},
            {"delta":2500,"reason":"unlock code","balance_after":1844,"created_at":"${today}T08:00:00Z"}]}""",
        "/api/connect/google/status" to """{"connected":true,"scopes":[],"capabilities":{"gmailRead":true,"gmailSend":false,"calendarRead":true},"available":true,"updatedAt":"${today}T08:00:00Z"}""",
        "/api/connect/github/status" to """{"connected":false,"login":null,"configured":true}""",
        "/api/whatsapp/link" to """{"configured":true,"jarvisNumber":"15550001111","linked":true,"phone":"+919876543210","notify":true}""",
        "/api/automations" to """{"automations":[
            {"id":"a1","name":"Morning kickoff","action":"Summarise my urgent tasks and today's calendar","fireAt":"${today}T02:30:00Z","recurrence":"daily","status":"pending","lastRun":{"channel":"whatsapp","status":"sent","at":"${today}T02:30:00Z"}},
            {"id":"a2","name":"Weekly review","action":"List what I finished this week","fireAt":"${today}T11:30:00Z","recurrence":"weekly","status":"paused","lastRun":null}]}""",
        "/api/providers" to """{"providers":[
            {"provider":"gemini","status":"ok","model":"gemini-2.5-flash","reason":null,"benchedUntil":null,"checkedAt":"${today}T08:00:00Z"},
            {"provider":"groq","status":"rate_limited","model":null,"reason":"rate limited until 09:40 UTC","benchedUntil":"${today}T09:40:00Z","checkedAt":null}]}""",
        "/api/user/provider-keys" to """{"keys":[{"provider":"openrouter","hint":"…x9f2"},{"provider":"ollama","hint":"…ngrok.app"}]}""",
        "/api/user/local-model" to """{"connected":true,"host":"my-mac.ngrok.app","localFirst":true,"model":"qwen2.5:14b","assistantModels":{"jarvis":"llama3.1:8b","ultron":"qwen2.5:14b"},"hasToken":true}""",
        "/api/status" to """{"ai":true,"openai":true,"database":true,"google_oauth":true,"serper":false,"cascade":{"gemini":true}}""",
        "/api/data/saved_jobs" to """{"rows":[{"id":"sj_1","job_id":"job_1","job_json":${Fixtures.job},"state":"saved","created_at":"${today}T08:00:00Z"}]}""",
        "/api/data/applications" to """{"rows":[{"id":"app_1","job_id":"job_1","job_json":${Fixtures.job},"status":"interview","created_at":"${today}T08:00:00Z","updated_at":"${today}T09:00:00Z"}]}""",
        "/api/data/job_agent_profiles" to """{"rows":[{"id":"japrofile_a@x.com","profile_json":{"headline":"Senior Growth Marketer","summary":"Eight years running acquisition and lifecycle for D2C brands."}}]}""",
        "/api/data/candidate_facts" to """{"rows":[
            {"id":"f1","factType":"skill","value_json":"Lifecycle marketing","verified":"verified"},
            {"id":"f2","factType":"experience","value_json":{"company":"Northwind","role":"Growth lead"},"verified":"unverified"}]}""",
    )

    private val replies = mapOf(
        "/api/tools/generate" to """{"output":"## Monsoon Evenings\n\n**Verse 1**\n- Rain on the tin roof, *slow* and steady\n- Chai going cold on the sill\n\nSee [the playlist](https://example.com).","format":"markdown","provider":"gemini"}""",
        "/api/kolab/generate" to """{"output":"## Objective\nGrow repeat purchases by **20%** in 90 days.\n\n## Segments\n1. New buyers\n2. Lapsed buyers\n\n| Stage | Channel | KPI |\n|---|---|---|\n| Activation | Email | Open rate |","provider":"gemini"}""",
        "/api/user/local-model" to """{"ok":true,"models":["llama3.1:8b","qwen2.5:14b","mistral:7b"],"ms":123}""",
        "/api/job-agent/search" to """{"jobs":[${Fixtures.job}],"sources":[{"id":"remotive","displayName":"Remotive","state":"complete","count":1},{"id":"linkedin","displayName":"LinkedIn","state":"external-search","url":"https://www.linkedin.com/jobs"}]}""",
        "/api/job-agent/profile/import" to """{"profile":{"headline":"Growth Marketer","summary":"Lifecycle and paid acquisition."},"facts":[{"id":"n1","factType":"skill","value":"Paid acquisition","confidence":0.9,"verified":"unverified","sensitivity":"normal","updatedAt":"${today}T00:00:00Z"}]}""",
    )

    override suspend fun send(method: String, path: String, body: JsonElement?): String {
        sent += method to path
        val key = path.substringBefore("?")
        return if (method == "GET") data[key] ?: """{"rows":[]}""" else replies[key] ?: """{"ok":true}"""
    }

    override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = flow {
        chatBody = body
        fun obj(s: String) = json.parseToJsonElement(s).jsonObject
        emit("tool" to obj("""{"name":"manage_tasks"}"""))
        emit("text" to obj("""{"text":"You have **3 open tasks** today. The most urgent is the Northwind clause review, due today."}"""))
        emit("confirm" to obj("""{"id":"a1","tool":"communicate","args":{"action":"email"},"summary":"Email Priya the Q3 usage numbers"}"""))
        emit("done" to obj("""{"sideEffects":[],"applied":[]}"""))
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
abstract class ScreensTest {
    @get:Rule val rule = createComposeRule()
    private val real = Api.backend
    private val fake = FakeBackend()
    abstract val size: String

    @Before fun fake() { Api.backend = fake }
    @After fun restore() { Api.backend = real }

    private fun shoot(name: String, content: @Composable () -> Unit) {
        rule.setContent { TheThirdEyeTheme(content) }
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screenshots/$size-$name.png")
    }

    private fun session() = Session(RuntimeEnvironment.getApplication())
    private fun signedIn() = session().apply { state = Session.State.SignedIn; name = "Anchit Tandon"; email = "a@x.com" }
    private fun freshLocal() = Local.get(RuntimeEnvironment.getApplication()).also { it.clear() }

    private fun scrollTo(text: String) {
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(text, substring = true, ignoreCase = true))
        rule.waitForIdle()
    }

    private fun capture(name: String) = rule.onRoot().captureRoboImage("build/screenshots/$size-$name.png")

    @Test fun signIn() = shoot("01-sign-in") { SignInScreen(session().apply { state = Session.State.SignedOut }) }

    @Test fun today() = shoot("02-today") { MainTabs(signedIn(), AppState()) }

    @Test fun assistant() {
        val app = AppState().apply { tab = AppState.Tab.Assistant; pendingAsk = "What's due today?" }
        shoot("03-assistant") { MainTabs(signedIn(), app) }
        rule.waitUntil(5000) { rule.onAllNodesWithText("Needs your OK", substring = true, ignoreCase = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onRoot().captureRoboImage("build/screenshots/$size-03-assistant.png")
        // The app asks the server to write what the assistant makes.
        org.junit.Assert.assertEquals("true", fake.chatBody?.jsonObject?.get("native").toString())
    }

    @Test fun tasks() {
        shoot("04-tasks") { MainTabs(signedIn(), AppState().apply { tab = AppState.Tab.Tasks }) }
        rule.onNodeWithText("Send Q3 usage numbers to Priya").assertExists()
    }

    // Robolectric never settles a dialog holding a text field at phone width
    // (AppNotIdle, even with the clock paused); the tablet run draws it.
    @Test fun taskEditor() {
        org.junit.Assume.assumeTrue(size == "tablet")
        shoot("05-task-editor") {
            TaskEditor(TaskItem("t1", "Review clause 7", "Check auto-renewal notice", "todo", "high", "2026-10-24"), onDismiss = {}) { _, _, _, _ -> }
        }
    }

    @Test fun notes() = shoot("06-notes") { MainTabs(signedIn(), AppState().apply { tab = AppState.Tab.Notes }) }
    @Test fun more() = shoot("07-more") { MainTabs(signedIn(), AppState().apply { tab = AppState.Tab.More }) }
    @Test fun goals() = shoot("08-goals") { GoalsScreen(onBack = {}) }
    @Test fun finance() = shoot("09-finance") { FinanceScreen(onBack = {}) }
    @Test fun knowledge() = shoot("10-knowledge") { KnowledgeScreen(AppState(), Nav()) }
    @Test fun lifeLog() = shoot("11-lifelog") { LifeLogScreen(Nav()) }
    @Test fun activity() = shoot("12-activity") { ActivityScreen(onBack = {}) }
    @Test fun connectors() = shoot("13-connectors") { ConnectorsScreen(onBack = {}) }

    @Test fun studio() {
        freshLocal()
        shoot("14-studio") { StudioScreen(AppState(), Nav()) }
    }

    @Test fun studioProfessional() {
        freshLocal().pickMode("professional")
        shoot("15-studio-professional") { StudioScreen(AppState(), Nav()) }
    }

    @Test fun tool() {
        val store = freshLocal()
        shoot("16-tool") { ToolScreen("creative", onBack = {}) }
        rule.onNodeWithText("Your idea *").performTextInput("A song about monsoon evenings")
        rule.onNodeWithText("Create").performClick()
        rule.waitUntil(5000) { rule.onAllNodesWithText("Made with gemini", substring = true).fetchSemanticsNodes().isNotEmpty() }
        scrollTo("Made with")
        capture("16-tool-result")
        org.junit.Assert.assertEquals(listOf("Creative Studio: A song about monsoon evenings"), store.generations.map { it.title })
        org.junit.Assert.assertTrue("POST" to "/api/tools/generate" in fake.sent)
    }

    @Test fun generations() {
        val store = freshLocal()
        listOf(
            Generation("gen_1", "studio", "creative", "Creative Studio", "Creative Studio: Monsoon evenings", "markdown", "${LocalDate.now()}T09:12:00Z", listOf(Generation.Input("Your idea", "Monsoon evenings"), Generation.Input("What to create", "Poem")), "## Monsoon\n\n- Rain on the tin roof\n- Chai going cold"),
            Generation("gen_2", "kolab", null, "Kolab", "Lifecycle program: Northwind", "markdown", "${LocalDate.now()}T08:00:00Z", listOf(Generation.Input("Brand", "Northwind")), "## Objective\nGrow repeat purchases by **20%**."),
        ).reversed().forEach(store::addGeneration)
        shoot("17-generations") { GenerationsScreen(onBack = {}) }
        rule.onNodeWithText("Creative Studio: Monsoon evenings").performClick()
        rule.waitForIdle()
        capture("17-generation-detail")
    }

    @Test fun generationsEmpty() {
        freshLocal()
        shoot("17-generations-empty") { GenerationsScreen(onBack = {}) }
    }

    @Test fun skills() {
        val store = freshLocal()
        store.saveSkill(Skill("s1", "Morning kickoff", "Start the day", listOf("Summarise my urgent tasks and anything overdue", "Give me today's calendar", "Suggest my top 3 priorities"), now(), now()))
        shoot("18-skills") { SkillsScreen(AppState(), onBack = {}) }
        rule.onNodeWithContentDescription("Edit").performClick()
        rule.waitForIdle()
        capture("18-skill-editor")
    }

    @Test fun skillsEmpty() {
        freshLocal()
        shoot("18-skills-empty") { SkillsScreen(AppState(), onBack = {}) }
    }

    @Test fun skillRunHandsTheAssistantTheInstruction() {
        val store = freshLocal()
        val app = AppState()
        store.saveSkill(Skill("s1", "Morning kickoff", "Start the day", listOf("Give me today's calendar"), now(), now()))
        shoot("18-skills-run") { SkillsScreen(app, onBack = {}) }
        rule.onNodeWithText("Run", substring = true).performClick()
        org.junit.Assert.assertEquals(AppState.Tab.Assistant, app.tab)
        org.junit.Assert.assertTrue(app.pendingAsk!!.startsWith("Run my saved automation \"Morning kickoff\"."))
    }

    @Test fun apps() {
        freshLocal()
        shoot("19-apps") { AppsScreen(AppState(), Nav()) }
    }

    @Test fun appsProfessional() {
        freshLocal().pickMode("professional")
        shoot("19-apps-professional") { AppsScreen(AppState(), Nav()) }
    }

    @Test fun plans() {
        freshLocal()
        shoot("20-plans") { PlansScreen(onBack = {}) }
        scrollTo("Credit packs")
        capture("20-plans-packs")
        scrollTo("Unlock code")
        capture("20-plans-unlock")
    }

    @Test fun capabilities() {
        freshLocal()
        shoot("21-capabilities") { CapabilitiesScreen(onBack = {}) }
    }

    @Test fun agents() {
        freshLocal()
        shoot("22-agents") { AgentsScreen(AppState(), Nav()) }
    }

    @Test fun audit() {
        freshLocal()
        shoot("23-audit") { AuditScreen(AppState(), Nav()) }
        rule.onAllNodesWithContentDescription("Expand")[0].performClick()
        rule.waitForIdle()
        capture("23-audit-open")
    }

    @Test fun kolab() {
        val store = freshLocal()
        store.saveBrand(Brand(name = "Northwind", industry = "D2C coffee", product = "Single-origin beans", audience = "Urban professionals", pricePoint = "premium", region = "India", channels = listOf("Email", "Instagram"), stage = "growth", goals = "Grow repeat purchases 20%"))
        shoot("24-kolab") { KolabScreen(Nav()) }
        scrollTo("Generate")
        rule.onNodeWithText("Generate").performClick()
        rule.waitForIdle()
        scrollTo("Result")
        capture("24-kolab-result")
        org.junit.Assert.assertEquals(listOf("Lifecycle program: Northwind"), store.generations.map { it.title })
    }

    @Test fun jobAgent() {
        freshLocal()
        val session = signedIn()
        shoot("25-job-agent") { JobAgentScreen(session, Nav()) }
        rule.onNodeWithText("Job title or keywords *").performTextInput("growth marketer")
        rule.onAllNodesWithText("Search")[1].performClick()
        rule.waitUntil(5000) { rule.onAllNodesWithText("Northwind Labs", substring = true).fetchSemanticsNodes().isNotEmpty() }
        scrollTo("Northwind Labs")
        capture("25-job-agent-results")
        rule.onNodeWithText("Senior Growth Marketer").performClick()
        rule.waitForIdle()
        capture("25-job-detail")
    }

    @Test fun jobAgentTabs() {
        freshLocal()
        val session = signedIn()
        shoot("25-job-agent-tabs") { JobAgentScreen(session, Nav()) }
        rule.onNodeWithText("Applications").performClick()
        rule.waitForIdle()
        capture("25-job-applications")
        rule.onNodeWithText("Profile").performClick()
        rule.waitForIdle()
        capture("25-job-profile")
    }

    @Test fun settings() {
        freshLocal()
        val session = signedIn()
        shoot("26-settings") { SettingsScreen(session, Nav()) }
        scrollTo("AI providers")
        capture("26-settings-providers")
        scrollTo("Sign in with OpenRouter")
        capture("26-settings-openrouter")
        scrollTo("Per assistant")
        capture("26-settings-your-computer")
        rule.onNodeWithText("Test connection").performClick()
        rule.waitForIdle()
        scrollTo("Per assistant")
        capture("26-settings-your-computer-tested")
        scrollTo("Only if your tunnel")
        capture("26-settings-tunnel-password")
        assertTrue(fake.sent.contains("POST" to "/api/user/local-model"))
        scrollTo("About")
        capture("26-settings-about")
    }
}

@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi")
class PhoneScreensTest : ScreensTest() { override val size = "phone" }

@Config(sdk = [35], qualifiers = "w820dp-h1180dp-xhdpi")
class TabletScreensTest : ScreensTest() { override val size = "tablet" }
