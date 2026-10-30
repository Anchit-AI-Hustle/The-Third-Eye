package com.thethirdeye.app

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Video and Reel Studio's shot list: plan the script into shots, render each as a paid clip, as the web's VideoScenes. */
object Shots {
    @Serializable data class Scene(val n: Int, val title: String = "", val seconds: Int, val prompt: String, val narration: String = "")
    @Serializable private data class Plan(val scenes: List<Scene> = emptyList())

    fun aspect(tool: String, inputs: Map<String, String>) =
        if (tool == "reel" || inputs["format"].orEmpty().startsWith("Short-form")) "9:16" else "16:9"

    fun seconds(tool: String, inputs: Map<String, String>): Int? =
        if (tool == "reel") inputs["length"].orEmpty().takeWhile { it.isDigit() }.toIntOrNull() else null

    fun parse(reply: String): List<Scene> = json.decodeFromString(Plan.serializer(), reply).scenes

    const val CREDITS = 50
}

private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull

private class ShotsModel(val tool: String, val title: String, val script: String, val inputs: Map<String, String>) {
    data class Job(val status: String, val url: String? = null, val msg: String? = null)

    var scenes by mutableStateOf<List<Shots.Scene>?>(null)
    var planning by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    val jobs = mutableStateMapOf<Int, Job>()
    val aspect = Shots.aspect(tool, inputs)

    suspend fun plan() {
        planning = true
        error = null
        try {
            val body = buildJsonObject { put("script", script); Shots.seconds(tool, inputs)?.let { put("seconds", it) } }
            scenes = Shots.parse(Api.backend.send("POST", "/api/tools/video", body))
        } catch (e: Exception) {
            error = e.message
        }
        planning = false
    }

    suspend fun render(scene: Shots.Scene, local: Local) {
        jobs[scene.n] = Job("rendering")
        try {
            val body = buildJsonObject {
                put("scene", buildJsonObject { put("prompt", scene.prompt); put("seconds", scene.seconds); put("aspect", aspect) })
            }
            val id = json.parseToJsonElement(Api.backend.send("POST", "/api/tools/video", body)).jsonObject["jobId"].str()
                ?: throw ApiError(502)
            val giveUp = System.currentTimeMillis() + 10 * 60_000
            while (System.currentTimeMillis() < giveUp) {
                delay(4_000)
                val s = json.parseToJsonElement(Api.backend.send("GET", "/api/tools/video?id=$id")).jsonObject
                val url = s["url"].str()
                when {
                    s["status"].str() == "succeeded" && url != null -> {
                        jobs[scene.n] = Job("done", url)
                        local.addGeneration(Generation("gen_${newId()}", "video", tool, if (tool == "reel") "Reel Studio · Clip" else "Video Studio · Clip",
                            "$title - ${scene.n}. ${scene.title}", "video", now(),
                            listOf(Generation.Input("Shot prompt", scene.prompt), Generation.Input("Length", "${scene.seconds}s")), url))
                        return
                    }
                    s["status"].str() in setOf("failed", "canceled") || s["error"].str() != null -> {
                        jobs[scene.n] = Job("error", msg = s["error"].str() ?: "Render failed.")
                        return
                    }
                }
            }
            jobs[scene.n] = Job("error", msg = "Still not finished after 10 minutes. The provider may be stuck; try again.")
        } catch (e: Exception) {
            jobs[scene.n] = Job("error", msg = e.message)
        }
    }
}

@Composable
fun ShotsScreen(tool: String, title: String, script: String, inputs: Map<String, String>, onBack: () -> Unit) {
    val context: Context = LocalContext.current
    val local = Local.get(context)
    val model = remember(script) { ShotsModel(tool, title, script, inputs) }
    val scope = rememberCoroutineScope()
    var confirm by remember { mutableStateOf<Shots.Scene?>(null) }

    confirm?.let { scene ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Render shot ${scene.n}?") },
            text = { Text("A ${scene.seconds}s clip is a paid render: ${Shots.CREDITS} credits, refunded if it fails to start.") },
            confirmButton = { TextButton(onClick = { confirm = null; scope.launch { model.render(scene, local) } }) { Text("Render") } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Cancel") } },
        )
    }

    ListScreen("Shots", loaded = true, refresh = {}, onBack = onBack) {
        val scenes = model.scenes
        if (scenes == null) {
            item { Hint("Turn the script into a shot list, then render the shots you want as ${model.aspect} clips.") }
            item {
                if (model.planning) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                    Text("Planning shots…", fontSize = 13.sp, color = Palette.secondary)
                } else GlowButton("Plan shots") { scope.launch { model.plan() } }
            }
        } else {
            if (scenes.isEmpty()) item { Hint("No shots came back. Plan again.") }
            scenes.forEach { scene ->
                item(scene.n) {
                    Panel {
                        Text("${scene.n}. ${scene.title} · ${scene.seconds}s", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Text(scene.prompt, fontSize = 12.sp, color = Palette.secondary)
                        if (scene.narration.isNotBlank()) Text("Voice-over: ${scene.narration}", fontSize = 12.sp, color = Palette.muted)
                        val job = model.jobs[scene.n]
                        when {
                            job == null -> TextButton(onClick = { confirm = scene }) { Text("Render clip") }
                            job.status == "rendering" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(Modifier.size(16.dp), color = Palette.blue, strokeWidth = 2.dp)
                                Text("Rendering. Clips take a few minutes.", fontSize = 12.sp, color = Palette.secondary)
                            }
                            job.status == "done" -> TextButton(onClick = { job.url?.let { openInBrowser(context, it) } }) { Text("Watch clip") }
                            else -> {
                                ErrorText(job.msg)
                                TextButton(onClick = { confirm = scene }) { Text("Try again") }
                            }
                        }
                    }
                }
            }
            item { Hint("Rendered clips are saved to Generations. To cut them into one episode with a soundtrack, open this studio on the web.") }
        }
        item { ErrorText(model.error) }
    }
}
