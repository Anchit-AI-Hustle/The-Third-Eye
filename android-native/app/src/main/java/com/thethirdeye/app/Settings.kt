package com.thethirdeye.app

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.net.URLEncoder

@Serializable
data class GoogleStatus(val connected: Boolean = false, val capabilities: Capabilities = Capabilities(), val available: Boolean = true) {
    @Serializable data class Capabilities(val gmailRead: Boolean = false, val gmailSend: Boolean = false, val calendarRead: Boolean = false)

    val granted get() = listOfNotNull("Read Gmail".takeIf { capabilities.gmailRead }, "Send Gmail".takeIf { capabilities.gmailSend }, "Read Calendar".takeIf { capabilities.calendarRead })
}

@Serializable
data class GithubStatus(val connected: Boolean = false, val login: String? = null, val configured: Boolean = true)

@Serializable
data class WhatsAppLink(val configured: Boolean = false, val jarvisNumber: String? = null, val linked: Boolean = false, val phone: String? = null, val notify: Boolean = false)

@Serializable
private data class WhatsAppCode(val code: String, val jarvisNumber: String? = null, val link: String? = null)

@Serializable
data class Automation(val id: String, val name: String = "", val action: String = "", val fireAt: String = "", val recurrence: String? = null, val status: String = "pending", val lastRun: LastRun? = null) {
    @Serializable data class LastRun(val channel: String = "", val status: String = "", val at: String = "")
}

@Serializable
private data class Automations(val automations: List<Automation> = emptyList())

@Serializable
data class ProviderHealth(val provider: String, val status: String = "unknown", val model: String? = null, val reason: String? = null, val benchedUntil: String? = null, val checkedAt: String? = null)

@Serializable
private data class Providers(val providers: List<ProviderHealth> = emptyList())

@Serializable
data class OwnKey(val provider: String, val hint: String = "")

@Serializable
private data class OwnKeys(val keys: List<OwnKey> = emptyList())

@Serializable
data class LocalModel(
    val connected: Boolean = false,
    val host: String? = null,
    val localFirst: Boolean = true,
    val model: String? = null,
    val assistantModels: Map<String, String> = emptyMap(),
    val hasToken: Boolean = false,
)

@Serializable
data class LocalTest(val ok: Boolean = false, val models: List<String> = emptyList(), val ms: Int = 0, val error: String? = null) {
    val summary get() = if (ok) "Connected — ${models.size} ${if (models.size == 1) "model" else "models"}, $ms ms" else error ?: "No answer."
}

@Serializable
data class ServerStatus(val ai: Boolean = false, val openai: Boolean = false, val database: Boolean = false, val google_oauth: Boolean = false, val serper: Boolean = false)

@Serializable
private data class Connected(val login: String? = null)

val keyProviders = listOf("gemini", "groq", "openrouter", "mistral", "cerebras", "openai", "ollama")

const val DEFAULT_LOCAL_MODEL = "llama3.1:8b"
const val SAME_AS_ABOVE = "Same as above"
val localAssistants = listOf("jarvis" to "JARVIS", "friday" to "FRIDAY", "edith" to "E.D.I.T.H.", "ultron" to "ULTRON")

/** The whole per-assistant map, with one assistant changed; blank or "Same as above" removes it. */
fun withAssistantModel(current: Map<String, String>, assistant: String, model: String): Map<String, String> =
    current.filterKeys { it != assistant } + listOfNotNull(model.trim().takeIf { it.isNotEmpty() && it != SAME_AS_ABOVE }?.let { assistant to it })

/** +919876543210 as +91•••••••3210. */
fun maskPhone(phone: String): String = if (phone.length <= 7) phone else phone.take(3) + "•".repeat(phone.length - 7) + phone.takeLast(4)

