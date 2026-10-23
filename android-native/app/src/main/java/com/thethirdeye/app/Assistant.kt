package com.thethirdeye.app

import android.Manifest
import android.app.Application
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.time.ZoneId

data class Step(val title: String, val status: String)

sealed interface ActionState {
    data object Waiting : ActionState
    data object Running : ActionState
    data class Done(val text: String) : ActionState
    data class Failed(val text: String) : ActionState
    data object Cancelled : ActionState
}

// Something the assistant wants to do that the person did not ask for in so
// many words: shown exactly as it will run, and run only on their OK.
data class PendingAction(
    val id: String,
    val tool: String,
    val args: JsonElement,
    val summary: String,
    val url: String?,
    val openLabel: String?,
    val state: ActionState = ActionState.Waiting,
)

data class ActionLink(val url: String, val label: String, val outreach: Boolean)

data class ChatMessage(
    val id: Long,
    val user: Boolean,
    val text: String = "",
    val tools: List<String> = emptyList(),
    val steps: List<Step> = emptyList(),
    val actions: List<PendingAction> = emptyList(),
    val links: List<ActionLink> = emptyList(),
    val error: String? = null,
) {
    val isEmpty get() = text.isEmpty() && tools.isEmpty() && actions.isEmpty() && links.isEmpty()
}

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

// Streams a reply from /api/chat (server-sent events: text, tool, checklist,
// confirm, done, error), the same endpoint and tool loop the website uses.
class Chat(app: Application) : AndroidViewModel(app) {
    val messages = mutableStateListOf<ChatMessage>()
    // Lives with the chat, on the app's context, so it outlasts a tab switch and never holds the Activity.
    val voice = Voice(app)
    var busy by mutableStateOf(false)
        private set
    private var current: Job? = null
    private var nextId = 0L

    init {
        // The next person to sign in must not see, or send, this one's conversation.
        viewModelScope.launch { Events.signedOut.collect { clear() } }
    }

    override fun onCleared() {
        voice.release()
    }

    private fun open(url: String): Boolean = try {
        getApplication<Application>().startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: ActivityNotFoundException) {
        false
    }

