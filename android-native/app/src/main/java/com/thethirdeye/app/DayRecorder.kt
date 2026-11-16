package com.thethirdeye.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.IBinder
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Records the day in 45-second chunks. Device noise reduction and a speech gate
 * run before audio is retained or sent to transcription.
 */
object DayRecorder {
    const val CHUNK_MS = 45_000L
    private const val RATE = 16_000

    var recording by mutableStateOf(false)
        private set
    var lastChunkAt by mutableStateOf<Long?>(null)
        private set
    var error by mutableStateOf<String?>(null)
    var onSegment: (suspend (LifeLogDay.Segment) -> Unit)? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var app: Context? = null

    fun start(context: Context) {
        if (recording) return
        val app = context.applicationContext.also { this.app = it }
        app.startForegroundService(Intent(app, DayRecordingService::class.java))
        error = null
        recording = true
        scope.launch { while (recording) chunk() }
    }

    fun stop() {
        recording = false
        app?.let { it.stopService(Intent(it, DayRecordingService::class.java)) }
    }

    private suspend fun chunk() {
        val capture = withContext(Dispatchers.IO) { captureChunk() }
        if (capture == null) {
            error = "Couldn't start the microphone. Check microphone access and try again."
            stop()
            return
        }
        scope.launch { deliver(capture.start, capture.end, capture.wav, capture.silent) }
    }

    private data class Capture(val start: Long, val end: Long, val wav: ByteArray?, val silent: Boolean)

    private fun captureChunk(): Capture? {
        val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        var recorder: AudioRecord? = null
        var ns: NoiseSuppressor? = null
        var agc: AutomaticGainControl? = null
        var aec: AcousticEchoCanceler? = null
        val start = System.currentTimeMillis()
        val pcm = ByteArrayOutputStream()
        try {
            recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min, RATE))
            if (recorder.state != AudioRecord.STATE_INITIALIZED) return null
            ns = if (NoiseSuppressor.isAvailable()) runCatching { NoiseSuppressor.create(recorder.audioSessionId) }.getOrNull() else null
            agc = if (AutomaticGainControl.isAvailable()) runCatching { AutomaticGainControl.create(recorder.audioSessionId) }.getOrNull() else null
            aec = if (AcousticEchoCanceler.isAvailable()) runCatching { AcousticEchoCanceler.create(recorder.audioSessionId) }.getOrNull() else null
            runCatching { ns?.enabled = true }; runCatching { agc?.enabled = true }; runCatching { aec?.enabled = true }
            recorder.startRecording()
            val preRoll = ArrayDeque<ShortArray>()
            val frame = ShortArray(RATE / 10)
            var voiceFrames = 0
            var quietFrames = 0
            var speechOpen = false
            while (recording && System.currentTimeMillis() - start < CHUNK_MS) {
                val count = recorder.read(frame, 0, frame.size)
                if (count <= 0) continue
                val copy = frame.copyOf(count)
                preRoll.addLast(copy)
                while (preRoll.size > 4) preRoll.removeFirst()
                if (speechLike(copy)) {
                    voiceFrames++
                    quietFrames = 0
                    if (!speechOpen && voiceFrames >= 2) {
                        speechOpen = true
                        preRoll.forEach { appendPcm(pcm, it) }
                    } else if (speechOpen) appendPcm(pcm, copy)
                } else {
                    voiceFrames = 0
                    if (speechOpen && ++quietFrames <= 8) appendPcm(pcm, copy)
                    if (quietFrames > 8) speechOpen = false
                }
            }
            val end = System.currentTimeMillis()
            val silent = pcm.size() < RATE * 2 / 3
            return Capture(start, end, if (silent) null else wav(pcm.toByteArray()), silent)
        } catch (_: Exception) {
            return null
        } finally {
            runCatching { recorder?.stop() }
            recorder?.release()
            ns?.release(); agc?.release(); aec?.release()
        }
    }

    private fun speechLike(samples: ShortArray): Boolean {
        if (samples.size < 2) return false
        var energy = 0.0
        var crossings = 0
        var previous = samples[0]
        for (sample in samples) {
            energy += sample.toDouble() * sample
            if ((sample < 0) != (previous < 0)) crossings++
            previous = sample
        }
        val rate = crossings.toDouble() / samples.size
        return sqrt(energy / samples.size) >= 420 && rate in 0.015..0.32
    }

    private fun appendPcm(out: ByteArrayOutputStream, samples: ShortArray) {
        val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        samples.forEach(bytes::putShort)
        out.write(bytes.array())
    }

    private fun wav(pcm: ByteArray): ByteArray {
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + pcm.size).put("WAVE".toByteArray())
            .put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            .putInt(RATE).putInt(RATE * 2).putShort(2).putShort(16)
            .put("data".toByteArray()).putInt(pcm.size)
        return header.array() + pcm
    }

    private suspend fun deliver(start: Long, end: Long, wav: ByteArray?, silent: Boolean) {
        var transcript = ""
        var provider: String? = null
        if (!silent && wav != null) {
            runCatching {
                val reply = json.parseToJsonElement(Api.backend.upload("/api/transcribe", "audio", listOf(UploadFile("speech.wav", "audio/wav", wav)))).jsonObject
                transcript = reply["text"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
                provider = reply["provider"]?.jsonPrimitive?.contentOrNull
            }
        }
        lastChunkAt = end
        onSegment?.invoke(LifeLogDay.Segment("$start", start.toDouble(), end.toDouble(), transcript, false, provider, silent))
    }
}