class SettingsModel {
    var google by mutableStateOf<GoogleStatus?>(null)
    var github by mutableStateOf<GithubStatus?>(null)
    var whatsapp by mutableStateOf<WhatsAppLink?>(null)
    var automations by mutableStateOf<List<Automation>?>(null)
    var providers by mutableStateOf<List<ProviderHealth>?>(null)
    var ownKeys by mutableStateOf<List<OwnKey>?>(null)
    var status by mutableStateOf<ServerStatus?>(null)
    var local by mutableStateOf<LocalModel?>(null)
    var localTest by mutableStateOf<LocalTest?>(null)
    var error by mutableStateOf<String?>(null)
    var notice by mutableStateOf<String?>(null)
    var linkCode by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)

    private suspend inline fun <reified T> fetch(path: String): T? = try {
        json.decodeFromString<T>(Api.backend.send("GET", path))
    } catch (e: Exception) {
        null
    }

    suspend fun load() {
        google = fetch("/api/connect/google/status")
        github = fetch("/api/connect/github/status")
        whatsapp = fetch("/api/whatsapp/link")
        automations = fetch<Automations>("/api/automations")?.automations
        providers = fetch<Providers>("/api/providers")?.providers
        ownKeys = fetch<OwnKeys>("/api/user/provider-keys")?.keys
        status = fetch("/api/status")
        local = if (ownKeys?.any { it.provider == "ollama" } == true) fetch("/api/user/local-model") else null
        loaded = true
    }

    private suspend fun act(block: suspend () -> Unit): Boolean {
        val ok = try {
            block()
            error = null
            true
        } catch (e: Exception) {
            error = e.message
            false
        }
        load()
        return ok
    }

    suspend fun disconnectGoogle() = act { Api.backend.send("DELETE", "/api/connect/google") }

    suspend fun connectGithub(token: String) = act {
        val login = json.decodeFromString(Connected.serializer(), Api.backend.send("POST", "/api/connect/github", buildJsonObject { put("token", token.trim()) })).login
        notice = "GitHub connected${login?.let { " as $it" } ?: ""}."
    }

    suspend fun disconnectGithub() = act { Api.backend.send("DELETE", "/api/connect/github") }

    suspend fun linkWhatsApp(context: Context) = act {
        val reply = json.decodeFromString(WhatsAppCode.serializer(), Api.backend.send("POST", "/api/whatsapp/link"))
        linkCode = reply.code
        reply.link?.let { openInBrowser(context, it) }
    }

    suspend fun setNotify(on: Boolean) = act { Api.backend.send("PATCH", "/api/whatsapp/link", buildJsonObject { put("notify", on) }) }

    suspend fun unlinkWhatsApp() = act { Api.backend.send("DELETE", "/api/whatsapp/link"); linkCode = null }

    suspend fun setPaused(context: Context, a: Automation, paused: Boolean) = act {
        DataStore.update("reminders", a.id, buildJsonObject { put("status", if (paused) "paused" else "pending") })
        Reminders.sync(context)
    }

    suspend fun deleteAutomation(context: Context, a: Automation) = act {
        DataStore.delete("reminders", a.id)
        Reminders.sync(context)
    }

    suspend fun recheck() {
        try {
            providers = json.decodeFromString(Providers.serializer(), Api.backend.send("POST", "/api/providers")).providers
            error = null
        } catch (e: ApiError) {
            error = if (e.status == 429) "Wait a minute before re-checking" else e.message
        } catch (e: Exception) {
            error = e.message
        }
    }

    suspend fun addKey(provider: String, value: String) = act {
        Api.backend.send("PUT", "/api/user/provider-keys", buildJsonObject { put("provider", provider); put("value", value.trim()) })
    }

    suspend fun removeKey(provider: String) = act { Api.backend.send("DELETE", "/api/user/provider-keys?provider=${URLEncoder.encode(provider, "UTF-8")}") }

    private suspend fun putLocal(body: JsonObject) = act { Api.backend.send("PUT", "/api/user/local-model", body) }

    suspend fun setLocalFirst(on: Boolean) = putLocal(buildJsonObject { put("localFirst", on) })

    suspend fun setLocalModel(name: String) = putLocal(buildJsonObject { put("model", name.trim()) })

    suspend fun setAssistantModel(assistant: String, model: String) = putLocal(buildJsonObject {
        put("assistantModels", buildJsonObject { withAssistantModel(local?.assistantModels.orEmpty(), assistant, model).forEach { (k, v) -> put(k, v) } })
    })

    suspend fun setTunnelPassword(token: String) = putLocal(buildJsonObject { put("token", token.trim()) })

    suspend fun testLocal() {
        localTest = null
        try {
            localTest = json.decodeFromString(LocalTest.serializer(), Api.backend.send("POST", "/api/user/local-model"))
            error = null
        } catch (e: Exception) {
            error = e.message
        }
    }

    /** True once the account is gone and the person is signed out. */
    suspend fun deleteAccount(session: Session): Boolean = try {
        Api.backend.send("POST", "/api/account/delete")
        session.signOut()
        true
    } catch (e: ApiError) {
        error = e.message + e.failed.takeIf { it.isNotEmpty() }?.let { " Could not delete: ${it.joinToString()}." }.orEmpty()
        false
    }
}

