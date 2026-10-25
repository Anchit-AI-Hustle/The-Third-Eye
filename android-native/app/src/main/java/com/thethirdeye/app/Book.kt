package com.thethirdeye.app

import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.security.MessageDigest

/** "### Chapter 3: The Fall" blocks with the bullets under each, as lib/book parseOutline. */
data class BookOutline(val title: String, val subtitle: String, val chapters: List<Chapter>) {
    data class Chapter(val n: Int, val title: String, val beats: String)

    companion object {
        private val CHAPTER = Regex("""^#{2,4}\s*Chapter\s+(\d+)\s*[:.—–-]?\s*(.*)$""", RegexOption.IGNORE_CASE)
        private val HEADING = Regex("""^#{1,3}\s""")
        private val TITLE = Regex("""^#\s+\S""")

        fun parse(md: String): BookOutline {
            val lines = md.split("\n")
            val titleAt = lines.indexOfFirst { TITLE.containsMatchIn(it) }
            val title = if (titleAt >= 0) lines[titleAt].replace(Regex("""^#\s+"""), "").trim() else "Untitled"
            val next = if (titleAt >= 0) lines.drop(titleAt + 1).firstOrNull { it.isNotBlank() }?.trim()?.replace(Regex("""^[*_]+|[*_]+$"""), "").orEmpty() else ""
            val chapters = mutableListOf<Triple<Int, String, MutableList<String>>>()
            var inChapter = false
            for (raw in lines) {
                val line = raw.trim()
                val m = CHAPTER.find(line)
                if (m != null) {
                    val n = m.groupValues[1].toInt()
                    chapters += Triple(n, m.groupValues[2].trim().ifEmpty { "Chapter $n" }, mutableListOf())
                    inChapter = true
                } else if (HEADING.containsMatchIn(line)) {
                    inChapter = false
                } else if (inChapter && line.isNotEmpty()) {
                    chapters.last().third += line
                }
            }
            return BookOutline(title, if (next.startsWith("#")) "" else next, chapters.map { Chapter(it.first, it.second, it.third.joinToString("\n")) })
        }

        const val PART_WORDS = 2500
        fun parts(words: Int) = maxOf(1, (words + PART_WORDS - 1) / PART_WORDS)
        fun words(text: String) = text.trim().split(Regex("""\s+""")).count { it.isNotEmpty() }
        val stores = listOf(
            "Kindle Direct Publishing" to "https://kdp.amazon.com/en_US/title-setup/kindle/new/details",
            "Google Play Books" to "https://play.google.com/books/publish/",
            "Draft2Digital (Apple, Kobo, B&N…)" to "https://draft2digital.com/book/new",
        )
    }
}

@Serializable
data class BookListing(
    val title: String? = null,
    val subtitle: String? = null,
    val description: String,
    val keywords: List<String>,
    val categories: List<String> = emptyList(),
    val audience: String? = null,
)

@Serializable
private data class BookDraft(val texts: Map<Int, String> = emptyMap(), val author: String = "", val listing: BookListing? = null)

class BookModel(context: Context, private val markdown: String, val inputs: Map<String, String>) {
    val outline = BookOutline.parse(markdown)
    private val prefs = context.getSharedPreferences("book-studio", Context.MODE_PRIVATE)
    private val key = MessageDigest.getInstance("SHA-256").digest(markdown.toByteArray()).take(8).joinToString("") { "%02x".format(it) }

    val texts = mutableStateMapOf<Int, String>()
    var author by mutableStateOf("")
    var listing by mutableStateOf<BookListing?>(null)
        private set
    val busy = mutableStateMapOf<Int, String>()
    val failures = mutableStateMapOf<Int, String>()
    var writingAll by mutableStateOf(false)
        private set
    var listingBusy by mutableStateOf(false)
        private set
    var exporting by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
    private var stopAll = false

    init {
        prefs.getString(key, null)?.let { runCatching { json.decodeFromString(BookDraft.serializer(), it) }.getOrNull() }?.let {
            texts.putAll(it.texts)
            author = it.author
            listing = it.listing
        }
    }

    fun persist() {
        prefs.edit().putString(key, json.encodeToString(BookDraft.serializer(), BookDraft(texts.toMap(), author, listing))).apply()
    }

    val perChapter get() = inputs["length"]?.toIntOrNull() ?: 2500
    val written get() = outline.chapters.filter { texts[it.n].orEmpty().isNotBlank() }
    val totalWords get() = written.sumOf { BookOutline.words(texts[it.n].orEmpty()) }

    private val book get() = buildJsonObject {
        put("title", outline.title); put("premise", inputs["premise"].orEmpty()); put("genre", inputs["genre"].orEmpty())
        put("voice", inputs["voice"].orEmpty()); put("outline", markdown)
    }

