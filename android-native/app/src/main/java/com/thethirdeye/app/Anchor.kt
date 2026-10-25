package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** ANCHOR autopilot inside the app, as on the website (components/studio/AnchorPanel). */
@Serializable
data class AnchorOverview(
    val lastRun: LastRun? = null,
    val nextPostAt: String? = null,
    val streak: Int = 0,
    val total: Int = 0,
    val drops: List<Drop> = emptyList(),
    val runs: List<Run> = emptyList(),
    val site: String = "",
    val repo: String = "",
    val canRun: Boolean = false,
) {
    @Serializable data class LastRun(val result: String, val stage: String, val title: String? = null, val finishedAt: String? = null, val error: String? = null)
    @Serializable data class Drop(
        val id: String, val date: String, val title: String, val lane: String = "", val bpm: Int? = null, val seconds: Double? = null,
        val cover: String? = null, val youtubeUrl: String? = null, val shortUrl: String? = null, val status: String = "",
    )
    @Serializable data class Run(val name: String, val status: String, val conclusion: String? = null, val url: String, val startedAt: String)
}

fun anchorWhen(iso: String?): String =
    iso?.let { runCatching { java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).let { t -> "${t.toLocalDate()} ${"%02d:%02d".format(t.hour, t.minute)}" } }.getOrNull() } ?: "-"

fun mmss(seconds: Double?): String = seconds?.takeIf { it > 0 }?.let { val s = Math.round(it).toInt(); "%d:%02d".format(s / 60, s % 60) }.orEmpty()

private class AnchorAction(val id: String, val body: JsonObject, val confirm: String)

private val ANCHOR_ACCENT = Color(0xFFFF3B1F)

@Composable
fun AnchorScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<AnchorOverview?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<Pair<Boolean, String>?>(null) }
    var pending by remember { mutableStateOf<AnchorAction?>(null) }
    var song by remember { mutableStateOf("") }

    suspend fun load() {
        error = null
        try {
            data = json.decodeFromString(AnchorOverview.serializer(), Api.backend.send("GET", "/api/tools/anchor"))
        } catch (e: Exception) {
            error = e.message
        }
    }

    fun run(action: AnchorAction) = scope.launch {
        busy = action.id
        message = null
        val reply = try {
            json.parseToJsonElement(Api.backend.send("POST", "/api/tools/anchor", action.body)).jsonObject
        } catch (e: Exception) {
            buildJsonObject { put("error", e.message.orEmpty()) }
        }
        val ok = (reply["ok"] as? JsonPrimitive)?.booleanOrNull == true
        message = ok to ((reply["message"] ?: reply["error"]) as? JsonPrimitive)?.content.orEmpty()
        // Locked until the refresh shows the new run, so a second tap can't start a duplicate.
        if (ok) { delay(4000); load() }
        busy = null
    }

    LaunchedEffect(Unit) { load() }

    pending?.let { action ->
        AlertDialog(
            onDismissRequest = { pending = null },
            text = { Text(action.confirm) },
            confirmButton = { TextButton(onClick = { pending = null; run(action) }) { Text("Start") } },
            dismissButton = { TextButton(onClick = { pending = null }) { Text("Cancel") } },
        )
    }

    ListScreen("ANCHOR", loaded = data != null || error != null, refresh = { load() }, onBack = onBack) {
        error?.let { item { ErrorText(it) } }
        val d = data ?: return@ListScreen

        item {
            Panel {
                val last = d.lastRun
                Stat("Last run", last?.let { "${if (it.result == "ok") "✓" else "✗"} ${it.title ?: it.stage}" } ?: "-", last?.finishedAt?.let(::anchorWhen))
                Stat("Next post", anchorWhen(d.nextPostAt))
                Stat("Streak", "${d.streak} days")
                Stat("Released", "${d.total} records")
                last?.error?.let { Text("Last run failed at ${last.stage}: $it", fontSize = 12.sp, color = Palette.red) }
            }
        }
        item {
            Panel {
                SectionLabel("Controls", ANCHOR_ACCENT)
                if (!d.canRun) Hint("Read-only here: starting ANCHOR's workflows needs ANCHOR_GITHUB_TOKEN (Actions write on ${d.repo}) and your account in ANCHOR_OPERATORS.")
                @Composable
                fun Control(id: String, label: String, body: JsonObject, confirm: String, enabled: Boolean = true) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextButton(enabled = d.canRun && busy == null && enabled, onClick = { pending = AnchorAction(id, body, confirm) }) { Text(label) }
                        if (busy == id) CircularProgressIndicator(Modifier.size(18.dp), color = ANCHOR_ACCENT, strokeWidth = 2.dp)
                    }
                }
                Control("drop", "Run today's drop", buildJsonObject { put("action", "drop") },
                    "Start today's ANCHOR drop? It generates, releases and schedules the posts for 17:30 UTC.")
                Control("rehearse", "Rehearse (render only)", buildJsonObject { put("action", "drop"); put("dryRun", true) },
                    "Rehearse today's drop? It renders only; nothing is released or posted.")
                Control("mix", "Weekly mix", buildJsonObject { put("action", "mix"); put("period", "week") },
                    "Build this week's continuous mix and publish it?")
                Field("Suno song link or id", song, { song = it })
                Control("queue", "Queue song", buildJsonObject { put("action", "queue_song"); put("song", song.trim()) },
                    "Queue this Suno song for the next drop?", enabled = song.isNotBlank())
                message?.let { (ok, text) -> Text(text, fontSize = 12.sp, color = if (ok) Palette.success else Palette.red) }
                TextButton(onClick = { openInBrowser(context, "https://github.com/${d.repo}/actions") }) { Text("Actions on GitHub") }
            }
        }
        if (d.runs.isNotEmpty()) {
            item { SectionLabel("Recent workflow runs") }
            d.runs.forEach { r ->
                item(r.url) {
                    Row(Modifier.card { openInBrowser(context, r.url) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        androidx.compose.foundation.layout.Box(Modifier.size(8.dp).background(
                            when (r.conclusion) { "success" -> Palette.success; null -> Palette.warning; else -> Palette.red }, CircleShape))
                        Text(r.name, Modifier.weight(1f), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                        Text(r.conclusion ?: r.status, fontSize = 12.sp, color = Palette.muted)
                        Text(anchorWhen(r.startedAt), fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
                    }
                }
            }
        }
        item { SectionLabel("Releases") }
        d.drops.take(12).forEach { drop ->
            item(drop.id) {
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(drop.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(listOfNotNull(drop.date, drop.lane, drop.bpm?.let { "$it BPM" }, mmss(drop.seconds)).filter { it.isNotEmpty() }.joinToString(" · "),
                        fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Palette.muted, maxLines = 1)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        drop.youtubeUrl?.let { url -> TextButton(onClick = { openInBrowser(context, url) }) { Text("YouTube", fontSize = 12.sp) } }
                        drop.shortUrl?.let { url -> TextButton(onClick = { openInBrowser(context, url) }) { Text("Short", fontSize = 12.sp) } }
                        Text(drop.status, Modifier.weight(1f), fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
                    }
                }
            }
        }
        if (d.site.isNotBlank()) item { TextButton(onClick = { openInBrowser(context, d.site) }) { Text(d.site.removePrefix("https://")) } }
    }
}

@Composable
private fun Stat(label: String, value: String, sub: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), fontSize = 13.sp, color = Palette.muted)
        Column(horizontalAlignment = Alignment.End) {
            Text(value, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            sub?.let { Text(it, fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Palette.muted) }
        }
    }
}
