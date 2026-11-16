package com.thethirdeye.app

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import kotlin.math.sqrt

// Native voice: device noise reduction and a speech gate run before audio is
// sent to the transcription API. Listening stops while a reply is spoken.
class Voice(private val context: Context) {
    var listening by mutableStateOf(false)
        private set
    var speaking by mutableStateOf(false)
        private set
    var partial by mutableStateOf("")
        private set
    var error by mutableStateOf<String?>(null)

    private val main = Handler(Looper.getMainLooper())
    @Volatile private var captureActive = false
    @Volatile private var activeRecorder: AudioRecord? = null
    private val requests = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var transcriptionJob: Job? = null
    private var onFinal: ((String) -> Unit)? = null
    private var onSpoken: (() -> Unit)? = null
    private var isReady = false
    private var queued: Pair<String, (() -> Unit)?>? = null
    private var onStarted: (() -> Unit)? = null
    private val tts: TextToSpeech = TextToSpeech(context) { status ->
        if (status == TextToSpeech.SUCCESS) ready() else queued?.second?.invoke()
    }

    /**
     * Speaks as soon as the engine has started, for a line said the moment a
     * screen opens. [started] runs only if it is actually heard; [then] runs
     * either way.
     */
    fun speakWhenReady(text: String, started: () -> Unit, then: (() -> Unit)? = null) {
        onStarted = started
        if (isReady) speak(text, then = then) else queued = text to then
    }

