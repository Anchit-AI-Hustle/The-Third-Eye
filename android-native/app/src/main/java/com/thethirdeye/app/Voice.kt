package com.thethirdeye.app

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.runtime.mutableStateOf
import java.util.Locale

// Native voice: Android's speech recognizer for what the person says (it ends
// on a pause by itself), and the system text-to-speech for replies. Listening
// stops while a reply is spoken so the assistant never hears itself.
class Voice(private val context: Context) : RecognitionListener {
    var listening by mutableStateOf(false)
        private set
    var speaking by mutableStateOf(false)
        private set
    var partial by mutableStateOf("")
        private set
    var error by mutableStateOf<String?>(null)

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
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

    /** Listens until the person pauses, then hands over what they said (empty when they said nothing). */
    fun listen(onFinal: (String) -> Unit) {
        if (listening) return
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            error = "Speech recognition isn't available on this phone."
            return
        }
        stopSpeaking()
        error = null
        partial = ""
        this.onFinal = onFinal
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also { it.setRecognitionListener(this); recognizer = it }
        listening = true
        r.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag()),
        )
    }

    private fun finish(text: String?) {
        if (!listening) return
        listening = false
        val deliver = onFinal
        onFinal = null
        if (text != null) deliver?.invoke(text.trim())
    }

    fun stopListening() {
        recognizer?.cancel()
        onFinal = null
        listening = false
    }

    /** How a voice sounds: a language tag such as en-GB, with its own pitch and speed. */
    data class Accent(val tag: String, val pitch: Float, val rate: Float)

    fun speak(text: String, accent: Accent? = null, then: (() -> Unit)? = null) {
        val clean = speakable(text)
        if (clean.isEmpty()) { then?.invoke(); return }
        stopListening()
        onSpoken = then
        speaking = true
        tts.language = accent?.let { Locale.forLanguageTag(it.tag) } ?: Locale.getDefault()
        tts.setPitch(accent?.pitch ?: 1f)
        tts.setSpeechRate(accent?.rate ?: 1f)
        // No speech engine (or not ready yet): carry on silently rather than wait for an end that never comes.
        if (tts.speak(clean, TextToSpeech.QUEUE_FLUSH, null, "reply") != TextToSpeech.SUCCESS) spoken()
    }

    fun stopSpeaking() {
        onSpoken = null
        tts.stop()
        speaking = false
    }

    fun release() {
        recognizer?.destroy()
        recognizer = null
        tts.shutdown()
    }

    override fun onPartialResults(results: Bundle) {
        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { partial = it }
    }

    override fun onResults(results: Bundle) {
        finish(results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: partial)
    }

    override fun onError(code: Int) {
        when (code) {
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> finish("")
            else -> {
                error = when (code) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Allow the microphone for The Third Eye in Settings."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech needs a connection right now."
                    else -> "Couldn't hear that. Try again."
                }
                finish(null)
            }
        }
    }

    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}

    companion object {
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
