package com.thethirdeye.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import kotlinx.serialization.Serializable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Serializable
data class GenerationRowIn(
    val id: String, val app: String = "", val tool: String? = null, val app_label: String = "", val title: String = "Untitled",
    val kind: String = "markdown", val created_at: String = "", val inputs: List<Generation.Input> = emptyList(), val output: String = "",
)

@Serializable
data class TrackRowIn(val id: String, val title: String? = null, val audio_url: String? = null, val created_at: String = "")

fun GenerationRowIn.toGeneration() = Generation(id, app, tool, app_label, title, kind, created_at, inputs, output)

/** This phone's and the account's (website, other devices, assistant, music library), newest first, once each. */
fun mergeGenerations(local: List<Generation>, rows: List<GenerationRowIn>, tracks: List<TrackRowIn>): List<Generation> {
    val ids = local.map { it.id }.toMutableSet()
    val out = local.toMutableList()
    rows.filter { ids.add(it.id) }.forEach { out += it.toGeneration() }
    // A song recorded as a generation is in the library too; account rows come without their output, so match by title as well.
    val songs = out.filter { it.app == "music" }
    tracks.filter { t -> !t.audio_url.isNullOrBlank() && songs.none { it.output == t.audio_url || (t.title != null && it.title == t.title) } && ids.add("music_${t.id}") }
        .forEach { out += Generation("music_${it.id}", "music", null, "Music Studio", it.title ?: "Track", "audio", it.created_at, emptyList(), it.audio_url!!) }
    return out.sortedByDescending { it.createdAt }
}

private val Generation.fileName get() = "${tool ?: app}.${if (kind == "html") "html" else "md"}"

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun GenerationsScreen(onBack: () -> Unit) {
    val local = Local.get(LocalContext.current)
    var query by remember { mutableStateOf("") }
    var app by remember { mutableStateOf<String?>(null) }
    var openId by remember { mutableStateOf<String?>(null) }
    var rows by remember { mutableStateOf(emptyList<GenerationRowIn>()) }
    var tracks by remember { mutableStateOf(emptyList<TrackRowIn>()) }
    var full by remember { mutableStateOf<Generation?>(null) }
    suspend fun load() {
        rows = runCatching { DataStore.rows<GenerationRowIn>("generations") }.getOrDefault(rows)
        tracks = runCatching { DataStore.rows<TrackRowIn>("music_tracks") }.getOrDefault(tracks)
    }
    LaunchedEffect(Unit) { load() }
    val all = mergeGenerations(local.generations, rows, tracks)
    val listed = all.firstOrNull { it.id == openId }
    // A row listed from the account leaves its output out: read it whole when opened.
    LaunchedEffect(openId) {
        full = null
        val l = listed ?: return@LaunchedEffect
        if (l.output.isEmpty() && local.generations.none { it.id == l.id }) {
            full = runCatching { DataStore.rows<GenerationRowIn>("generations?id=${java.net.URLEncoder.encode(l.id, "UTF-8")}").firstOrNull()?.toGeneration() }.getOrNull()
        }
    }
    val open = full ?: listed
    BackHandler(open != null) { openId = null }

    if (open != null) return GenerationDetail(open, onBack = { openId = null }, onDelete = {
        local.deleteGeneration(open.id); rows = rows.filterNot { it.id == open.id }; tracks = tracks.filterNot { "music_${it.id}" == open.id }; openId = null
    })

    val apps = all.map { it.app to it.appLabel }.distinct()
    val shown = searchGenerations(all, query, app)
    ListScreen("Generations", loaded = true, refresh = { load() }, onBack = onBack) {
        item { Field("Search", query, { query = it }) }
        if (apps.size > 1) item("apps") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(app == null, { app = null }, label = { Text("All") })
                apps.forEach { (id, label) -> FilterChip(app == id, { app = id }, label = { Text(label) }) }
            }
        }
        if (all.isEmpty()) item { Hint("Everything you make, here, on the website or by asking the assistant, shows up here.") }
        else if (shown.isEmpty()) item { Hint("Nothing matches.") }
        shown.forEach { g ->
            item(g.id) {
                Column(Modifier.card { openId = g.id }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(g.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${g.appLabel} · ${isoDate(g.createdAt)}", fontSize = 12.sp, color = Palette.muted)
                    Text(g.output.replace(Regex("""[#*`>|]"""), "").trim(), fontSize = 12.sp, color = Palette.secondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun GenerationDetail(g: Generation, onBack: () -> Unit, onDelete: () -> Unit) {
    ListScreen(g.appLabel, loaded = true, refresh = {}, onBack = onBack) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(g.title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(isoDate(g.createdAt), fontSize = 12.sp, color = Palette.muted)
            }
        }
        if (g.inputs.isNotEmpty()) item("inputs") {
            Panel {
                SectionLabel("Inputs")
                g.inputs.forEach { Column { Text(it.label, fontSize = 12.sp, color = Palette.muted); Text(it.value, fontSize = 14.sp) } }
            }
        }
        item("output") { Panel { SectionLabel("Output"); GeneratedOutput(g.output, g.kind) } }
        item("actions") {
            OutputActions(g.output, g.fileName) {
                TextButton(onClick = onDelete) { Icon(Icons.Outlined.Delete, null, Modifier.size(18.dp), tint = Palette.red); Text("  Delete", color = Palette.red) }
            }
        }
    }
}