    suspend fun write(chapter: BookOutline.Chapter): Boolean {
        if (chapter.n in busy) return false
        val of = BookOutline.parts(perChapter)
        busy[chapter.n] = if (of > 1) "part 1 of $of" else ""
        failures.remove(chapter.n)
        val index = outline.chapters.indexOf(chapter)
        val before = if (index > 0) texts[outline.chapters[index - 1].n].orEmpty().takeLast(2000) else ""
        var text = ""
        return try {
            for (part in 1..of) {
                if (of > 1) busy[chapter.n] = "part $part of $of"
                val body = buildJsonObject {
                    put("action", "chapter"); put("book", book)
                    put("chapter", buildJsonObject { put("n", chapter.n); put("title", chapter.title); put("beats", chapter.beats) })
                    put("part", part); put("of", of); put("words", perChapter); put("before", before); put("sofar", text.takeLast(3000))
                }
                val piece = (json.parseToJsonElement(Api.backend.send("POST", "/api/tools/book", body)).jsonObject["text"] as? JsonPrimitive)?.content
                if (piece.isNullOrBlank()) throw ApiError(502)
                text = if (text.isEmpty()) piece else "$text\n\n$piece"
            }
            texts[chapter.n] = text
            persist()
            true
        } catch (e: Exception) {
            failures[chapter.n] = e.message ?: "Writing failed"
            false
        } finally {
            busy.remove(chapter.n)
        }
    }

    /** In order, so each chapter picks up from how the one before it actually ended. */
    suspend fun writeAll() {
        writingAll = true
        stopAll = false
        for (chapter in outline.chapters) {
            if (stopAll) break
            if (texts[chapter.n].orEmpty().isNotBlank()) continue
            if (!write(chapter)) break
        }
        writingAll = false
    }

    fun stop() { stopAll = true }

    private val meta get() = buildJsonObject {
        put("title", listing?.title ?: outline.title)
        put("subtitle", listing?.subtitle ?: outline.subtitle)
        put("author", author.trim().ifEmpty { "Anonymous" })
    }

    val manuscript: String get() {
        val m = meta
        fun field(k: String) = (m[k] as JsonPrimitive).content
        return (listOf("# ${field("title")}", field("subtitle"), "by ${field("author")}") +
            written.map { "## Chapter ${it.n}: ${it.title}\n\n${texts[it.n]}" }).filter { it.isNotEmpty() }.joinToString("\n\n")
    }

    val slug get() = outline.title.lowercase().replace(Regex("""[^\w\s-]"""), "").trim().replace(Regex("""\s+"""), "-").ifEmpty { "book" }

    suspend fun epub(local: Local): ByteArray? {
        if (written.isEmpty() || exporting) return null
        exporting = true
        error = null
        return try {
            val body = buildJsonObject {
                put("action", "epub"); put("meta", meta)
                put("chapters", buildJsonArray { written.forEach { c -> add(buildJsonObject { put("title", "Chapter ${c.n}: ${c.title}"); put("text", texts[c.n].orEmpty()) }) } })
            }
            Api.backend.bytes("/api/tools/book", body).also {
                local.addGeneration(Generation("gen_${newId()}", "book", "book", "Book Studio", outline.title, "markdown", now(),
                    listOf(Generation.Input("Premise", inputs["premise"].orEmpty()), Generation.Input("Chapters", "${written.size} of ${outline.chapters.size}")), manuscript))
            }
        } catch (e: Exception) {
            error = e.message
            null
        } finally {
            exporting = false
        }
    }

    suspend fun makeListing() {
        listingBusy = true
        error = null
        try {
            val sample = written.firstOrNull()?.let { texts[it.n].orEmpty().take(4000) }.orEmpty()
            val reply = json.parseToJsonElement(Api.backend.send("POST", "/api/tools/book", buildJsonObject {
                put("action", "listing"); put("book", book); put("sample", sample)
            })).jsonObject
            listing = json.decodeFromJsonElement(BookListing.serializer(), reply["listing"] as JsonObject)
            persist()
        } catch (e: Exception) {
            error = e.message
        }
        listingBusy = false
    }
}

