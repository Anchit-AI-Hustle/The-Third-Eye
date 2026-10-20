package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

class KnowledgeModel : Records<KnowledgeDoc>("knowledge_docs") {
    override suspend fun fetch() = DataStore.rows<KnowledgeDoc>("knowledge_docs")
}

fun docDetails(doc: KnowledgeDoc): String {
    val type = (doc.file_type ?: "txt").uppercase()
    val kb = ((doc.file_size_bytes ?: 0.0) / 1024).toInt()
    return if (doc.processing_status == "ready") "$type · $kb KB · ${(doc.chunk_count ?: 0.0).toInt()} chunks"
    else "$type · ${doc.processing_status ?: "processing"}${doc.error?.let { ": $it" } ?: ""}"
}

@Composable
fun KnowledgeScreen(app: AppState, nav: Nav, model: KnowledgeModel = remember { KnowledgeModel() }) {
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }

    ListScreen("Knowledge", model.loaded, refresh = { model.load() }, onBack = nav::back) {
        item { ErrorText(model.error) }
        item {
            Panel {
                Text("${model.items.count { it.processing_status == "ready" }} of ${model.items.size} documents ready. The assistant answers from them.", fontSize = 13.sp, color = Palette.secondary)
                TextButton(onClick = { app.ask("What's in my knowledge base? Give me a short overview.") }) {
                    Icon(Icons.AutoMirrored.Outlined.Chat, null); Text("  Ask about my documents")
                }
                // Uploading and text extraction stay on the website's tested pipeline.
                TextButton(onClick = { nav.push(Dest.Web("Upload", "/knowledge")) }) { Icon(Icons.Outlined.UploadFile, null); Text("  Upload a document") }
            }
        }
        item { SectionLabel("Documents") }
        if (model.loaded && model.items.isEmpty()) item { Hint("No documents yet. Upload a PDF, Word or text file to search it with the assistant.") }
        model.items.forEach { doc ->
            item(doc.id) {
                Row(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable { nav.push(Dest.Document(doc)) }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(doc.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(docDetails(doc), fontSize = 12.sp, color = if (doc.processing_status == "ready") Palette.muted else Palette.red)
                    }
                    IconButton(onClick = { scope.launch { model.remove(doc.id) { it.id } } }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                }
            }
        }
    }
}

@Composable
fun DocumentScreen(doc: KnowledgeDoc, onBack: () -> Unit) {
    ListScreen(doc.title, loaded = true, refresh = {}, onBack = onBack) {
        item { SelectionContainer { Text(doc.content?.takeIf { it.isNotBlank() } ?: "No text was extracted from this document.", fontSize = 14.sp) } }
    }
}

@Serializable
data class LifeLogDay(
    val id: String,
    val date: String,
    val segments: List<Segment>? = null,
    val events: List<Event>? = null,
    val diary: List<Diary>? = null,
    val summary: String? = null,
) {
    @Serializable data class Segment(val id: String, val startTs: Flex? = null, val transcript: String? = null, val silent: Boolean? = null)
    @Serializable data class Event(val id: String, val ts: Flex? = null, val title: String, val kind: String? = null, val detail: String? = null)
    @Serializable data class Diary(val id: String, val ts: Flex? = null, val text: String, val mood: String? = null)
}

class LifeLogModel : Records<LifeLogDay>("lifelog_days") {
    override suspend fun fetch() = DataStore.rows<LifeLogDay>("lifelog_days")
}

fun clock(ms: Double?): String = ms?.let {
    java.time.Instant.ofEpochMilli(it.toLong()).atZone(java.time.ZoneId.systemDefault()).toLocalTime()
        .format(java.time.format.DateTimeFormatter.ofLocalizedTime(java.time.format.FormatStyle.SHORT))
} ?: ""

@Composable
fun LifeLogScreen(nav: Nav, model: LifeLogModel = remember { LifeLogModel() }) {
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }
    ListScreen("Life Log", model.loaded, refresh = { model.load() }, onBack = nav::back) {
        item { ErrorText(model.error) }
        // Recording, transcription and the day summary run on the website's pipeline.
        item { TextButton(onClick = { nav.push(Dest.Web("Today", "/lifelog")) }) { Text("Record or write today") } }
        item { SectionLabel("Days") }
        if (model.loaded && model.items.isEmpty()) item { Hint("Nothing logged yet. Record your day or write a diary entry and it shows here.") }
        model.items.forEach { day ->
            item(day.id) {
                Column(Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable { nav.push(Dest.Day(day)) }.padding(12.dp)) {
                    Text(day.date, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    Text(
                        day.summary?.takeIf { it.isNotBlank() } ?: "${day.events?.size ?: 0} events · ${day.diary?.size ?: 0} diary entries",
                        fontSize = 12.sp, color = Palette.muted, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
fun LifeLogDayScreen(day: LifeLogDay, onBack: () -> Unit) {
    ListScreen(day.date, loaded = true, refresh = {}, onBack = onBack) {
        day.summary?.takeIf { it.isNotBlank() }?.let { s -> item { Panel { SectionLabel("Summary"); Text(s, fontSize = 14.sp) } } }
        day.events?.takeIf { it.isNotEmpty() }?.let { events ->
            item {
                Panel {
                    SectionLabel("Timeline")
                    events.forEach { e ->
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row { Text(e.title, Modifier.weight(1f), fontSize = 14.sp, fontWeight = FontWeight.Medium); Text(clock(e.ts), fontSize = 12.sp, color = Palette.muted) }
                            e.detail?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = Palette.secondary) }
                        }
                    }
                }
            }
        }
        day.diary?.takeIf { it.isNotEmpty() }?.let { diary ->
            item {
                Panel {
                    SectionLabel("Diary")
                    diary.forEach { d ->
                        Column {
                            Text(d.text, fontSize = 14.sp)
                            Text(listOf(clock(d.ts), d.mood ?: "").filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Palette.muted)
                        }
                    }
                }
            }
        }
        val spoken = day.segments.orEmpty().filter { it.silent != true && !it.transcript.isNullOrBlank() }
        if (spoken.isNotEmpty()) item {
            Panel {
                SectionLabel("Transcript")
                spoken.forEach { s ->
                    Column {
                        Text(clock(s.startTs), fontSize = 11.sp, color = Palette.blue)
                        SelectionContainer { Text(s.transcript ?: "", fontSize = 13.sp) }
                    }
                }
            }
        }
    }
}