private fun recurrenceText(a: Automation) = a.recurrence?.let { "repeats $it" } ?: "once"

private fun healthColor(status: String) = when (status) {
    "ok" -> Palette.success
    "unknown" -> Palette.muted
    else -> Palette.warning
}

@Composable
private fun ConnectionRow(title: String, detail: String, connected: Boolean, content: @Composable () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Dot(if (connected) Palette.success else Palette.muted)
            Column(Modifier.weight(1f)) {
                Text(title, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                Text(detail, fontSize = 12.sp, color = Palette.muted)
            }
        }
        content()
    }
}

@Composable
fun SettingsScreen(session: Session, nav: Nav, model: SettingsModel = remember { SettingsModel() }) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var githubToken by remember { mutableStateOf("") }
    var keyProvider by remember { mutableStateOf(keyProviders.first()) }
    var keyValue by remember { mutableStateOf("") }
    var tunnelPassword by remember { mutableStateOf("") }
    var deletingAccount by remember { mutableStateOf(false) }
    var deletingAutomation by remember { mutableStateOf<Automation?>(null) }
    LaunchedEffect(Unit) { model.load() }

    ListScreen("Settings", model.loaded, refresh = { model.load() }, onBack = nav::back) {
        item { ErrorText(model.error) }
        model.notice?.let { n -> item("notice") { Text(n, color = Palette.blue, fontSize = 13.sp) } }

        item { SectionLabel("Account") }
        item("account") {
            Panel {
                Text(session.name ?: "Signed in", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                session.email?.let { Text(it, fontSize = 13.sp, color = Palette.muted) }
                TextButton(onClick = { session.signOut() }) { Text("Sign out") }
                TextButton(onClick = { deletingAccount = true }) { Text("Delete account", color = Palette.red) }
            }
        }

        item { SectionLabel("Connections") }
        item("google") {
            Panel {
                val g = model.google
                ConnectionRow("Google", when {
                    g == null -> "Couldn't check right now."
                    !g.available -> "Not set up on this server."
                    g.connected -> g.granted.joinToString(", ").ifEmpty { "Connected" }
                    else -> "Not connected"
                }, g?.connected == true) {
                    if (g?.available == true) {
                        if (g.connected) TextButton(onClick = { scope.launch { model.disconnectGoogle() } }) { Text("Disconnect", color = Palette.red) }
                        else TextButton(onClick = { nav.push(Dest.Web("Connect Google", "/api/connect/google")) }) { Text("Connect") }
                    }
                }
            }
        }
        item("github") {
            Panel {
                val g = model.github
                ConnectionRow("GitHub", when {
                    g == null -> "Couldn't check right now."
                    !g.configured -> "Not set up on this server."
                    g.connected -> "Connected as ${g.login ?: "you"}"
                    else -> "Not connected"
                }, g?.connected == true) {
                    if (g != null) {
                        if (g.connected) TextButton(onClick = { scope.launch { model.disconnectGithub() } }) { Text("Disconnect", color = Palette.red) }
                        else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field("Personal access token", githubToken, { githubToken = it }, secret = true)
                            GlowButton("Connect", enabled = githubToken.isNotBlank()) { scope.launch { model.connectGithub(githubToken); githubToken = "" } }
                        }
                    }
                }
            }
        }

        item { SectionLabel("WhatsApp") }
        item("whatsapp") {
            Panel {
                val w = model.whatsapp
                when {
                    w == null -> Hint("Couldn't check right now.")
                    !w.configured -> Hint("WhatsApp isn't set up on this server yet.")
                    w.linked -> {
                        ConnectionRow("Linked", w.phone?.let(::maskPhone) ?: "WhatsApp", true)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Send reminders and updates here", Modifier.weight(1f), fontSize = 14.sp)
                            Switch(w.notify, { scope.launch { model.setNotify(it) } }, colors = SwitchDefaults.colors(checkedTrackColor = Palette.blue))
                        }
                        TextButton(onClick = { scope.launch { model.unlinkWhatsApp() } }) { Text("Unlink", color = Palette.red) }
                    }
                    else -> {
                        ConnectionRow("Not linked", w.jarvisNumber?.let { "Assistant number $it" } ?: "Link to chat with the assistant on WhatsApp", false)
                        model.linkCode?.let { Text("Send this code on WhatsApp: $it", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Palette.blue) }
                        GlowButton("Link WhatsApp") { scope.launch { model.linkWhatsApp(context) } }
                    }
                }
            }
        }

        item { SectionLabel("Automations") }
        val automations = model.automations
        if (automations == null) item("automations-none") { Hint("Couldn't check right now.") }
        else if (automations.isEmpty()) item("automations-none") { Hint("None yet. Ask the assistant to run something on a schedule.") }
        automations?.forEach { a ->
            item("automation-${a.id}") {
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(a.name, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            Text(a.action, fontSize = 12.sp, color = Palette.secondary, maxLines = 2)
                        }
                        Switch(a.status == "pending", { on -> scope.launch { model.setPaused(context, a, !on) } }, colors = SwitchDefaults.colors(checkedTrackColor = Palette.blue))
                        IconButton(onClick = { deletingAutomation = a }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                    }
                    Text(
                        listOfNotNull(isoDate(a.fireAt), recurrenceText(a), a.lastRun?.let { "last run ${it.status} by ${it.channel}" }).joinToString(" · "),
                        fontSize = 11.sp, color = Palette.muted,
                    )
                }
            }
        }

        item { SectionLabel("AI providers") }
        val providers = model.providers
        if (providers == null) item("providers-none") { Hint("Couldn't check right now.") }
        providers?.forEach { p ->
            item("provider-${p.provider}") {
                Row(Modifier.card(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Dot(healthColor(p.status))
                    Column(Modifier.weight(1f)) {
                        Text(p.provider, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        Text(p.reason ?: p.model ?: titleCase(p.status), fontSize = 12.sp, color = Palette.muted, maxLines = 2)
                    }
                    Badge(p.status.replace('_', ' '), healthColor(p.status))
                }
            }
        }
        item { TextButton(onClick = { scope.launch { model.recheck() } }) { Text("Re-check now") } }
        item { SectionLabel("Your own keys") }
        model.ownKeys?.forEach { k ->
            item("key-${k.provider}") {
                Row(Modifier.card(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(k.provider, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        Text(k.hint, fontSize = 12.sp, color = Palette.muted)
                    }
                    IconButton(onClick = { scope.launch { model.removeKey(k.provider) } }) { Icon(Icons.Outlined.Delete, contentDescription = "Remove", tint = Palette.muted) }
                }
            }
        }
        item("add-key") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Choice("Provider", keyProviders, keyProvider) { keyProvider = it }
                Field("API key", keyValue, { keyValue = it }, secret = true)
                GlowButton("Add key", enabled = keyValue.isNotBlank()) { scope.launch { model.addKey(keyProvider, keyValue); keyValue = "" } }
            }
        }
        item("openrouter") {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { nav.push(Dest.Web("Sign in with OpenRouter", "/api/connect/openrouter")) }) { Text("Sign in with OpenRouter") }
                Hint("Uses your own OpenRouter account — free models, or your credit for paid ones.")
            }
        }

        model.local?.let { l ->
            item { SectionLabel("Your computer") }
            item("local-model") {
                val tested = model.localTest?.takeIf { it.ok }?.models.orEmpty()
                val known = (tested + listOfNotNull(l.model) + l.assistantModels.values).distinct()
                val defaultLabel = "Default ($DEFAULT_LOCAL_MODEL)"
                Panel {
                    ConnectionRow(l.host ?: "Your computer", "Ollama through your tunnel", l.connected)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Answer from my computer first (free)", Modifier.weight(1f), fontSize = 14.sp)
                        Switch(l.localFirst, { scope.launch { model.setLocalFirst(it) } }, colors = SwitchDefaults.colors(checkedTrackColor = Palette.blue))
                    }
                    Hint("Your computer answers first; the free cloud models take over when it's asleep or busy.")
                    TextButton(onClick = { scope.launch { model.testLocal() } }) { Text("Test connection") }
                    model.localTest?.let { Text(it.summary, fontSize = 13.sp, color = if (it.ok) Palette.success else Palette.warning) }
                    if (tested.isEmpty()) {
                        var draft by remember(l.model) { mutableStateOf(l.model.orEmpty()) }
                        Field("Model", draft, { draft = it }, placeholder = DEFAULT_LOCAL_MODEL)
                        GlowButton("Save model", enabled = draft.trim() != l.model.orEmpty()) { scope.launch { model.setLocalModel(draft) } }
                    } else {
                        Choice("Model", listOf(defaultLabel) + known, l.model ?: defaultLabel) { scope.launch { model.setLocalModel(it.takeIf { m -> m != defaultLabel }.orEmpty()) } }
                    }
                    if (known.isNotEmpty()) {
                        Text("Per assistant", fontSize = 13.sp, color = Palette.muted)
                        localAssistants.forEach { (id, name) ->
                            Choice(name, listOf(SAME_AS_ABOVE) + known, l.assistantModels[id] ?: SAME_AS_ABOVE) { scope.launch { model.setAssistantModel(id, it) } }
                        }
                    }
                    if (l.hasToken) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Password saved", Modifier.weight(1f), fontSize = 14.sp)
                            TextButton(onClick = { scope.launch { model.setTunnelPassword("") } }) { Text("Remove", color = Palette.red) }
                        }
                    } else {
                        Field("Tunnel password", tunnelPassword, { tunnelPassword = it }, secret = true)
                        GlowButton("Save password", enabled = tunnelPassword.isNotBlank()) { scope.launch { if (model.setTunnelPassword(tunnelPassword)) tunnelPassword = "" } }
                    }
                    Hint("Only if your tunnel asks for one. user:password is sent as Basic auth, anything else as a bearer token.")
                }
            }
        }

        item { SectionLabel("Permissions") }
        item("permissions") { PermissionTiles() }

        item { SectionLabel("About") }
        item("about") {
            Panel {
                val version = remember { runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull() ?: "" }
                Text("The Third Eye $version", fontSize = 15.sp)
                model.status?.let { s ->
                    listOf("AI" to s.ai, "Transcription" to s.openai, "Database" to s.database, "Google sign-in" to s.google_oauth, "Search" to s.serper).forEach { (name, on) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Dot(if (on) Palette.success else Palette.muted, 8)
                            Text(name, fontSize = 14.sp)
                        }
                    }
                } ?: Hint("Server status isn't available right now.")
            }
        }
    }

    if (deletingAccount) {
        AlertDialog(
            onDismissRequest = { deletingAccount = false },
            containerColor = Palette.elevated,
            title = { Text("Delete your account?") },
            text = { Text("This permanently deletes your tasks, notes, goals, documents, connections and everything else stored for you, and signs you out. It can't be undone.") },
            confirmButton = { TextButton(onClick = { deletingAccount = false; scope.launch { model.deleteAccount(session) } }) { Text("Delete everything", color = Palette.red) } },
            dismissButton = { TextButton(onClick = { deletingAccount = false }) { Text("Cancel") } },
        )
    }
    deletingAutomation?.let { a ->
        AlertDialog(
            onDismissRequest = { deletingAutomation = null },
            containerColor = Palette.elevated,
            title = { Text("Delete \"${a.name}\"?") },
            confirmButton = { TextButton(onClick = { deletingAutomation = null; scope.launch { model.deleteAutomation(context, a) } }) { Text("Delete", color = Palette.red) } },
            dismissButton = { TextButton(onClick = { deletingAutomation = null }) { Text("Cancel") } },
        )
    }
}
