package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LibraryAdd
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The mode's tools by category in the website's order; categories it doesn't list come last. */
fun groupTools(tools: List<CatalogData.StudioTool>, order: List<String>): List<Pair<String, List<CatalogData.StudioTool>>> =
    tools.groupBy { it.category }.entries.sortedBy { (category, _) -> order.indexOf(category).let { if (it < 0) Int.MAX_VALUE else it } }.map { it.key to it.value }

fun studioTitle(tool: CatalogData.StudioTool, inputs: List<Generation.Input>): String =
    "${tool.label}: ${inputs.firstOrNull()?.value.orEmpty()}"

@Serializable
private data class Generated(val output: String, val format: String = "markdown", val provider: String? = null)

class ToolRun(private val tool: CatalogData.StudioTool, private val local: Local) {
    val values = mutableStateMapOf<String, String>().apply {
        tool.fields.forEach { f -> if (f.type == "select") f.options.firstOrNull()?.let { put(f.name, it) } }
    }
    var busy by mutableStateOf(false)
        private set
    var output by mutableStateOf<String?>(null)
        private set
    var kind by mutableStateOf("markdown")
        private set
    var provider by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var saved by mutableStateOf(false)
        private set

    val ready get() = tool.fields.filter { it.required }.all { values[it.name].orEmpty().isNotBlank() }

    private var outputTitle = ""

    private fun inputs(entered: Map<String, String>) = tool.fields.mapNotNull { f -> entered[f.name]?.takeIf { it.isNotBlank() }?.let { Generation.Input(f.label, it) } }

    suspend fun generate() {
        busy = true
        error = null
        saved = false
        val entered = values.toMap()
        val mode = local.mode
        try {
            val body = buildJsonObject {
                put("tool", tool.id)
                put("inputs", buildJsonObject { tool.fields.forEach { f -> put(f.name, entered[f.name].orEmpty()) } })
                put("mode", mode)
            }
            val reply = json.decodeFromString(Generated.serializer(), Api.backend.send("POST", "/api/tools/generate", body))
            output = reply.output
            kind = reply.format
            provider = reply.provider
            val inputs = inputs(entered)
            outputTitle = studioTitle(tool, inputs)
            local.addGeneration(Generation("gen_${newId()}", "studio", tool.id, tool.label, outputTitle, reply.format, now(), inputs, reply.output))
        } catch (e: Exception) {
            error = e.message
        }
        busy = false
    }

    suspend fun saveToKnowledge() {
        val text = output ?: return
        try {
            DataStore.insert("knowledge_docs", buildJsonObject {
                put("id", newId()); put("title", outputTitle); put("content", text); put("file_type", tool.downloadExt)
                put("file_size_bytes", text.toByteArray().size); put("created_at", now()); put("chunk_count", 0); put("processing_status", "ready")
            })
            saved = true
        } catch (e: Exception) {
            error = e.message
        }
    }
}

@Composable
fun StudioScreen(app: AppState, nav: Nav) {
    val context = LocalContext.current
    val local = Local.get(context)
    LaunchedEffect(Unit) { Catalog.load(context) }
    val catalog = Catalog.data
    val studio = catalog?.studios?.get(local.mode)

    ListScreen("Studio", catalog != null || Catalog.error != null, refresh = { Catalog.load(context, refresh = true) }, onBack = nav::back) {
        item { ErrorText(Catalog.error) }
        if (catalog == null) return@ListScreen
        item { ModePicker(local.mode, local::pickMode) }
        studio?.let { s ->
            item("studio") {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(s.name, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = hexColor(s.accent))
                    Text(s.tagline, fontSize = 13.sp, color = Palette.secondary)
                }
            }
        }
        groupTools(catalog.studioTools.filter { it.mode == local.mode }, catalog.categoryOrder[local.mode].orEmpty()).forEach { (category, tools) ->
            item(category) { SectionLabel(category) }
            tools.forEach { tool ->
                item(tool.id) {
                    Row(Modifier.card { nav.open("/tools/${tool.id}", app, context) }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Dot(hexColor(tool.accent))
                        Column(Modifier.weight(1f)) {
                            Text(tool.label, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                            Text(tool.blurb, fontSize = 12.sp, color = Palette.muted, maxLines = 2)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ToolScreen(id: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val tool = Catalog.data?.studioTools?.firstOrNull { it.id == id } ?: return WebScreen("Studio", "/tools/$id", onBack)
    val run = remember(id) { ToolRun(tool, Local.get(context)) }
    val scope = rememberCoroutineScope()

    ListScreen(tool.label, loaded = true, refresh = {}, onBack = onBack) {
        item { Text(tool.blurb, fontSize = 13.sp, color = Palette.secondary) }
        tool.fields.forEach { f ->
            item(f.name) {
                when (f.type) {
                    "select" -> Choice(f.label, f.options, run.values[f.name].orEmpty()) { run.values[f.name] = it }
                    else -> Field(
                        if (f.required) "${f.label} *" else f.label, run.values[f.name].orEmpty(), { run.values[f.name] = it },
                        minLines = if (f.type == "textarea") 4 else 1, placeholder = f.placeholder,
                    )
                }
            }
        }
        item {
            if (run.busy) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                Text("Generating. This can take up to a minute.", fontSize = 13.sp, color = Palette.secondary)
            } else GlowButton(tool.cta, enabled = run.ready) { scope.launch { run.generate() } }
        }
        item { ErrorText(run.error) }
        run.output?.let { out ->
            item("output") {
                Panel {
                    SectionLabel("Result")
                    GeneratedOutput(out, run.kind)
                    run.provider?.let { Text("Made with $it", fontSize = 11.sp, color = Palette.muted) }
                }
            }
            item("actions") {
                OutputActions(out, "${tool.id}.${tool.downloadExt}") {
                    TextButton(onClick = { scope.launch { run.saveToKnowledge() } }, enabled = !run.saved) {
                        Icon(Icons.Outlined.LibraryAdd, null, Modifier.size(18.dp)); Text(if (run.saved) "  Saved to Knowledge" else "  Save to Knowledge")
                    }
                    if (!run.busy) RegenerateButton { scope.launch { run.generate() } }
                }
            }
        }
    }
}