    private fun ready() {
        isReady = true
        tts.language = Locale.getDefault()
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { main.post { onStarted?.invoke(); onStarted = null } }
            override fun onDone(utteranceId: String?) { main.post { spoken() } }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { main.post { spoken() } }
        })
        queued?.let { (text, then) -> queued = null; speak(text, then = then) }
    }

    private fun spoken() {
        speaking = false
        val next = onSpoken
        onSpoken = null
        next?.invoke()
    }

    /** Captures only speech-like segments, then sends the gated WAV to transcription. */
    fun listen(onFinal: (String) -> Unit) {
        if (listening) return
        stopSpeaking()
        error = null
        partial = "Listening…"
        this.onFinal = onFinal
        listening = true
        captureActive = true
        Thread({ captureAndTranscribe() }, "third-eye-speech-capture").start()
    }

    private fun finish(text: String?) {
        if (!listening) return
        listening = false
        partial = ""
        transcriptionJob = null
        val deliver = onFinal
        onFinal = null
        if (text != null) deliver?.invoke(text.trim())
    }

    fun stopListening() {
        captureActive = false
        runCatching { activeRecorder?.stop() }
        transcriptionJob?.cancel()
        transcriptionJob = null
        onFinal = null
        listening = false
        partial = ""
    }

    /** How a voice sounds: a language tag such as en-GB, its gender, and its own pitch and speed. */
    data class Accent(val tag: String, val pitch: Float, val rate: Float, val gender: String = "")

    private val chosen = mutableMapOf<Accent, android.speech.tts.Voice>()

    fun speak(text: String, accent: Accent = JARVIS, then: (() -> Unit)? = null) {
        val clean = speakable(text)
        if (clean.isEmpty()) { then?.invoke(); return }
        stopListening()
        onSpoken = then
        speaking = true
        tts.language = Locale.forLanguageTag(accent.tag)
        voiceFor(accent)?.let { tts.voice = it }
        tts.setPitch(accent.pitch)
        tts.setSpeechRate(accent.rate)
        // No speech engine (or not ready yet): carry on silently rather than wait for an end that never comes.
        if (tts.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "reply") != TextToSpeech.SUCCESS) spoken()
    }

    fun stopSpeaking() {
        onSpoken = null
        tts.stop()
        speaking = false
    }

    fun release() {
        stopListening()
        requests.cancel()
        tts.shutdown()
    }

    private fun captureAndTranscribe() {
        val rate = 16_000
        val frameSize = 320 // 20 ms
        var recorder: AudioRecord? = null
        var ns: NoiseSuppressor? = null
        var agc: AutomaticGainControl? = null
        var aec: AcousticEchoCanceler? = null
        val speech = ByteArrayOutputStream()
        try {
            val minBuffer = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuffer, rate * 2))
            check(recorder.state == AudioRecord.STATE_INITIALIZED) { "Microphone unavailable" }
            activeRecorder = recorder
            ns = if (NoiseSuppressor.isAvailable()) runCatching { NoiseSuppressor.create(recorder.audioSessionId) }.getOrNull() else null
            agc = if (AutomaticGainControl.isAvailable()) runCatching { AutomaticGainControl.create(recorder.audioSessionId) }.getOrNull() else null
            aec = if (AcousticEchoCanceler.isAvailable()) runCatching { AcousticEchoCanceler.create(recorder.audioSessionId) }.getOrNull() else null
            runCatching { ns?.enabled = true }
            runCatching { agc?.enabled = true }
            runCatching { aec?.enabled = true }
            recorder.startRecording()

            val preRoll = ArrayDeque<ShortArray>()
            val frame = ShortArray(frameSize)
            var activeFrames = 0
            var quietFrames = 0
            var speechStarted = false
            val startAt = System.currentTimeMillis()
            while (captureActive && System.currentTimeMillis() - startAt < MAX_CAPTURE_MS) {
                val count = recorder.read(frame, 0, frame.size)
                if (count <= 0) continue
                val copy = frame.copyOf(count)
                preRoll.addLast(copy)
                while (preRoll.size > PRE_ROLL_FRAMES) preRoll.removeFirst()
                if (speechLike(copy)) {
                    activeFrames++
                    quietFrames = 0
                    if (!speechStarted && activeFrames >= VOICE_START_FRAMES) {
                        speechStarted = true
                        preRoll.forEach { appendPcm(speech, it) }
                    } else if (speechStarted) appendPcm(speech, copy)
                } else {
                    activeFrames = 0
                    if (speechStarted && ++quietFrames <= POST_ROLL_FRAMES) appendPcm(speech, copy)
                    if (quietFrames > POST_ROLL_FRAMES) break
                }
            }
        } catch (e: Exception) {
            if (captureActive) main.post { error = e.message ?: "Couldn't start the microphone." }
        } finally {
            captureActive = false
            runCatching { recorder?.stop() }
            recorder?.release()
            ns?.release(); agc?.release(); aec?.release()
            activeRecorder = null
        }
        if (!listening) return
        if (speech.size() < MIN_SPEECH_BYTES) {
            main.post { finish("") }
            return
        }
        main.post { partial = "Transcribing…" }
        transcriptionJob = requests.launch {
            try {
                val wav = wav(speech.toByteArray(), rate)
                val response = Api.backend.upload("/api/transcribe", "audio", listOf(UploadFile("speech.wav", "audio/wav", wav)))
                val text = json.parseToJsonElement(response).jsonObject["text"]?.jsonPrimitive?.contentOrNull.orEmpty().trim()
                main.post { if (listening) finish(text) }
            } catch (e: Exception) {
                main.post {
                    if (listening) {
                        error = e.message ?: "Speech transcription failed. Try again."
                        finish("")
                    }
                }
            }
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
        val rms = sqrt(energy / samples.size)
        val crossingRate = crossings.toDouble() / samples.size
        return rms >= VOICE_RMS_THRESHOLD && crossingRate in 0.015..0.32
    }

    private fun appendPcm(output: ByteArrayOutputStream, samples: ShortArray) {
        val bytes = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        samples.forEach(bytes::putShort)
        output.write(bytes.array())
    }

    private fun wav(pcm: ByteArray, sampleRate: Int): ByteArray {
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + pcm.size).put("WAVE".toByteArray())
            .put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
            .putInt(sampleRate).putInt(sampleRate * 2).putShort(2).putShort(16)
            .put("data".toByteArray()).putInt(pcm.size)
        return header.array() + pcm
    }

    // Remembered once found; the engine lists no voices until it has started.
    private fun voiceFor(accent: Accent): android.speech.tts.Voice? = chosen[accent] ?: run {
        val all = tts.voices.orEmpty()
        val name = pickVoice(all.map { VoiceInfo(it.name, it.locale.toLanguageTag(), !it.isNetworkConnectionRequired, it.quality) }, accent)
        all.firstOrNull { it.name == name }?.also { chosen[accent] = it }
    }

    data class VoiceInfo(val name: String, val tag: String, val local: Boolean, val quality: Int)

    companion object {
        private const val MAX_CAPTURE_MS = 30_000L
        private const val VOICE_RMS_THRESHOLD = 420.0
        private const val VOICE_START_FRAMES = 5
        private const val PRE_ROLL_FRAMES = 20
        private const val POST_ROLL_FRAMES = 40
        private const val MIN_SPEECH_BYTES = 16_000 * 2 / 3
        /** JARVIS's own voice: the British man the website and the agent roll-call use (frontend/src/lib/systems.ts). */
        val JARVIS = Accent("en-GB", 0.92f, 1f, "male")

        // Engines rarely say a voice's gender. Google's names either carry it ("en-gb-x-rjs#male_1-local")
        // or are known by their code (en-GB and en-US); the explicit word wins over the code.
        private val SAYS_FEMALE = Regex("""(?<![a-z])female(?![a-z])""", RegexOption.IGNORE_CASE)
        private val SAYS_MALE = Regex("""(?<![a-z])male(?![a-z])""", RegexOption.IGNORE_CASE)
        private val MALE_CODE = Regex("""[-_](gbb|gbd|rjs|iob|iol|iom|tpd)([-_#]|$)""", RegexOption.IGNORE_CASE)
        private val FEMALE_CODE = Regex("""[-_](gba|gbc|gbg|fis|iog|sfg|tpc|tpf)([-_#]|$)""", RegexOption.IGNORE_CASE)

        fun genderOf(name: String): String? = when {
            SAYS_FEMALE.containsMatchIn(name) -> "female"
            SAYS_MALE.containsMatchIn(name) -> "male"
            FEMALE_CODE.containsMatchIn(name) -> "female"
            MALE_CODE.containsMatchIn(name) -> "male"
            else -> null
        }

        /** The best installed voice for an accent: its language, then its gender, then on-device, then quality. */
        fun pickVoice(voices: List<VoiceInfo>, accent: Accent): String? {
            val tag = accent.tag.lowercase()
            val lang = voices.filter { it.tag.replace('_', '-').lowercase() == tag }
            val gendered = if (accent.gender.isEmpty()) emptyList() else lang.filter { genderOf(it.name) == accent.gender }
            return (gendered.ifEmpty { lang }).maxWithOrNull(compareBy<VoiceInfo> { it.local }.thenBy { it.quality })?.name
        }

        /** Markdown and links read badly aloud: speak the words only. */
        fun speakable(text: String): String = text
            .replace(Regex("""\[([^\]]+)\]\([^)]+\)"""), "$1")
            .replace(Regex("""https?://\S+"""), "")
            .replace(Regex("""[*_`#>|]"""), "")
            .trim()
    }
}

// Only a plain answer counts. Any no word blocks a yes, and one at the start
// cancels; a yes must be nothing but agreeing words, so "yes, but don't send"
// is never an approval.
enum class VoiceAnswer {
    Yes, No;

    companion object {
        private val no = setOf("no", "nope", "nah", "cancel", "dont", "stop", "nahi", "mat", "not", "but", "wait")
        private val core = setOf("yes", "yeah", "yep", "yup", "sure", "ok", "okay", "confirm", "approve", "haan", "ha", "ji", "go", "do", "send")
        private val filler = setOf("ahead", "it", "please", "now")

        fun of(said: String): VoiceAnswer? {
            val words = said.lowercase().replace(Regex("['’]"), "").split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
            if (words.isEmpty() || words.size > 4) return null
            if (words.any { it in no }) return if (words[0] in no && words[0] !in setOf("but", "wait", "not")) No else null
            return if (words.all { it in core || it in filler } && words.any { it in core }) Yes else null
        }
    }
}
