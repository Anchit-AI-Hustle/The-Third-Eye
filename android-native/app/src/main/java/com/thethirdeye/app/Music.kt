package com.thethirdeye.app

import android.content.Context
import android.media.MediaPlayer
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoFixHigh
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.net.URLEncoder
import java.util.Base64

/** Music Studio, as on the website (components/studio/MusicStudio), sent as /api/tools/music reads it. */
data class MusicForm(
    val description: String = "",
    val title: String = "",
    val genre: String = "",
    val subgenre: String = "",
    val mood: String = "",
    val tempo: Int = 120,
    val energy: Int = 6,
    val duration: Int = 30,
    val structure: String = "",
    val instruments: String = "",
    val artistInspiration: String = "",
    val vocals: Boolean = true,
    val vocalStyle: String = "",
    val vocalLanguage: String = "English",
    val vocalIntensity: Int = 5,
    val vocalEffects: String = "",
    val lyricsMode: String = "auto",
    val lyricsText: String = "",
) {
    fun payload(): JsonObject = buildJsonObject {
        put("description", description); put("title", title); put("genre", genre); put("subgenre", subgenre); put("mood", mood)
        put("tempo", tempo); put("energy", energy); put("duration", duration); put("structure", structure); put("instruments", instruments)
        put("artistInspiration", artistInspiration); put("vocals", vocals); put("vocalStyle", vocalStyle); put("vocalLanguage", vocalLanguage)
        put("vocalIntensity", vocalIntensity); put("vocalEffects", vocalEffects); put("lyricsMode", lyricsMode); put("lyricsText", lyricsText)
    }

    /** /api/tools/music/infer's fields; a value it left out, or out of range, keeps what is there. */
    fun inferred(x: JsonObject): MusicForm {
        fun text(key: String, old: String) = (x[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() } ?: old
        fun number(key: String, range: IntRange, old: Int) = (x[key] as? JsonPrimitive)?.doubleOrNull?.let { Math.round(it).toInt() }?.takeIf { it in range } ?: old
        return copy(
            description = text("description", description), title = text("title", title), genre = text("genre", genre),
            subgenre = text("subgenre", subgenre), mood = text("mood", mood), structure = text("structure", structure),
            instruments = text("instruments", instruments), artistInspiration = text("artistInspiration", artistInspiration),
            vocalStyle = text("vocalStyle", vocalStyle), vocalLanguage = text("vocalLanguage", vocalLanguage),
            vocalEffects = text("vocalEffects", vocalEffects),
            tempo = number("tempo", Music.BPM, tempo), energy = number("energy", 1..10, energy),
            duration = number("duration", 10..120, duration), vocalIntensity = number("vocalIntensity", 1..10, vocalIntensity),
            vocals = (x["vocals"] as? JsonPrimitive)?.booleanOrNull ?: vocals,
        )
    }
}

object Music {
    val BPM = 40..400
    val genres = listOf(
        "Hard Techno", "Psytrance", "Full-on psytrance", "Dark psytrance", "Hi-tech psytrance", "Hardtek", "Acid techno", "Rap",
        "Hip-hop", "Trap", "Drill", "Boom bap", "Techno", "House", "Drum & bass", "Dubstep", "Pop", "Rock", "R&B", "Lo-fi",
        "Ambient", "Cinematic", "Bollywood", "Afrobeats",
    )
    val moods = listOf("Uplifting", "Dark", "Hypnotic", "Driving", "Relentless", "Psychedelic", "Euphoric", "Aggressive", "Chill", "Melancholic", "Epic", "Dreamy", "Confident", "Gritty")
    val durations = listOf(30 to "30 s", 60 to "1 min", 120 to "2 min", 300 to "5 min", 1800 to "30 min", 3600 to "1 hour")

    /** An inline data: URL's bytes and file extension, or null for anything else. */
    fun decodeDataUrl(audio: String): Pair<ByteArray, String>? {
        if (!audio.startsWith("data:")) return null
        val comma = audio.indexOf(',').takeIf { it > 0 } ?: return null
        val header = audio.substring(0, comma)
        val bytes = runCatching { Base64.getDecoder().decode(audio.substring(comma + 1)) }.getOrNull() ?: return null
        val ext = when {
            "wav" in header -> "wav"
            "mp4" in header || "m4a" in header -> "m4a"
            else -> "mp3"
        }
        return bytes to ext
    }

    /** A song's audio as a playable file: inline data: URLs, this server's stored songs and provider URLs. */
    suspend fun file(context: Context, audio: String, key: String): File {
        val (bytes, ext) = decodeDataUrl(audio) ?: run {
            val data = Api.backend.bytes(audio)
            val named = Uri.parse(audio).lastPathSegment?.substringAfterLast('.', "")?.lowercase()
            val ext = when {
                named in setOf("wav", "mp3", "m4a", "flac", "ogg") -> named!!
                data.size > 4 && String(data, 0, 4) == "RIFF" -> "wav"
                else -> "mp3"
            }
            data to ext
        }
        return withContext(Dispatchers.IO) {
            File(context.cacheDir, "music-${key.filter(Char::isLetterOrDigit).take(40)}.$ext").apply { writeBytes(bytes) }
        }
    }
}

@Serializable
data class MusicTrack(val id: String, val title: String? = null, val description: String? = null, val lyrics: String? = null, val audio_url: String? = null, val created_at: String? = null)

class MusicPlayer(private val context: Context) {
    var playing by mutableStateOf<String?>(null)
        private set
    var loading by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
    val files = mutableStateMapOf<String, File>()
    private var player: MediaPlayer? = null

    suspend fun file(key: String, audio: String): File? {
        files[key]?.let { return it }
        loading = key
        return try {
            Music.file(context, audio, key).also { files[key] = it }
        } catch (e: Exception) {
            error = "Couldn't load the audio: ${e.message}"
            null
        } finally {
            loading = null
        }
    }

    suspend fun toggle(key: String, audio: String, loop: Boolean = false) {
        if (playing == key) { stop(); return }
        val file = file(key, audio) ?: return
        stop()
        try {
            player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                isLooping = loop
                setOnCompletionListener { if (!loop) this@MusicPlayer.playing = null }
                prepare()
                start()
            }
            playing = key
        } catch (e: Exception) {
            error = "This audio won't play here: ${e.message}"
        }
    }

    fun stop() {
        player?.release()
        player = null
        playing = null
    }
}