    fun send(text: String, onFinish: ((ChatMessage) -> Unit)? = null) {
        val message = text.trim()
        if (message.isEmpty() || busy) return
        val history = buildJsonArray {
            messages.takeLast(12).filter { it.text.isNotEmpty() }.forEach { m ->
                add(buildJsonObject { put("role", if (m.user) "user" else "assistant"); put("content", m.text) })
            }
        }
        messages.add(ChatMessage(nextId++, user = true, text = message))
        val reply = ChatMessage(nextId++, user = false)
        messages.add(reply)
        busy = true
        current = viewModelScope.launch {
            // native: the server saves the tasks, notes, goals and expenses the
            // assistant creates, which the website otherwise does itself.
            val body = buildJsonObject {
                put("message", message); put("history", history); put("timezone", ZoneId.systemDefault().id); put("native", true)
            }
            try {
                Api.backend.stream("/api/chat", body).collect { (event, data) -> handle(event, data, reply.id) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                update(reply.id) { it.copy(error = e.message ?: "Something went wrong.") }
            } finally {
                update(reply.id) { if (it.error == null && it.isEmpty) it.copy(error = "No reply came back. Try again.") else it }
                busy = false
                messages.firstOrNull { it.id == reply.id }?.let { onFinish?.invoke(it) }
            }
        }
    }

    private fun update(id: Long, change: (ChatMessage) -> ChatMessage) {
        val i = messages.indexOfFirst { it.id == id }
        if (i >= 0) messages[i] = change(messages[i])
    }

    private fun handle(event: String, data: JsonObject, id: Long) {
        when (event) {
            "text" -> update(id) { it.copy(text = it.text + (data.str("text") ?: "")) }
            "tool" -> data.str("name")?.let { name -> update(id) { it.copy(tools = it.tools + name.replace("_", " ")) } }
            "checklist" -> {
                val steps = (data["steps"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }.map { Step(it.str("title") ?: "", it.str("status") ?: "pending") }
                update(id) { it.copy(steps = steps) }
            }
            "confirm" -> {
                val tool = data.str("tool") ?: return
                val clientAction = (data["clientAction"] as? JsonPrimitive)?.booleanOrNull == true
                val action = PendingAction(
                    id = data.str("id") ?: java.util.UUID.randomUUID().toString(),
                    tool = tool,
                    args = data["args"] ?: JsonObject(emptyMap()),
                    summary = data.str("summary") ?: tool,
                    url = if (clientAction) data.str("url") else null,
                    openLabel = data.str("openLabel"),
                )
                update(id) { it.copy(actions = it.actions + action) }
            }
            "done" -> {
                val applied = (data["applied"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
                if (applied.any { (it["ok"] as? JsonPrimitive)?.booleanOrNull == true }) DataStore.changed()
                val tools = messages.firstOrNull { it.id == id }?.tools.orEmpty()
                if (tools.any { "reminder" in it || it == "automate" }) viewModelScope.launch { Reminders.sync(getApplication()) }
                val links = (data["sideEffects"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
                    .filter { it.str("type") == "open_url" }
                    .mapNotNull { fx ->
                        val d = fx["data"] as? JsonObject ?: return@mapNotNull null
                        val raw = d.str("nativeUrl") ?: d.str("url") ?: return@mapNotNull null
                        val outreach = d["action"] != null && (d["missingPhone"] as? JsonPrimitive)?.booleanOrNull != true
                        ActionLink(if (raw.startsWith("/")) Api.url(raw) else raw, d.str("label") ?: "Open", outreach)
                    }
                update(id) { it.copy(links = it.links + links) }
                // Asked for in so many words (message, call, text): open it now, like the website.
                links.firstOrNull { it.outreach }?.let { open(it.url) }
            }
            "error" -> update(id) { it.copy(error = data.str("message") ?: "Something went wrong.") }
        }
    }

    /** The newest action still waiting for the person's OK. Searched back past later replies. */
    val waitingAction: PendingAction?
        get() = messages.asReversed().firstNotNullOfOrNull { m -> m.actions.lastOrNull { it.state == ActionState.Waiting } }

    private fun setState(action: PendingAction, state: ActionState, link: ActionLink? = null) {
        val i = messages.indexOfFirst { m -> m.actions.any { it.id == action.id } }
        if (i < 0) return
        val m = messages[i]
        messages[i] = m.copy(actions = m.actions.map { if (it.id == action.id) it.copy(state = state) else it }, links = m.links + listOfNotNull(link))
    }

    private fun stateOf(action: PendingAction) = messages.flatMap { it.actions }.firstOrNull { it.id == action.id }?.state

    /** Runs an approved action exactly as it was shown, and says what happened. */
    suspend fun approve(action: PendingAction): String {
        // A second tap while it runs must not send it twice.
        if (stateOf(action) != ActionState.Waiting) return ""
        val log = AgentLog.get(getApplication())
        if (log.killed) {
            setState(action, ActionState.Failed("The kill switch is on (More, Agent Activity). Nothing was run."))
            log.record(action.summary, "blocked")
            return "That's blocked: the kill switch is on."
        }
        setState(action, ActionState.Running)
        var fallback: String? = null
        val outcome: ActionState = if (action.url != null) {
            if (open(action.url)) ActionState.Done(action.openLabel ?: "Opened") else ActionState.Failed("Couldn't open that on this phone.")
        } else try {
            val reply = json.parseToJsonElement(Api.backend.send("POST", "/api/act", buildJsonObject { put("tool", action.tool); put("args", action.args) })).jsonObject
            // A failed send can still carry a way to finish by hand (a prefilled Gmail draft).
            fallback = reply.str("openUrl")?.let { if (it.startsWith("/")) Api.url(it) else it }
            if ((reply["ok"] as? JsonPrimitive)?.booleanOrNull == false) ActionState.Failed(reply.str("result") ?: "It didn't go through.")
            else ActionState.Done(reply.str("result") ?: "Done.")
        } catch (e: Exception) {
            ActionState.Failed(e.message ?: "It didn't go through.")
        }
        fallback?.let { open(it) }
        setState(action, outcome, fallback?.let { ActionLink(it, "Open draft", false) })
        return when (outcome) {
            is ActionState.Done -> { log.record(action.summary, "applied", outcome.text); outcome.text }
            is ActionState.Failed -> { log.record(action.summary, "failed", outcome.text); "That didn't work: ${outcome.text}" }
            else -> ""
        }
    }

    fun cancel(action: PendingAction) = setState(action, ActionState.Cancelled)

    fun stop() {
        current?.cancel()
        busy = false
    }

    fun clear() {
        stop()
        messages.clear()
    }
}

@Composable
fun AssistantScreen(app: AppState, chat: Chat = viewModel()) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val voice = chat.voice
    var draft by remember { mutableStateOf("") }
    var callMode by remember { mutableStateOf(false) }
    // Leaving the tab ends a call: nothing keeps listening behind another screen.
    DisposableEffect(Unit) { onDispose { callMode = false; voice.stopListening(); voice.stopSpeaking() } }
    val list = rememberLazyListState()
    var afterPermission by remember { mutableStateOf<(() -> Unit)?>(null) }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) afterPermission?.invoke() else voice.error = "Allow the microphone for The Third Eye to talk to it."
        afterPermission = null
    }

    fun withMic(run: () -> Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) run()
        else { afterPermission = run; askMic.launch(Manifest.permission.RECORD_AUDIO) }
    }

    lateinit var listenForCall: () -> Unit

    fun say(text: String) {
        if (!callMode) return
        voice.speak(text.ifEmpty { "Done." }) { listenForCall() }
    }

    fun replied(message: ChatMessage) {
        if (!callMode) return
        var spoken = message.error ?: message.text
        val action = message.actions.lastOrNull { it.state == ActionState.Waiting }
        if (message.error == null && action != null && "?" !in spoken) spoken += " Shall I go ahead and ${action.summary}? Say yes or no."
        say(spoken)
    }

    // Call mode: listen, send when the person pauses, speak the reply, listen
    // again. An action waiting for an OK is answered by voice: yes runs it, no
    // drops it, anything else is a new request.
    listenForCall = {
        if (callMode && !chat.busy) voice.listen { said ->
            if (!callMode) return@listen
            // Heard nothing: a short pause before listening again, so the recognizer doesn't restart in a tight loop.
            if (said.isEmpty()) return@listen scope.launch { delay(400); listenForCall() }.let {}
            val waiting = chat.waitingAction
            val answer = VoiceAnswer.of(said)
            if (waiting != null && answer != null) {
                if (answer == VoiceAnswer.Yes) scope.launch { say(chat.approve(waiting)) } else { chat.cancel(waiting); say("Okay, I won't.") }
            } else chat.send(said, ::replied)
        }
    }

    // Mic or permission trouble: stop the call rather than loop on it.
    LaunchedEffect(voice.error) { if (voice.error != null) callMode = false }
    LaunchedEffect(app.pendingAsk, chat.busy) {
        val ask = app.pendingAsk
        if (ask != null && !chat.busy) { app.pendingAsk = null; chat.send(ask, ::replied) }
    }
    LaunchedEffect(chat.messages.size, chat.messages.lastOrNull()?.text?.length) {
        if (chat.messages.isNotEmpty()) list.animateScrollToItem(chat.messages.size - 1)
    }

    TitledScreen("Assistant", actions = {
        IconButton(onClick = { chat.clear() }) { Icon(Icons.Outlined.EditNote, contentDescription = "New chat") }
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()).imePadding()) {
            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                state = list,
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                if (chat.messages.isEmpty()) item {
                    Column(Modifier.fillMaxWidth().padding(top = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Image(painterResource(R.drawable.launch_logo), contentDescription = null, modifier = Modifier.widthIn(max = 180.dp))
                        StatusPill("All systems online")
                        Text("Ask anything, or tap the phone to talk hands-free.", fontSize = 15.sp, color = Palette.secondary, textAlign = TextAlign.Center)
                        listOf("Give me my morning briefing", "What's due today?", "Remind me to call Mom at 7pm").forEach { s ->
                            TextButton(
                                onClick = { chat.send(s, ::replied) },
                                modifier = Modifier.background(Palette.surface, CircleShape).border(1.dp, Palette.border, CircleShape),
                            ) { Text(s, fontSize = 14.sp) }
                        }
                    }
                }
                items(chat.messages, key = { it.id }) { m ->
                    MessageBubble(
                        m, busy = chat.busy && m.id == chat.messages.lastOrNull()?.id,
                        approve = { a -> scope.launch { chat.approve(a) } },
                        cancel = { a -> chat.cancel(a) },
                        open = { url -> runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } },
                    )
                }
            }
            Composer(
                draft = draft, onDraft = { draft = it }, busy = chat.busy, callMode = callMode, voice = voice,
                send = { val t = draft; draft = ""; chat.send(t, ::replied) },
                dictate = {
                    if (voice.listening) voice.stopListening()
                    else withMic { voice.listen { said -> if (said.isNotEmpty()) draft = if (draft.isEmpty()) said else "$draft $said" } }
                },
                toggleCall = {
                    if (callMode) { callMode = false; voice.stopListening(); voice.stopSpeaking() }
                    else withMic { callMode = true; listenForCall() }
                },
                stop = { chat.stop() },
            )
        }
    }
}

