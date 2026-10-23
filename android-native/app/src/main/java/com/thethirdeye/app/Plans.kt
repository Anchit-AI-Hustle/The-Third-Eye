package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class Wallet(val unlimited: Boolean = false, val balance: Flex? = null, val used: Flex = 0.0, val ledger: List<Entry> = emptyList()) {
    @Serializable data class Entry(val delta: Flex = 0.0, val reason: String = "", val balance_after: Flex? = null, val created_at: String = "")
}

class PlansModel {
    var wallet by mutableStateOf<Wallet?>(null)
    var error by mutableStateOf<String?>(null)
    var unlockNote by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)

    suspend fun load() {
        try {
            wallet = json.decodeFromString(Wallet.serializer(), Api.backend.send("GET", "/api/billing/credits"))
            error = null
        } catch (e: Exception) {
            error = e.message
        }
        loaded = true
    }

    suspend fun unlock(code: String) {
        unlockNote = try {
            Api.backend.send("POST", "/api/billing/unlock", buildJsonObject { put("code", code.trim()) })
            load()
            "Unlocked"
        } catch (e: ApiError) {
            if (e.status == 429) "Too many tries, wait 15 minutes." else e.message
        }
    }
}

private val costNames = linkedMapOf(
    "chat.message" to "Chat message",
    "assistant.action" to "Assistant action",
    "studio.text" to "Studio text",
    "studio.html" to "Studio page",
    "music.generate" to "Song",
    "video.render" to "Video",
    "vision.analyze" to "Photo analysis",
    "transcribe.minute" to "Transcription (per minute)",
    "jobagent.kit" to "Job application kit",
    "health.plan" to "Health plan",
    "kolab.generate" to "Kolab program",
)

fun costRows(costs: Map<String, Double>): List<Pair<String, Double>> =
    costNames.mapNotNull { (id, name) -> costs[id]?.let { name to it } } + costs.filterKeys { it !in costNames }.map { it.key to it.value }

private fun count(n: Double) = "%,d".format(n.toLong())

private const val NOT_LIVE = "Payments aren't live yet — plans can't be bought in the app."

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun PlansScreen(onBack: () -> Unit, model: PlansModel = remember { PlansModel() }) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var period by remember { mutableStateOf("monthly") }
    var code by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { Catalog.load(context); model.load() }
    val plans = Catalog.data?.plans

    ListScreen("Plans & Credits", model.loaded, refresh = { Catalog.load(context, refresh = true); model.load() }, onBack = onBack) {
        item { ErrorText(model.error ?: Catalog.error) }
        model.wallet?.let { w ->
            item("wallet") {
                Panel {
                    SectionLabel("Your credits")
                    Text(if (w.unlimited) "Unlimited" else count(w.balance ?: 0.0), fontSize = 32.sp, fontWeight = FontWeight.Bold, color = Palette.blue)
                    plans?.let { levelFor(it.levels, w.used) }?.let { p ->
                        Text(
                            "${p.level.avatar} ${p.level.name}" + (p.next?.let { " · ${p.remaining} more to ${it.name}" } ?: ""),
                            fontSize = 13.sp, color = Palette.secondary,
                        )
                    }
                }
            }
        }
        if (plans == null) return@ListScreen
        item { SectionLabel("Plans") }
        item("periods") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                plans.periods.forEach { p -> FilterChip(period == p.id, { period = p.id }, label = { Text(p.label) }) }
            }
        }
        plans.periods.firstOrNull { it.id == period }?.note?.let { item("note") { Hint(it) } }
        plans.tiers.forEach { tier ->
            item(tier.id) {
                val color = hexColor(tier.color)
                val price = tier.prices[period] ?: 0.0
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(tier.label, Modifier.weight(1f), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Badge(tier.badge, color)
                    }
                    Text(if (price == 0.0) "Free" else "₹${count(price)}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = color)
                    Text("${count(tier.monthlyCredits)} credits every month", fontSize = 12.sp, color = Palette.muted)
                    tier.features.forEach { Text("•  $it", fontSize = 13.sp, color = Palette.secondary) }
                }
            }
        }
        item("not-live") { Hint(NOT_LIVE) }
        item { SectionLabel("Credit packs") }
        plans.bundles.forEach { b ->
            item("bundle-${b.id}") {
                Row(Modifier.card(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(b.label, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        Text(count(b.credits) + (if (b.bonus > 0) " + ${count(b.bonus)} bonus" else "") + " credits", fontSize = 12.sp, color = Palette.muted)
                    }
                    if (b.best) Badge("Best value", Palette.blue)
                    Text("₹${count(b.priceInr)}", fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        item("not-live-packs") { Hint(NOT_LIVE) }
        item { SectionLabel("What things cost") }
        item("costs") {
            Panel {
                costRows(plans.costs).forEach { (name, cost) ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(name, Modifier.weight(1f), fontSize = 14.sp)
                        Text(count(cost), fontSize = 14.sp, fontFamily = FontFamily.Monospace, color = Palette.blue)
                    }
                }
            }
        }
        item { SectionLabel("Unlock code") }
        item("unlock") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Code", code, { code = it })
                GlowButton("Unlock", enabled = code.isNotBlank()) { scope.launch { model.unlock(code); code = "" } }
                model.unlockNote?.let { Text(it, fontSize = 13.sp, color = if (it == "Unlocked") Palette.blue else Palette.red) }
            }
        }
        model.wallet?.ledger?.take(8)?.takeIf { it.isNotEmpty() }?.let { ledger ->
            item { SectionLabel("Recent activity") }
            item("ledger") {
                Panel {
                    ledger.forEach { e ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(e.reason, fontSize = 14.sp)
                                Text(isoDate(e.created_at), fontSize = 11.sp, color = Palette.muted)
                            }
                            Text((if (e.delta > 0) "+" else "") + formatNumber(e.delta), fontFamily = FontFamily.Monospace, color = if (e.delta >= 0) Palette.blue else Palette.red)
                        }
                    }
                }
            }
        }
    }
}