class MusicModel(private val local: Local) {
    var form by mutableStateOf(MusicForm())
    var composing by mutableStateOf(false)
        private set
    var status by mutableStateOf("")
        private set
    var filling by mutableStateOf(false)
        private set
    var suggesting by mutableStateOf<String?>(null)
        private set
    var audioUrl by mutableStateOf<String?>(null)
        private set
    var lyrics by mutableStateOf("")
        private set
    var loop by mutableStateOf(false)
        private set
    var tracks by mutableStateOf<List<MusicTrack>>(emptyList())
        private set
    var libraryLoaded by mutableStateOf(false)
        private set
    var note by mutableStateOf<String?>(null)
    var error by mutableStateOf<String?>(null)
    var made = MusicForm()
        private set
    private val previous = mutableMapOf<String, List<String>>()

    private fun obj(text: String) = runCatching { json.parseToJsonElement(text).jsonObject }.getOrDefault(JsonObject(emptyMap()))
    private fun JsonObject.str(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

    suspend fun autoFill() {
        if (form.description.isBlank() || filling) return
        filling = true
        error = null
        try {
            val reply = obj(Api.backend.send("POST", "/api/tools/music/infer", buildJsonObject { put("description", form.description) }))
            (reply["fields"] as? JsonObject)?.let { form = form.inferred(it) }
        } catch (e: Exception) {
            error = e.message
        }
        filling = false
    }

    suspend fun suggest(name: String, get: (MusicForm) -> String, set: MusicForm.(String) -> MusicForm) {
        if (suggesting != null) return
        suggesting = name
        error = null
        val value = get(form)
        try {
            val body = buildJsonObject {
                put("field", name); put("value", value); put("action", if (value.isBlank()) "suggest" else "new")
                put("previous", buildJsonArray { previous[name].orEmpty().forEach { add(JsonPrimitive(it)) } })
                put("context", JsonObject(form.payload() - "lyricsText"))
            }
            obj(Api.backend.send("POST", "/api/tools/music/suggest", body)).str("suggestion")?.takeIf { it.isNotBlank() }?.let {
                previous[name] = (previous[name].orEmpty() + value).filter(String::isNotBlank).takeLast(6)
                form = form.set(it)
            }
        } catch (e: Exception) {
            error = e.message
        }
        suggesting = null
    }

    suspend fun generate() {
        if (composing) return
        made = form
        composing = true
        error = null; note = null; audioUrl = null; lyrics = ""
        status = "Writing and composing the track. This can take a minute or two."
        try {
            val reply = obj(Api.backend.send("POST", "/api/tools/music", form.payload()))
            lyrics = reply.str("lyrics").orEmpty()
            loop = (reply["loop"] as? JsonPrimitive)?.booleanOrNull == true
            if ((reply["configured"] as? JsonPrimitive)?.booleanOrNull == false) return fail(reply.str("note") ?: "Music generation isn't set up on the server.")
            note = listOfNotNull(
                reply.str("elevenLabsError")?.let { "ElevenLabs couldn't make this one (${it.take(160)}), so a backup model is used." },
                "Couldn't generate sung vocals, so this is an instrumental version (lyrics below).".takeIf { (reply["fellBackToInstrumental"] as? JsonPrimitive)?.booleanOrNull == true },
                reply.str("note")?.takeIf { reply.str("provider") == "code" },
                (reply["clipSeconds"] as? JsonPrimitive)?.doubleOrNull?.let { "Long session: a ${it.toInt()} s clip loops to fill it." }?.takeIf { loop },
            ).joinToString(" ").ifBlank { null }
            val done = (reply["done"] as? JsonPrimitive)?.booleanOrNull == true
            val url = reply.str("audioUrl")
            val job = reply.str("jobId")
            when {
                done && url != null -> ready(url)
                job != null -> poll(job)
                else -> fail("No song came back. Try again.")
            }
        } catch (e: Exception) {
            fail(e.message ?: "Generation failed.")
        }
    }

    private suspend fun poll(job: String) {
        status = "Composing audio. This can take up to a minute."
        val giveUp = System.currentTimeMillis() + 600_000
        while (System.currentTimeMillis() < giveUp) {
            delay(3000)
            val reply = runCatching { obj(Api.backend.send("GET", "/api/tools/music?id=${URLEncoder.encode(job, "UTF-8")}")) }.getOrNull() ?: continue
            val state = reply.str("status").orEmpty()
            if (state.isNotEmpty()) status = "Composing audio ($state)"
            val url = reply.str("audioUrl")
            if (state == "succeeded" && url != null) return ready(url)
            if (state == "failed" || state == "canceled" || reply.str("error") != null) return fail(reply.str("error") ?: "Generation failed.")
        }
        fail("Still not finished after 10 minutes. The provider may be stuck; try again.")
    }

    private fun fail(message: String) {
        composing = false
        status = ""
        error = message
    }

    private suspend fun ready(url: String) {
        audioUrl = url
        composing = false
        status = ""
        val m = made
        val title = m.title.ifBlank { m.description.take(60) }
        try {
            DataStore.insert("music_tracks", buildJsonObject {
                put("id", newId()); put("title", title); put("description", m.description); put("lyrics", lyrics)
                put("audio_url", url); put("created_at", now())
                put("params", buildJsonObject { put("genres", m.genre); put("moods", m.mood); put("tempo", m.tempo); put("vocals", m.vocals); put("duration", m.duration) })
            })
        } catch (e: Exception) {
            note = "Made, but not saved to your library: ${e.message}"
        }
        val inputs = listOf(
            "Genres" to m.genre, "Moods" to m.mood, "Tempo" to "${m.tempo} BPM", "Structure" to m.structure,
            "Instruments" to m.instruments, "Artist vibe" to m.artistInspiration,
            "Vocals" to if (m.vocals) "${m.vocalStyle} (${m.vocalIntensity}/10)" else "instrumental",
            "Vocal languages" to m.vocalLanguage, "Vocal effects" to m.vocalEffects,
        ).filter { it.second.isNotBlank() }.map { Generation.Input(it.first, it.second) }
        local.addGeneration(Generation("gen_${newId()}", "music", null, "Music Studio", title, "audio", now(), inputs, url))
    }

    suspend fun loadLibrary() {
        try {
            tracks = DataStore.rows<MusicTrack>("music_tracks")
        } catch (e: Exception) {
            error = e.message
        }
        libraryLoaded = true
    }

    suspend fun delete(track: MusicTrack) {
        try {
            DataStore.delete("music_tracks", track.id)
            tracks = tracks.filter { it.id != track.id }
        } catch (e: Exception) {
            error = e.message
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val model = remember { MusicModel(Local.get(context)) }
    val player = remember { MusicPlayer(context) }
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var saving by remember { mutableStateOf<File?>(null) }
    val saveAs = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/*")) { uri ->
        val file = saving ?: return@rememberLauncherForActivityResult
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(file.readBytes()) } } }
                .onFailure { player.error = "Couldn't save: ${it.message}" }
        }
        saving = null
    }
    DisposableEffect(Unit) { onDispose { player.stop() } }
    LaunchedEffect(tab) { if (tab == 1) model.loadLibrary() }

    @Composable
    fun Controls(key: String, audio: String, name: String, loop: Boolean = false) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (player.loading == key) CircularProgressIndicator(Modifier.size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
            else TextButton(onClick = { scope.launch { player.toggle(key, audio, loop) } }) { Text(if (player.playing == key) "Stop" else "Play") }
            TextButton(onClick = {
                scope.launch {
                    val file = player.file(key, audio) ?: return@launch
                    saving = file
                    saveAs.launch("${name.ifBlank { "track" }}.${file.extension}")
                }
            }) { Text("Save") }
        }
    }

    @Composable
    fun Suggest(label: String, name: String, get: (MusicForm) -> String, set: MusicForm.(String) -> MusicForm, chips: List<String> = emptyList()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Field(label, get(model.form), { model.form = model.form.set(it) }, Modifier.weight(1f))
                if (model.suggesting == name) CircularProgressIndicator(Modifier.padding(14.dp).size(20.dp), color = Palette.blue, strokeWidth = 2.dp)
                else IconButton(onClick = { scope.launch { model.suggest(name, get, set) } }, enabled = model.suggesting == null) {
                    Icon(Icons.Outlined.AutoFixHigh, "Suggest ${label.lowercase()}", tint = Palette.blue)
                }
            }
            if (chips.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(chips) { chip ->
                    FilterChip(selected = get(model.form) == chip, onClick = { model.form = model.form.set(chip) }, label = { Text(chip, fontSize = 11.sp) })
                }
            }
        }
    }

    ListScreen("Music Studio", loaded = tab == 0 || model.libraryLoaded, refresh = { if (tab == 1) model.loadLibrary() }, onBack = onBack) {
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("Create", "Library").forEachIndexed { i, label ->
                    SegmentedButton(selected = tab == i, onClick = { tab = i }, shape = SegmentedButtonDefaults.itemShape(i, 2)) { Text(label) }
                }
            }
        }
        item { ErrorText(model.error ?: player.error) }
        if (tab == 0) {
            item {
                Panel {
                    SectionLabel("Describe the song")
                    Field("Description", model.form.description, { model.form = model.form.copy(description = it) }, minLines = 3,
                        placeholder = "A dark, driving hard techno track for a 4am warehouse")
                    TextButton(onClick = { scope.launch { model.autoFill() } }, enabled = !model.filling && model.form.description.isNotBlank()) {
                        Text(if (model.filling) "Filling…" else "Fill the rest from this")
                    }
                }
            }
            item {
                Panel {
                    SectionLabel("Sound")
                    Suggest("Title", "title", { it.title }, { copy(title = it) })
                    Suggest("Genre", "genre", { it.genre }, { copy(genre = it) }, Music.genres)
                    Suggest("Subgenre", "subgenre", { it.subgenre }, { copy(subgenre = it) })
                    Suggest("Mood", "mood", { it.mood }, { copy(mood = it) }, Music.moods)
                    Text("Tempo: ${model.form.tempo} BPM", fontSize = 13.sp)
                    Slider(model.form.tempo.toFloat(), { model.form = model.form.copy(tempo = it.toInt()) }, valueRange = Music.BPM.first.toFloat()..Music.BPM.last.toFloat())
                    Text("Energy: ${model.form.energy}/10", fontSize = 13.sp)
                    Slider(model.form.energy.toFloat(), { model.form = model.form.copy(energy = it.toInt()) }, valueRange = 1f..10f, steps = 8)
                    val lengths = Music.durations.map { it.second }
                    Choice("Length", lengths, Music.durations.firstOrNull { it.first == model.form.duration }?.second ?: "${model.form.duration} s") { pick ->
                        model.form = model.form.copy(duration = Music.durations.first { it.second == pick }.first)
                    }
                    Suggest("Structure", "structure", { it.structure }, { copy(structure = it) })
                    Suggest("Instruments", "instruments", { it.instruments }, { copy(instruments = it) })
                    Suggest("Artist vibe", "artistInspiration", { it.artistInspiration }, { copy(artistInspiration = it) })
                }
            }
            item {
                Panel {
                    SectionLabel("Vocals")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Sung vocals", Modifier.weight(1f))
                        Switch(model.form.vocals, { model.form = model.form.copy(vocals = it) })
                    }
                    if (model.form.vocals) {
                        Suggest("Vocal style", "vocalStyle", { it.vocalStyle }, { copy(vocalStyle = it) })
                        Suggest("Language", "vocalLanguage", { it.vocalLanguage }, { copy(vocalLanguage = it) })
                        Text("Intensity: ${model.form.vocalIntensity}/10", fontSize = 13.sp)
                        Slider(model.form.vocalIntensity.toFloat(), { model.form = model.form.copy(vocalIntensity = it.toInt()) }, valueRange = 1f..10f, steps = 8)
                        Suggest("Vocal effects", "vocalEffects", { it.vocalEffects }, { copy(vocalEffects = it) })
                        val modes = listOf("auto" to "Written for me", "manual" to "My own", "none" to "None")
                        Choice("Lyrics", modes.map { it.second }, modes.first { it.first == model.form.lyricsMode }.second) { pick ->
                            model.form = model.form.copy(lyricsMode = modes.first { it.second == pick }.first)
                        }
                        if (model.form.lyricsMode == "manual") Field("Your lyrics", model.form.lyricsText, { model.form = model.form.copy(lyricsText = it) }, minLines = 4)
                    }
                }
            }
            item {
                if (model.composing) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                    Text(model.status, fontSize = 13.sp, color = Palette.secondary)
                } else GlowButton("Generate track", enabled = model.form.description.isNotBlank()) { scope.launch { model.generate() } }
            }
            model.note?.let { item { Text(it, fontSize = 12.sp, color = Palette.secondary) } }
            model.audioUrl?.let { url ->
                item("result") {
                    val name = model.made.title.ifBlank { "track" }
                    Panel {
                        SectionLabel(name)
                        Controls("new", url, name, model.loop)
                        if (model.lyrics.isNotBlank()) SelectionContainer { Text(model.lyrics, fontSize = 13.sp, color = Palette.secondary) }
                    }
                }
            }
        } else {
            item { SectionLabel("Your tracks (${model.tracks.size})") }
            if (model.libraryLoaded && model.tracks.isEmpty()) item { Hint("No tracks yet. Create one and it'll appear here.") }
            model.tracks.forEach { track ->
                item(track.id) {
                    Column(Modifier.card()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(track.title?.ifBlank { null } ?: "Untitled", Modifier.weight(1f), fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 1)
                            Text(isoDate(track.created_at), fontSize = 11.sp, color = Palette.muted)
                            IconButton(onClick = { scope.launch { model.delete(track) } }) { Icon(Icons.Outlined.Delete, "Delete", tint = Palette.muted) }
                        }
                        track.audio_url?.takeIf { it.isNotBlank() }?.let { Controls(track.id, it, track.title.orEmpty()) }
                    }
                }
            }
        }
    }
}