@Composable
private fun Composer(
    draft: String, onDraft: (String) -> Unit, busy: Boolean, callMode: Boolean, voice: Voice,
    send: () -> Unit, dictate: () -> Unit, toggleCall: () -> Unit, stop: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.92f)).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (callMode || voice.listening || voice.speaking) {
            Text(
                when {
                    voice.speaking -> "Speaking…"
                    voice.listening -> voice.partial.ifEmpty { "Listening…" }
                    else -> "Call mode: speak naturally"
                },
                fontSize = 13.sp, color = if (voice.listening) Palette.blue else Palette.secondary, maxLines = 2,
            )
        }
        ErrorText(voice.error)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                draft, onDraft, Modifier.weight(1f), placeholder = { Text("Message The Third Eye") }, maxLines = 5,
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = Palette.border, focusedBorderColor = Palette.blue),
            )
            CircleAction(Icons.Filled.Mic, active = voice.listening && !callMode, label = if (voice.listening && !callMode) "Stop dictating" else "Dictate", onClick = dictate)
            CircleAction(if (callMode) Icons.Filled.CallEnd else Icons.Filled.Phone, active = callMode, label = if (callMode) "End call" else "Call", onClick = toggleCall)
            if (busy) CircleAction(Icons.Filled.Stop, active = false, label = "Stop", onClick = stop)
            else CircleAction(Icons.AutoMirrored.Filled.ArrowForward, active = draft.isNotBlank(), label = "Send", enabled = draft.isNotBlank(), onClick = send)
        }
    }
}