class DayRecordingService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Life Log recording", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notice = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF4FC3F7.toInt())
            .setContentTitle("Recording your day")
            .setContentText("Life Log is listening. Open The Third Eye to stop.")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        else startForeground(ID, notice)
        return START_NOT_STICKY
    }

    private companion object {
        const val CHANNEL = "lifelog"
        const val ID = 4201
    }
}

/** Today's log: recorded chunks, diary entries and the timeline the server extracts from the transcript. */
object LifeLogToday {
    var day by mutableStateOf(LifeLogDay.empty(today()))
        private set
    var extracting by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
    private var heardSinceExtract = 0

    init {
        DayRecorder.onSegment = { add(it) }
    }

    suspend fun load() {
        val saved = runCatching { DataStore.rows<LifeLogDay>("lifelog_days") }.getOrNull()?.firstOrNull { it.date == today() }
        day = saved ?: if (day.date == today()) day else LifeLogDay.empty(today())
    }

    suspend fun stopRecording() {
        DayRecorder.stop()
        heardSinceExtract = 0
        // The last chunk is still being transcribed; extract once it lands.
        delay(3_000)
        extract()
    }

    suspend fun addDiary(text: String) {
        val clean = text.trim()
        if (clean.isEmpty()) return
        rollOver()
        day = day.copy(diary = day.diary.orEmpty() + LifeLogDay.Diary(java.util.UUID.randomUUID().toString(), System.currentTimeMillis().toDouble(), clean))
        save()
    }

    private suspend fun add(segment: LifeLogDay.Segment) {
        rollOver()
        day = day.copy(segments = day.segments.orEmpty() + segment)
        save()
        if (!segment.transcript.isNullOrBlank() && ++heardSinceExtract >= 3) {
            heardSinceExtract = 0
            extract()
        }
    }

    /** Recording past midnight starts the new day's log, as the website does. */
    private fun rollOver() {
        if (day.date != today()) day = LifeLogDay.empty(today())
    }

    suspend fun extract() {
        val transcript = day.segments.orEmpty().filter { !it.transcript.isNullOrBlank() }
            .joinToString("\n") { "[${clock24(it.startTs)}] ${it.transcript}" }
        if (transcript.length < 20) return
        extracting = true
        try {
            val body = buildJsonObject { put("transcript", transcript); put("date", day.date); put("tzOffset", -java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000) }
            val reply = json.parseToJsonElement(Api.backend.send("POST", "/api/tools/lifelog/extract", body)).jsonObject
            val items = reply["events"]?.let { runCatching { it.jsonArray }.getOrNull() }
            // A failed extraction never replaces the timeline already saved.
            if (reply["error"] != null || items == null) {
                error = reply["error"]?.jsonPrimitive?.contentOrNull ?: "Couldn't build the timeline right now. Your recordings are safe; try again shortly."
                return
            }
            day = day.copy(events = timeline(day, items.map { it.jsonObject }), summary = reply["summary"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() } ?: day.summary)
            error = null
            save()
        } catch (e: Exception) {
            error = "Couldn't reach the server. Your timeline is unchanged."
        } finally {
            extracting = false
        }
    }

