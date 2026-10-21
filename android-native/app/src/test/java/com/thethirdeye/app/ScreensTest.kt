package com.thethirdeye.app

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.After
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
    )

    override suspend fun send(method: String, path: String, body: JsonElement?): String {
        sent += method to path
        return if (method == "GET") data[path.substringBefore("?")] ?: """{"rows":[]}""" else """{"ok":true}"""
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
    private fun signedIn() = session().apply { state = Session.State.SignedIn; name = "Anchit Tandon" }

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
}

@Config(sdk = [35], qualifiers = "w390dp-h844dp-xxhdpi")
class PhoneScreensTest : ScreensTest() { override val size = "phone" }

@Config(sdk = [35], qualifiers = "w820dp-h1180dp-xhdpi")
class TabletScreensTest : ScreensTest() { override val size = "tablet" }