@Composable
private fun CircleAction(icon: ImageVector, active: Boolean, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    IconButton(
        onClick = onClick, enabled = enabled,
        modifier = Modifier.size(46.dp).background(if (active) Palette.blue else Palette.surface, CircleShape).border(1.dp, Palette.border, CircleShape),
    ) { Icon(icon, contentDescription = label, tint = if (active) Palette.background else Palette.blue) }
}

/** **bold**, *italic*, `code` and [links](https://…): the inline markdown replies and generated text use. */
fun inlineMarkdown(s: String): AnnotatedString = buildAnnotatedString {
    var i = 0
    val pattern = Regex("""\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)]\((https?://[^)\s]+)\)|\*([^*\s][^*]*?)\*""")
    for (m in pattern.findAll(s)) {
        append(s.substring(i, m.range.first))
        val g = m.groupValues
        when {
            g[1].isNotEmpty() -> withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(g[1]) }
            g[2].isNotEmpty() -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(g[2]) }
            g[3].isNotEmpty() -> withLink(LinkAnnotation.Url(g[4], TextLinkStyles(SpanStyle(color = Palette.blue, textDecoration = TextDecoration.Underline)))) { append(g[3]) }
            else -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(g[5]) }
        }
        i = m.range.last + 1
    }
    append(s.substring(i))
}