@Composable
fun BookScreen(markdown: String, inputs: Map<String, String>, onBack: () -> Unit) {
    val context = LocalContext.current
    val local = Local.get(context)
    val model = remember(markdown) { BookModel(context, markdown, inputs) }
    val scope = rememberCoroutineScope()
    var open by remember { mutableStateOf<Int?>(null) }
    var pending by remember { mutableStateOf<ByteArray?>(null) }
    val saveAs = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/epub+zip")) { uri ->
        val bytes = pending ?: return@rememberLauncherForActivityResult
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } } }
                .onFailure { model.error = "Couldn't save: ${it.message}" }
        }
        pending = null
    }
    val chapters = model.outline.chapters

    ListScreen(model.outline.title, loaded = true, refresh = {}, onBack = onBack) {
        if (chapters.isEmpty()) {
            item { Hint("The outline has no \"### Chapter N: …\" headings to write from. Plan the book again.") }
            return@ListScreen
        }
        item {
            Panel {
                Text("${model.written.size}/${chapters.size} chapters · ${"%,d".format(model.totalWords)} words", fontSize = 13.sp, color = Palette.secondary)
                Text("Each chapter is written in order, about ${"%,d".format(model.perChapter)} words, picking up from how the last one ended. The draft is kept on this phone; edit any chapter before you export.",
                    fontSize = 12.sp, color = Palette.muted)
                model.inputs["chapters"]?.toIntOrNull()?.takeIf { chapters.size < it }?.let {
                    Text("The outline came back with ${chapters.size} of the $it chapters asked for. Plan the book again for the full set.", fontSize = 12.sp, color = Palette.warning)
                }
                if (model.writingAll) TextButton(onClick = model::stop) { Text("Stop after this chapter") }
                else if (model.written.size < chapters.size) GlowButton(if (model.written.isEmpty()) "Write every chapter" else "Write the rest") { scope.launch { model.writeAll() } }
            }
        }
        chapters.forEach { c ->
            item("ch${c.n}") {
                val text = model.texts[c.n].orEmpty()
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${c.n}. ${c.title}", Modifier.weight(1f).clickable { open = if (open == c.n) null else c.n }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        val step = model.busy[c.n]
                        if (step != null) {
                            if (step.isNotEmpty()) Text(step, fontSize = 10.sp, color = Palette.muted)
                            CircularProgressIndicator(Modifier.size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
                        } else TextButton(onClick = { scope.launch { model.write(c) } }, enabled = !model.writingAll) { Text(if (text.isBlank()) "Write" else "Rewrite") }
                    }
                    if (text.isNotBlank()) Text("${"%,d".format(BookOutline.words(text))} words", fontSize = 11.sp, color = Palette.muted)
                    model.failures[c.n]?.let { ErrorText(it) }
                    if (open == c.n) {
                        Text(c.beats, fontSize = 12.sp, color = Palette.muted)
                        Field("Chapter ${c.n}", text, { model.texts[c.n] = it; model.persist() }, minLines = 8, placeholder = "Write it yourself, or tap Write.")
                    }
                }
            }
        }
        item {
            Panel {
                SectionLabel("Publish")
                Field("Author name (pen name is fine)", model.author, { model.author = it; model.persist() })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (model.exporting) CircularProgressIndicator(Modifier.size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
                    else TextButton(enabled = model.written.isNotEmpty(), onClick = {
                        scope.launch { model.epub(local)?.let { pending = it; saveAs.launch("${model.slug}.epub") } }
                    }) { Text(if (model.written.size < chapters.size) "EPUB (${model.written.size} ch.)" else "EPUB") }
                    TextButton(enabled = model.written.isNotEmpty(), onClick = { shareText(context, model.manuscript, "${model.slug}.md") }) { Text("Manuscript") }
                    TextButton(enabled = !model.listingBusy, onClick = { scope.launch { model.makeListing() } }) {
                        Text(if (model.listingBusy) "Writing…" else if (model.listing == null) "Store listing" else "Redo listing")
                    }
                }
                model.listing?.let { l ->
                    listOf(
                        "Title" to (l.title ?: model.outline.title), "Subtitle" to l.subtitle.orEmpty(), "Description" to l.description,
                        "Keywords" to l.keywords.joinToString("\n"), "Categories" to l.categories.joinToString("\n"), "Audience" to l.audience.orEmpty(),
                    ).filter { it.second.isNotBlank() }.forEach { (label, value) ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(label, Modifier.weight(1f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Palette.muted)
                            TextButton(onClick = { copyText(context, value) }) { Text("Copy", fontSize = 11.sp) }
                        }
                        SelectionContainer { Text(value, fontSize = 13.sp, color = Palette.secondary) }
                    }
                }
                BookOutline.stores.forEach { (label, url) -> TextButton(onClick = { openInBrowser(context, url) }) { Text(label, fontSize = 13.sp) } }
                Text("These stores have no publishing API, so the last step is yours: upload the EPUB, paste the listing, add a cover, set the price. Mark the book as AI-assisted where the store asks.",
                    fontSize = 11.sp, color = Palette.muted)
            }
        }
        item { ErrorText(model.error) }
    }
}
