package com.thethirdeye.app

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.SpeechRecognizer
import java.net.URI
import java.net.URLDecoder

/** What an incoming intent asks the app to do: the home-screen shortcuts, the assistant gesture, Share. */
sealed interface Launch {
    data object Assistant : Launch
    data object Call : Launch
    data class Ask(val text: String) : Launch

    companion object {
        const val CALL_URL = "thethirdeye://call"

        fun of(action: String?, url: String?, shared: String?): Launch? {
            if (action == Intent.ACTION_ASSIST || action == Intent.ACTION_VOICE_COMMAND) return Call
            if (action == Intent.ACTION_SEND) return shared?.trim()?.takeIf { it.isNotEmpty() }?.let { Ask(sharedNote(it)) }
            val uri = url?.let { runCatching { URI(it) }.getOrNull() } ?: return null
            if (uri.scheme != "thethirdeye") return null
            return when (uri.host) {
                "call" -> Call
                "assistant" -> query(uri.rawQuery, "ask")?.takeIf { it.isNotBlank() }?.let(::Ask) ?: Assistant
                else -> null
            }
        }

        private fun query(raw: String?, key: String): String? = raw?.split("&")
            ?.map { it.split("=", limit = 2) }
            ?.firstOrNull { it[0] == key }
            ?.getOrNull(1)?.let { URLDecoder.decode(it, "UTF-8") }

        /** As the website's /share: save what was shared as a note. */
        fun sharedNote(text: String) =
            "I shared this with you. Save it as a note, then tell me in one line what it is.\n\n" + text.take(4000)
    }
}

// Lets the person pick The Third Eye as the phone's digital assistant (Settings > Apps >
// Default apps), so the assistant gesture (hold the power button, or swipe up from a
// bottom corner) opens a hands-free call with it.
class AssistService : VoiceInteractionService()

class AssistSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession = object : VoiceInteractionSession(this) {
        override fun onShow(args: Bundle?, showFlags: Int) {
            super.onShow(args, showFlags)
            startAssistantActivity(Intent(context, MainActivity::class.java).setData(android.net.Uri.parse(Launch.CALL_URL)))
            hide()
        }
    }
}

/**
 * The digital assistant must also be the phone's speech recognizer, so this hands every
 * request to another installed recognizer (Google's when present), and dictation keeps
 * working in this app and every other one.
 */
class AssistRecognitionService : RecognitionService() {
    private var delegate: SpeechRecognizer? = null

    override fun onStartListening(intent: Intent, callback: Callback) {
        delegate?.destroy()
        val other = otherRecognizer(this)
        if (other == null) {
            callback.error(SpeechRecognizer.ERROR_CLIENT)
            return
        }
        delegate = SpeechRecognizer.createSpeechRecognizer(this, other).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) = callback.readyForSpeech(params ?: Bundle())
                override fun onBeginningOfSpeech() = callback.beginningOfSpeech()
                override fun onRmsChanged(rmsdB: Float) = callback.rmsChanged(rmsdB)
                override fun onBufferReceived(buffer: ByteArray?) { buffer?.let(callback::bufferReceived) }
                override fun onEndOfSpeech() = callback.endOfSpeech()
                override fun onError(error: Int) = callback.error(error)
                override fun onResults(results: Bundle?) = callback.results(results ?: Bundle())
                override fun onPartialResults(partialResults: Bundle?) = callback.partialResults(partialResults ?: Bundle())
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            startListening(intent)
        }
    }

    override fun onStopListening(callback: Callback) { delegate?.stopListening() }

    override fun onCancel(callback: Callback) { delegate?.cancel() }

    override fun onDestroy() {
        delegate?.destroy()
        super.onDestroy()
    }
}

/** Another app's speech recognizer, Google's first: never this app's own, which only forwards. */
fun otherRecognizer(context: Context): ComponentName? =
    pickRecognizer(
        context.packageManager.queryIntentServices(Intent(RecognitionService.SERVICE_INTERFACE), 0)
            .map { it.serviceInfo.packageName to it.serviceInfo.name },
        context.packageName,
    )?.let { (pkg, cls) -> ComponentName(pkg, cls) }

/** (package, class) of the recognizer to use. */
fun pickRecognizer(installed: List<Pair<String, String>>, own: String): Pair<String, String>? {
    val others = installed.filter { it.first != own }
    return others.firstOrNull { it.first == "com.google.android.tts" }
        ?: others.firstOrNull { it.first == "com.google.android.googlequicksearchbox" }
        ?: others.firstOrNull()
}