@Composable
private fun MessageBubble(m: ChatMessage, busy: Boolean, approve: (PendingAction) -> Unit, cancel: (PendingAction) -> Unit, open: (String) -> Unit) {
    Row(Modifier.fillMaxWidth()) {
        if (m.user) Spacer(Modifier.weight(1f).widthIn(min = 40.dp))
        Column(
            Modifier.widthIn(max = 560.dp)
                .background(if (m.user) Palette.elevated else Palette.surface.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
                .border(1.dp, if (m.error == null) Palette.border else Palette.red.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            m.steps.forEach { s ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        when (s.status) { "done" -> Icons.Outlined.CheckCircle; "failed" -> Icons.Outlined.Cancel; "awaiting" -> Icons.Outlined.PanTool; else -> Icons.Outlined.Circle },
                        contentDescription = s.status, tint = if (s.status == "failed") Palette.red else if (s.status == "done") Palette.blue else Palette.secondary,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(s.title, fontSize = 12.sp, color = if (s.status == "failed") Palette.red else if (s.status == "done") Palette.blue else Palette.secondary)
                }
            }
            // One line per tool with a count: twenty GitHub calls read "github ×20".
            m.tools.groupingBy { it }.eachCount().forEach { (t, count) ->
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Bolt, null, tint = Palette.blue, modifier = Modifier.size(14.dp))
                    Text(if (count > 1) "$t ×$count" else t, fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = Palette.blue)
                }
            }
            if (m.text.isNotEmpty()) SelectionContainer { Text(inlineMarkdown(m.text), fontSize = 15.sp) }
            else if (busy && m.error == null) CircularProgressIndicator(Modifier.size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
            m.actions.forEach { ActionCard(it, approve, cancel) }
            m.links.forEach { link ->
                Row(Modifier.clickable { open(link.url) }, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.AutoMirrored.Outlined.OpenInNew, null, tint = Palette.blue, modifier = Modifier.size(16.dp))
                    Text(link.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Palette.blue)
                }
            }
            m.error?.let { e ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.ErrorOutline, null, tint = Palette.red, modifier = Modifier.size(16.dp))
                    Text(e, fontSize = 14.sp, color = Palette.red)
                }
            }
        }
        if (!m.user) Spacer(Modifier.weight(1f).widthIn(min = 24.dp))
    }
}

// Shows the action word for word, and runs it only on Approve.
@Composable
private fun ActionCard(action: PendingAction, approve: (PendingAction) -> Unit, cancel: (PendingAction) -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Palette.background.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .border(1.dp, Palette.violet.copy(alpha = 0.4f), RoundedCornerShape(12.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SectionLabel("Needs your OK", Palette.violet)
        Text(action.summary, fontSize = 14.sp)
        when (val s = action.state) {
            ActionState.Waiting -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { GlowButton(action.openLabel ?: "Approve") { approve(action) } }
                TextButton(onClick = { cancel(action) }) { Text("Cancel", color = Palette.secondary) }
            }
            ActionState.Running -> CircularProgressIndicator(Modifier.size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
            is ActionState.Done -> Text(s.text, fontSize = 13.sp, color = Palette.blue)
            is ActionState.Failed -> Text(s.text, fontSize = 13.sp, color = Palette.red)
            ActionState.Cancelled -> Text("Cancelled. Nothing was sent.", fontSize = 13.sp, color = Palette.muted)
        }
    }
}