    private suspend fun save() {
        try {
            DataStore.insert("lifelog_days", day.row())
        } catch (e: Exception) {
            error = "Couldn't save today's log: ${e.message}"
        }
    }
}

/** Events from the extractor, timed by their HH:MM, else spread across the recorded span (as on the website). */
fun timeline(day: LifeLogDay, items: List<JsonObject>): List<LifeLogDay.Event> {
    val base = day.segments?.firstOrNull()?.startTs ?: System.currentTimeMillis().toDouble()
    val span = maxOf(1.0, (day.segments?.lastOrNull()?.endTs ?: base) - base)
    return items.mapIndexedNotNull { i, e ->
        val title = e["title"]?.jsonPrimitive?.contentOrNull ?: return@mapIndexedNotNull null
        val at = e["time"]?.jsonPrimitive?.contentOrNull?.let { atTime(day.date, it) } ?: (base + i.toDouble() / maxOf(1, items.size) * span)
        LifeLogDay.Event(java.util.UUID.randomUUID().toString(), at, title, e["kind"]?.jsonPrimitive?.contentOrNull ?: "other", e["detail"]?.jsonPrimitive?.contentOrNull)
    }.sortedBy { it.ts ?: 0.0 }
}

private fun atTime(date: String, hhmm: String): Double? = runCatching {
    val (h, m) = hhmm.split(":").map { it.trim().toInt() }
    LocalDate.parse(date).atTime(h, m).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli().toDouble()
}.getOrNull()

/** HH:MM in 24-hour time, the stamp the extractor reads. */
fun clock24(ms: Double?): String = ms?.let {
    val t = Instant.ofEpochMilli(it.toLong()).atZone(ZoneId.systemDefault()).toLocalTime()
    "%02d:%02d".format(t.hour, t.minute)
} ?: ""

@Composable
fun LifeLogTodayScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var diary by remember { mutableStateOf("") }
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) DayRecorder.start(context) else DayRecorder.error = "Allow the microphone for The Third Eye to record your day."
    }
    LaunchedEffect(Unit) { LifeLogToday.load() }

    ListScreen("Today", loaded = true, refresh = { LifeLogToday.load() }, onBack = onBack) {
        item { ErrorText(LifeLogToday.error ?: DayRecorder.error) }
        item {
            Panel {
                Row(Modifier.fillMaxWidth()) {
                    TextButton(onClick = {
                        when {
                            DayRecorder.recording -> scope.launch { LifeLogToday.stopRecording() }
                            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> DayRecorder.start(context)
                            else -> askMic.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }) {
                        Text(if (DayRecorder.recording) "Stop recording" else "Record my day", color = if (DayRecorder.recording) Palette.red else Palette.blue, fontWeight = FontWeight.Medium)
                    }
                    if (DayRecorder.recording) {
                        Text(DayRecorder.lastChunkAt?.let { "last saved ${clock(it.toDouble())}" } ?: "listening…", fontSize = 12.sp, color = Palette.muted, modifier = Modifier.align(androidx.compose.ui.Alignment.CenterVertically))
                    }
                }
                OutlinedTextField(diary, { diary = it }, Modifier.fillMaxWidth(), placeholder = { Text("Write in your diary…") })
                Row {
                    TextButton(onClick = { val text = diary; diary = ""; scope.launch { LifeLogToday.addDiary(text) } }, enabled = diary.isNotBlank()) { Text("Add to diary") }
                    TextButton(onClick = { scope.launch { LifeLogToday.extract() } }, enabled = !LifeLogToday.extracting) {
                        Text(if (LifeLogToday.extracting) "Building the timeline…" else "Rebuild the timeline")
                    }
                }
                Text("Recording runs with the screen off. Each 45-second chunk is transcribed and the audio is deleted; silence is skipped.", fontSize = 12.sp, color = Palette.muted)
            }
        }
        daySections(LifeLogToday.day)
    }
}

/** A day's summary, timeline, diary and transcript, shared by Today and a past day. */
fun LazyListScope.daySections(day: LifeLogDay) {
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
