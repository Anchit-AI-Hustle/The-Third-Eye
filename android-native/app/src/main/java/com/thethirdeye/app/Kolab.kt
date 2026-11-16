package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

val kolabModes = listOf("lifecycle" to "Lifecycle program", "creator" to "Creator program", "brandplan" to "Brand plan", "retention" to "Retention program")
private val pricePoints = listOf("value", "mid", "premium", "luxury")
private val stages = listOf("pre-launch", "early", "growth", "scale", "mature")
private const val NOT_SET = "Not set"
const val MAX_BRIEF = 1000

fun parseChannels(text: String): List<String> = text.split(",").map { it.trim() }.filter { it.isNotEmpty() }

/** Only what was filled in: the server treats an empty field as a missing one. */
fun brandPayload(b: Brand): JsonObject = buildJsonObject {
    listOf(
        "name" to b.name, "industry" to b.industry, "product" to b.product, "audience" to b.audience, "positioning" to b.positioning,
        "usp" to b.usp, "pricePoint" to b.pricePoint, "region" to b.region, "competitors" to b.competitors, "toneOfVoice" to b.toneOfVoice,
        "stage" to b.stage, "goals" to b.goals, "metricsNote" to b.metricsNote, "constraints" to b.constraints,
    ).forEach { (key, value) -> if (value.isNotBlank()) put(key, value.trim()) }
    if (b.channels.isNotEmpty()) put("channels", JsonArray(b.channels.map(::JsonPrimitive)))
}

@Serializable
private data class Program(val output: String, val provider: String? = null)

class KolabRun(private val local: Local) {
    var mode by mutableStateOf("lifecycle")
    var brief by mutableStateOf("")
    var busy by mutableStateOf(false)
        private set
    var output by mutableStateOf<String?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    val modeLabel get() = kolabModes.first { it.first == mode }.second

    suspend fun generate() {
        busy = true
        error = null
        try {
            val brand = local.brand
            val sentMode = mode
            val sentBrief = brief.trim()
            val sentLabel = modeLabel
            val body = buildJsonObject {
                put("mode", sentMode)
                put("brand", brandPayload(brand))
                if (sentBrief.isNotEmpty()) put("brief", sentBrief)
            }
            val text = json.decodeFromString(Program.serializer(), Api.backend.send("POST", "/api/kolab/generate", body)).output
            output = text
            val inputs = listOf(Generation.Input("Program", sentLabel), Generation.Input("Brand", brand.name)) +
                if (sentBrief.isNotEmpty()) listOf(Generation.Input("Brief", sentBrief)) else emptyList()
            local.addGeneration(Generation("gen_${newId()}", "kolab", null, "Kolab", "$sentLabel: ${brand.name}", "markdown", now(), inputs, text))
        } catch (e: Exception) {
            error = e.message
        }
        busy = false
    }
}

@Composable
fun KolabScreen(nav: Nav) {
    val local = Local.get(LocalContext.current)
    val run = remember { KolabRun(local) }
    val scope = rememberCoroutineScope()
    var channels by remember { mutableStateOf(local.brand.channels.joinToString(", ")) }
    val brand = local.brand

    ListScreen("Kolab", loaded = true, refresh = {}, onBack = nav::back) {
        item { Text("Describe your brand once, then ask for a program. Your brand is kept on this phone.", fontSize = 13.sp, color = Palette.secondary) }
        item { TextButton(onClick = { nav.push(Dest.KolabStudio) }) { Text("Kolab Studio (creator tools)") } }
        item { SectionLabel("Your brand") }
        item("name") { Field("Brand name *", brand.name, { local.saveBrand(brand.copy(name = it)) }) }
        item("industry") { Field("Industry", brand.industry, { local.saveBrand(brand.copy(industry = it)) }) }
        item("product") { Field("What you sell", brand.product, { local.saveBrand(brand.copy(product = it)) }) }
        item("audience") { Field("Audience", brand.audience, { local.saveBrand(brand.copy(audience = it)) }) }
        item("positioning") { Field("Positioning", brand.positioning, { local.saveBrand(brand.copy(positioning = it)) }) }
        item("usp") { Field("What makes you different", brand.usp, { local.saveBrand(brand.copy(usp = it)) }) }
        item("price") { Choice("Price point", listOf(NOT_SET) + pricePoints, brand.pricePoint.ifEmpty { NOT_SET }) { local.saveBrand(brand.copy(pricePoint = if (it == NOT_SET) "" else it)) } }
        item("region") { Field("Region", brand.region, { local.saveBrand(brand.copy(region = it)) }) }
        item("channels") { Field("Channels (comma separated)", channels, { channels = it; local.saveBrand(brand.copy(channels = parseChannels(it))) }) }
        item("competitors") { Field("Competitors", brand.competitors, { local.saveBrand(brand.copy(competitors = it)) }) }
        item("tone") { Field("Tone of voice", brand.toneOfVoice, { local.saveBrand(brand.copy(toneOfVoice = it)) }) }
        item("stage") { Choice("Stage", listOf(NOT_SET) + stages, brand.stage.ifEmpty { NOT_SET }) { local.saveBrand(brand.copy(stage = if (it == NOT_SET) "" else it)) } }
        item("goals") { Field("Goals", brand.goals, { local.saveBrand(brand.copy(goals = it)) }, minLines = 2) }
        item("metrics") { Field("Current numbers", brand.metricsNote, { local.saveBrand(brand.copy(metricsNote = it)) }, minLines = 2) }
        item("constraints") { Field("Budget and limits", brand.constraints, { local.saveBrand(brand.copy(constraints = it)) }, minLines = 2) }
        item { SectionLabel("What to make") }
        item("program") { Choice("Program", kolabModes.map { it.second }, run.modeLabel) { label -> run.mode = kolabModes.first { it.second == label }.first } }
        item("brief") { Field("Brief (optional, ${run.brief.length}/$MAX_BRIEF)", run.brief, { run.brief = it.take(MAX_BRIEF) }, minLines = 3) }
        item("generate") {
            if (run.busy) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                Text("Generating. This can take up to a minute.", fontSize = 13.sp, color = Palette.secondary)
            } else GlowButton("Generate", enabled = brand.name.isNotBlank()) { scope.launch { run.generate() } }
        }
        item { ErrorText(run.error) }
        run.output?.let { out ->
            item("output") { Panel { SectionLabel("Result"); GeneratedOutput(out, "markdown") } }
            item("actions") { OutputActions(out, "kolab-${run.mode}.md") }
        }
    }
}
