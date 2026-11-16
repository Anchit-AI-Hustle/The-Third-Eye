package com.thethirdeye.app

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

class KnowledgeModel : Records<KnowledgeDoc>("knowledge_docs") {
    override suspend fun fetch() = DataStore.rows<KnowledgeDoc>("knowledge_docs")

    var uploading by mutableStateOf(false)
        private set

    /** Sends the files to the server, which reads PDF, Word and text files as the website does. */
    suspend fun upload(files: List<UploadFile>) {
        if (files.isEmpty()) return
        uploading = true
        try {
            val created = json.decodeFromString(Uploaded.serializer(), Api.backend.upload("/api/knowledge/upload", "file", files)).docs
            items = created + items
            val failed = created.filter { it.processing_status == "failed" }
            error = failed.takeIf { it.isNotEmpty() }?.joinToString("\n") { "${it.title}: ${it.error ?: "couldn't be read"}" }
            DataStore.changed()
        } catch (e: Exception) {
            error = e.message
        } finally {
            uploading = false
        }
    }

    @Serializable
    private data class Uploaded(val docs: List<KnowledgeDoc> = emptyList())
}

/** The picked documents' names, types and bytes, read off the main thread. */
suspend fun readPicked(context: Context, uris: List<Uri>): List<UploadFile> = withContext(Dispatchers.IO) {
    uris.mapNotNull { uri ->
        val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: uri.lastPathSegment ?: "document"
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@mapNotNull null
        UploadFile(name, context.contentResolver.getType(uri) ?: "application/octet-stream", bytes)
    }
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
    val context = LocalContext.current
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        scope.launch { model.upload(readPicked(context, uris)) }
    }
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
                // PDF, Word and text files are read on the server (lib/knowledgeFile, as on the website).
                TextButton(onClick = { pick.launch(arrayOf("*/*")) }, enabled = !model.uploading) {
                    Icon(Icons.Outlined.UploadFile, null); Text(if (model.uploading) "  Reading the document…" else "  Upload a document")
                }
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
    @Serializable data class Segment(
        val id: String,
        val startTs: Flex? = null,
        val endTs: Flex? = null,
        val transcript: String? = null,
        val hasAudio: Boolean? = null,
        val provider: String? = null,
        val silent: Boolean? = null,
    )
    @Serializable data class Event(val id: String, val ts: Flex? = null, val title: String, val kind: String? = null, val detail: String? = null)
    @Serializable data class Diary(val id: String, val ts: Flex? = null, val text: String, val mood: String? = null)

    /** The row the website writes too (lib/lifelog/store.ts): one per day, id = date, audio kept off the server. */
    fun row(): JsonObject = JsonObject(
        json.encodeToJsonElement(serializer(), copy(segments = segments.orEmpty(), events = events.orEmpty(), diary = diary.orEmpty(), summary = summary.orEmpty())).jsonObject
            + ("updated_at" to JsonPrimitive(java.time.Instant.now().toString())),
    )

    companion object {
        fun empty(date: String) = LifeLogDay(date, date, emptyList(), emptyList(), emptyList(), "")
    }
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
        item { TextButton(onClick = { nav.push(Dest.Today) }) { Text(if (DayRecorder.recording) "Recording today…" else "Record or write today") } }
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
    ListScreen(day.date, loaded = true, refresh = {}, onBack = onBack) { daySections(day) }
}
