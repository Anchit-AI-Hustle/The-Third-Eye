package com.thethirdeye.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Kolab Creator Studio, as on the website (app/kolab/studio/(app)): the studio, analytics, and profile setup with Aadhaar and channels. Onboarding and buying a plan stay on the website. */
@Serializable
data class KolabStudioData(
    val org: Org? = null,
    val unlocked: Boolean = false,
    val reason: String? = null,
    val pillars: List<Pillar> = emptyList(),
    val plan: List<PlanItem> = emptyList(),
    val deals: List<Deal> = emptyList(),
    val schedule: List<Post> = emptyList(),
    val channels: List<Channel> = emptyList(),
    val assetMix: Mix = Mix(),
    val tracker: Tracker = Tracker(),
    val csv: String = "",
    val profile: Profile = Profile(),
    val account: Account = Account(),
    val analytics: Analytics = Analytics(),
    val reference: Reference = Reference(),
) {
    @Serializable data class Profile(
        val name: String = "", val handle: String = "", val dob: String = "", val age: Int? = null, val pincode: String = "",
        val city: String = "", val state: String = "", val country: String = "", val website_url: String = "",
    )
    @Serializable data class Account(
        val kycVerified: Boolean = false, val subscriptionActive: Boolean = false, val privileged: Boolean = false, val plan: String = "", val canPro: Boolean = false,
    )
    @Serializable data class Analytics(val activeDeals: Int = 0, val linkedChannels: Int = 0, val byStatus: List<Count> = emptyList()) {
        @Serializable data class Count(val status: String, val label: String, val n: Int)
    }
    @Serializable data class Org(val name: String, val type: String)
    @Serializable data class Pillar(val id: String, val name: String, val role: String? = null, val color: String? = null)
    @Serializable data class PlanItem(
        val id: String, val pillar_id: String? = null, val format: String? = null, val asset_type: String? = null, val date: String? = null,
        val time: String? = null, val hook: String? = null, val status: String = "to_shoot", val done: Boolean = false,
    )
    @Serializable data class Deal(
        val id: String, val brand: String? = null, val emoji: String? = null, val product: String? = null, val category: String? = null,
        val code: String? = null, val discount: String? = null, val price: String? = null, val affiliate_url: String? = null,
        val active: Boolean = true,
    )
    @Serializable data class Post(val id: String, val title: String? = null, val scheduled_at: String? = null, val channels: List<String>? = null)
    @Serializable data class Channel(val platform: String, val handle: String? = null)
    @Serializable data class Mix(val counts: Map<String, Int> = emptyMap(), val total: Int = 0)
    @Serializable data class Tracker(val posted: Int = 0, val total: Int = 0, val pct: Int = 0)
    @Serializable data class Reference(
        val statuses: List<String> = emptyList(),
        val statusLabels: Map<String, String> = emptyMap(),
        val assetMeta: Map<String, Meta> = emptyMap(),
        val channels: List<ChannelInfo> = emptyList(),
        val blueprints: List<Blueprint> = emptyList(),
        val autoSteps: List<Step> = emptyList(),
        val defaultPillars: List<DefaultPillar> = emptyList(),
    )
    @Serializable data class Meta(val c: String, val l: String)
    @Serializable data class ChannelInfo(val k: String, val n: String, val c: String)
    @Serializable data class Blueprint(val t: String, val steps: List<String>)
    @Serializable data class Step(val n: String, val h: String, val p: String)
    @Serializable data class DefaultPillar(val name: String, val role: String)

    companion object {
        fun parse(reply: String): KolabStudioData = json.decodeFromJsonElement(serializer(), json.parseToJsonElement(reply).jsonObject["data"]!!)
    }
}

val kolabModules = listOf("Strategy", "Calendar", "Blueprints", "Asset Map", "Scheduler", "Brand Deals", "Automation", "Tracker", "Analytics", "Profile & setup")
private val assetTypes = listOf("video", "carousel", "photo", "loop")
private const val STUDIO = "/api/kolab-studio/studio"

/** The pillars to edit: the saved ones, or the website's starting set. */
fun kolabPillarRows(d: KolabStudioData): List<Triple<String?, String, String>> =
    if (d.pillars.isEmpty()) d.reference.defaultPillars.map { Triple(null, it.name, it.role) }
    else d.pillars.map { Triple(it.id, it.name, it.role.orEmpty()) }

/** The website's profile save: only filled fields, and the website only on Pro. */
fun kolabProfileBody(fields: Map<String, String>, canPro: Boolean): JsonObject = buildJsonObject {
    listOf("name", "handle", "dob", "pincode").forEach { k -> fields[k]?.trim()?.takeIf { it.isNotEmpty() }?.let { put(k, it) } }
    if (canPro) fields["website_url"]?.trim()?.takeIf { it.isNotEmpty() }?.let { put("website_url", it) }
}

fun kycReference(reply: String): String? =
    runCatching { json.parseToJsonElement(reply).jsonObject["data"]!!.jsonObject["reference_id"]!!.jsonPrimitive.content }.getOrNull()

fun kolabPillarsBody(rows: List<Triple<String?, String, String>>): JsonObject = buildJsonObject {
    put("pillars", buildJsonArray {
        rows.filter { it.second.isNotBlank() }.forEach { (id, name, role) ->
            add(buildJsonObject { id?.let { put("id", it) }; put("name", name); put("role", role) })
        }
    })
}

@Composable
fun KolabStudioScreen(nav: Nav) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<KolabStudioData?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var module by remember { mutableStateOf(kolabModules.first()) }

    suspend fun load() {
        try {
            data = KolabStudioData.parse(Api.backend.send("GET", STUDIO))
            error = null
        } catch (e: Exception) {
            error = e.message
        }
    }

    // One mutation, then a reload, as the website's call() + router.refresh().
    fun call(method: String, path: String, body: JsonElement? = null, after: () -> Unit = {}, onReply: (String) -> Unit = {}) = scope.launch {
        busy = true
        error = null
        try {
            val reply = Api.backend.send(method, path, body)
            load()
            onReply(reply)
            after()
        } catch (e: Exception) {
            error = e.message
        }
        busy = false
    }

    // A real .csv file the user saves (Drive, Files, Sheets), with the BOM Excel needs, as the website's export.
    val saveCsv = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val csv = data?.csv
        if (uri != null && csv != null) runCatching { context.contentResolver.openOutputStream(uri)!!.use { it.write(("\uFEFF" + csv).toByteArray()) } }
            .onFailure { error = "Couldn't save the CSV: ${it.message}" }
    }

    LaunchedEffect(Unit) { load() }

    ListScreen(data?.org?.name ?: "Creator Studio", loaded = data != null || error != null, refresh = { load() }, onBack = nav::back) {
        error?.let { item { ErrorText(it) } }
        val d = data ?: return@ListScreen
        val setup: @Composable () -> Unit = {
            Setup(d, busy, save = { path, method, body -> call(method, path, body) }, initiateKyc = { body, gotRef -> call("POST", "/api/kolab-studio/kyc", body, onReply = { kycReference(it)?.let(gotRef) }) })
        }
        if (d.org == null) {
            item {
                Panel {
                    Text("Create your studio first", fontWeight = FontWeight.SemiBold)
                    Hint("Set up your Kolab organization on the website, then come back here.")
                    TextButton(onClick = { nav.push(Dest.Web("Kolab Studio", "/kolab/studio/onboarding")) }) { Text("Open on the website") }
                }
            }
            return@ListScreen
        }
        if (!d.unlocked) {
            item {
                Panel {
                    Text(d.reason ?: "Unlock Creator Studio", fontWeight = FontWeight.SemiBold)
                    Hint("Complete your profile and verify your Aadhaar here. Plans are bought on the website.")
                    if (!d.account.subscriptionActive && !d.account.privileged) TextButton(onClick = { nav.push(Dest.Web("Kolab plans", "/kolab/studio/subscription")) }) { Text("Choose a plan on the website") }
                }
            }
            item("setup") { setup() }
            return@ListScreen
        }
        item { Panel { Choice("Module", kolabModules, module) { module = it } } }
        when (module) {
            "Strategy" -> item("strategy") { Strategy(d, busy) { call("PUT", "$STUDIO/pillars", it) } }
            "Calendar" -> {
                item("calendar") { PlanForm(d, busy, onAdd = { body, done -> call("POST", "$STUDIO/plan", body, done) }, onWeek = { call("POST", "$STUDIO/plan", buildJsonObject { put("generate", "week") }) }) }
                if (d.plan.isEmpty()) item { Hint("No posts planned. Add one or generate a starter week.") }
                d.plan.forEach { x ->
                    item(x.id) {
                        val pillar = d.pillars.firstOrNull { it.id == x.pillar_id }
                        Row(Modifier.card().height(androidx.compose.foundation.layout.IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Box(Modifier.width(4.dp).fillMaxHeight().background(hexColor(pillar?.color ?: "#c2f04a")))
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(x.hook ?: "(idea)", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text(listOf(pillar?.name ?: "-", x.format.orEmpty(), x.date.orEmpty(), x.time.orEmpty()).filter { it.isNotEmpty() }.joinToString(" · "),
                                    fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
                                x.asset_type?.let { d.reference.assetMeta[it] }?.let { Text(it.l.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = hexColor(it.c)) }
                            }
                            TextButton(enabled = !busy, onClick = { call("DELETE", "$STUDIO/plan?id=${x.id}") }) { Text("Delete", color = Palette.red) }
                        }
                    }
                }
            }
            "Blueprints" -> d.reference.blueprints.forEach { b ->
                item(b.t) { Panel { SectionLabel(b.t); b.steps.forEachIndexed { i, s -> Text("${i + 1}. $s", fontSize = 13.sp) } } }
            }
            "Asset Map" -> item("assets") {
                Panel {
                    SectionLabel("Asset & shot map")
                    if (d.assetMix.total == 0) Hint("Build your calendar to see the asset mix.")
                    else {
                        assetTypes.forEach { k ->
                            val count = d.assetMix.counts[k] ?: 0
                            val meta = d.reference.assetMeta[k]
                            Row {
                                Text(meta?.l ?: k, Modifier.weight(1f), color = hexColor(meta?.c ?: "#c2f04a"))
                                Text("$count · ${Math.round(count * 100.0 / d.assetMix.total)}%", fontSize = 13.sp, fontFamily = FontFamily.Monospace)
                            }
                        }
                        Hint("${d.assetMix.total} posts planned · video is your growth engine, carousels the save layer.")
                    }
                }
            }
            "Scheduler" -> {
                item("channels") {
                    Panel {
                        SectionLabel("Channels")
                        d.reference.channels.forEach { c ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.size(10.dp).background(hexColor(c.c), CircleShape))
                                Text(c.n, Modifier.weight(1f))
                                Text(d.channels.firstOrNull { it.platform == c.k }?.handle?.let { "Linked · $it" } ?: "Not connected", fontSize = 11.sp, color = Palette.muted)
                            }
                        }
                    }
                }
                item("queue-form") { QueueForm(d, busy) { body, done -> call("POST", "$STUDIO/schedule", body, done) } }
                if (d.schedule.isEmpty()) item { Hint("Queue is empty.") }
                d.schedule.forEach { q ->
                    item(q.id) {
                        Row(Modifier.card(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(q.title.orEmpty(), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text((listOf(anchorWhen(q.scheduled_at)) + q.channels.orEmpty().map { k -> d.reference.channels.firstOrNull { it.k == k }?.n ?: k }).joinToString(" · "),
                                    fontSize = 11.sp, color = Palette.muted)
                            }
                            TextButton(enabled = !busy, onClick = { call("DELETE", "$STUDIO/schedule?id=${q.id}") }) { Text("Delete", color = Palette.red) }
                        }
                    }
                }
            }
            "Brand Deals" -> {
                item("deal-form") { DealForm(busy) { body, done -> call("POST", "$STUDIO/deals", body, done) } }
                if (d.deals.isEmpty()) item { Hint("No deals yet.") }
                d.deals.forEach { x ->
                    item(x.id) {
                        Row(Modifier.card(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(x.emoji?.ifEmpty { null } ?: "🏷️", fontSize = 28.sp)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(listOfNotNull(x.brand, x.category).filter { it.isNotEmpty() }.joinToString(" · ").uppercase(), fontSize = 10.sp, color = Palette.muted)
                                Text(x.product.orEmpty(), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text(listOfNotNull(x.price, x.discount).filter { it.isNotEmpty() }.joinToString("  "), fontSize = 13.sp)
                                x.code?.takeIf { it.isNotEmpty() }?.let { code -> TextButton(onClick = { copyText(context, code) }) { Text(code, fontFamily = FontFamily.Monospace) } }
                                x.affiliate_url?.takeIf { it.isNotEmpty() }?.let { url -> TextButton(onClick = { openInBrowser(context, url) }) { Text("Buy link") } }
                            }
                            TextButton(enabled = !busy, onClick = { call("DELETE", "$STUDIO/deals?id=${x.id}") }) { Text("Delete", color = Palette.red) }
                        }
                    }
                }
            }
            "Automation" -> item("auto") {
                Panel {
                    SectionLabel("Automation engine")
                    d.reference.autoSteps.forEach { s ->
                        Text("${s.n} · ${s.h}", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text(s.p, fontSize = 12.sp, color = Palette.muted)
                    }
                }
            }
            "Profile & setup" -> item("setup") { setup() }
            "Analytics" -> item("analytics") {
                Panel {
                    SectionLabel("Your numbers")
                    listOf(
                        "Posts planned" to "${d.tracker.total}",
                        "Posted" to "${d.tracker.posted}/${d.tracker.total} · ${d.tracker.pct}%",
                        "Active deals" to "${d.analytics.activeDeals}",
                        "Channels linked" to "${d.analytics.linkedChannels}/${d.reference.channels.size}",
                        "Subscription" to d.account.plan,
                        "Identity" to if (d.account.kycVerified) "Verified" else "Pending",
                    ).forEach { (k, v) -> Row { Text(k, Modifier.weight(1f), color = Palette.muted, fontSize = 13.sp); Text(v, fontWeight = FontWeight.SemiBold, fontSize = 13.sp) } }
                    SectionLabel("Content pipeline")
                    val top = maxOf(1, d.analytics.byStatus.maxOfOrNull { it.n } ?: 1)
                    d.analytics.byStatus.forEach { c ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(c.label, Modifier.width(90.dp), fontSize = 13.sp)
                            Box(Modifier.weight(1f)) { if (c.n > 0) Box(Modifier.fillMaxWidth(c.n.toFloat() / top).height(10.dp).background(hexColor("#c2f04a"))) }
                            Text("${c.n}", Modifier.width(28.dp), fontSize = 12.sp, fontFamily = FontFamily.Monospace)
                        }
                    }
                    SectionLabel("Channels")
                    d.reference.channels.forEach { c ->
                        Row { Text(c.n, Modifier.weight(1f), fontSize = 13.sp); Text(d.channels.firstOrNull { it.platform == c.k }?.handle?.let { "Linked · $it" } ?: "Connect to see audience metrics", fontSize = 11.sp, color = Palette.muted) }
                    }
                    Hint("Follower, reach and engagement figures need channel sign-in, which isn't live yet, so they're left blank rather than estimated.")
                }
            }
            "Tracker" -> {
                item("progress") {
                    Panel {
                        Text("Posted ${d.tracker.posted} / ${d.tracker.total}", fontSize = 12.sp)
                        LinearProgressIndicator(progress = { d.tracker.pct / 100f }, color = hexColor("#c2f04a"))
                        TextButton(enabled = d.tracker.total > 0, onClick = { saveCsv.launch("content-tracker.csv") }) { Text("Save CSV") }
                    }
                }
                if (d.plan.isEmpty()) item { Hint("Nothing to track yet. Build your calendar.") }
                d.plan.forEach { x ->
                    item("t-${x.id}") {
                        val done = x.done || x.status == "posted"
                        Column(Modifier.card()) {
                            Text(x.hook ?: "(idea)", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = if (done) Palette.muted else androidx.compose.ui.graphics.Color.Unspecified)
                            Text(listOf(x.date.orEmpty(), x.format.orEmpty()).filter { it.isNotEmpty() }.joinToString(" · "), fontSize = 11.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f)) {
                                    Choice("Status", d.reference.statuses.map { d.reference.statusLabels[it] ?: it }, d.reference.statusLabels[x.status] ?: x.status) { label ->
                                        val s = d.reference.statuses.first { (d.reference.statusLabels[it] ?: it) == label }
                                        call("PATCH", "$STUDIO/plan", buildJsonObject { put("id", x.id); put("status", s) })
                                    }
                                }
                                Checkbox(done, enabled = !busy, onCheckedChange = { call("PATCH", "$STUDIO/plan", buildJsonObject { put("id", x.id); put("done", it) }) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Strategy(d: KolabStudioData, busy: Boolean, onSave: (JsonObject) -> Unit) {
    val rows = remember(d.pillars) { mutableStateListOf(*kolabPillarRows(d).toTypedArray()) }
    Panel {
        SectionLabel("Content strategy")
        Hint("Define the pillars your content rotates through. They drive your calendar, asset mix and tracker.")
        rows.forEachIndexed { i, (id, name, role) ->
            Field("Pillar name", name, { rows[i] = Triple(id, it, role) })
            Field("Role", role, { rows[i] = Triple(id, name, it) })
            TextButton(onClick = { rows.removeAt(i) }) { Text("Remove", color = Palette.red) }
        }
        TextButton(onClick = { rows.add(Triple(null, "New pillar", "")) }) { Text("Add pillar") }
        GlowButton("Save pillars", enabled = !busy) { onSave(kolabPillarsBody(rows)) }
    }
}

@Composable
private fun PlanForm(d: KolabStudioData, busy: Boolean, onAdd: (JsonObject, () -> Unit) -> Unit, onWeek: () -> Unit) {
    var pillar by remember { mutableStateOf(d.pillars.firstOrNull()) }
    var format by remember { mutableStateOf("") }
    var asset by remember { mutableStateOf("video") }
    var date by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var time by remember { mutableStateOf("19:30") }
    var hook by remember { mutableStateOf("") }
    Panel {
        SectionLabel("Content calendar")
        Choice("Pillar", listOf("-") + d.pillars.map { it.name }, pillar?.name ?: "-") { n -> pillar = d.pillars.firstOrNull { it.name == n } }
        Field("Format (Reel · 30s)", format, { format = it })
        Choice("Asset", assetTypes.map { d.reference.assetMeta[it]?.l ?: it }, d.reference.assetMeta[asset]?.l ?: asset) { l -> asset = assetTypes.first { (d.reference.assetMeta[it]?.l ?: it) == l } }
        Field("Date (YYYY-MM-DD)", date, { date = it })
        Field("Time (HH:MM)", time, { time = it })
        Field("Hook / idea", hook, { hook = it }, minLines = 2)
        Row {
            TextButton(enabled = !busy && hook.isNotBlank(), onClick = {
                onAdd(buildJsonObject {
                    put("pillar_id", pillar?.id?.let { JsonPrimitive(it) } ?: JsonNull)
                    put("format", format); put("asset_type", asset); put("hook", hook)
                    if (date.isNotBlank()) put("date", date.trim())
                    if (time.isNotBlank()) put("time", time.trim())
                }) { hook = "" }
            }) { Text("Add to plan") }
            TextButton(enabled = !busy, onClick = onWeek) { Text("Generate starter week") }
        }
    }
}

@Composable
private fun QueueForm(d: KolabStudioData, busy: Boolean, onAdd: (JsonObject, () -> Unit) -> Unit) {
    var title by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var time by remember { mutableStateOf("19:30") }
    val picked = remember { mutableStateListOf("instagram") }
    Panel {
        SectionLabel("Queue a post")
        Field("Title / caption", title, { title = it })
        Field("Date (YYYY-MM-DD)", date, { date = it })
        Field("Time, IST (HH:MM)", time, { time = it })
        d.reference.channels.forEach { c ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(c.k in picked, onCheckedChange = { if (it) picked.add(c.k) else picked.remove(c.k) })
                Text(c.n)
            }
        }
        TextButton(enabled = !busy && title.isNotBlank() && picked.isNotEmpty(), onClick = {
            onAdd(buildJsonObject {
                put("title", title)
                put("channels", buildJsonArray { d.reference.channels.map { it.k }.filter { it in picked }.forEach { add(JsonPrimitive(it)) } })
                if (date.isNotBlank()) put("date", date.trim())
                if (time.isNotBlank()) put("time", time.trim())
            }) { title = "" }
        }) { Text("Add to queue") }
    }
}

private val dealFields = listOf(
    "brand" to "Brand (MyProtein)", "emoji" to "Emoji (🥤)", "product" to "Product (Whey 1kg)", "category" to "Category",
    "code" to "Code (SAVE20)", "discount" to "Discount (20% off)", "price" to "Price (₹1,999)", "affiliate_url" to "Buy / affiliate link",
)

@Composable
private fun DealForm(busy: Boolean, onAdd: (JsonObject, () -> Unit) -> Unit) {
    val f = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() }
    Panel {
        SectionLabel("Brand deals & coupons")
        dealFields.forEach { (key, label) -> Field(label, f[key].orEmpty(), { f[key] = it }) }
        TextButton(enabled = !busy && (f["brand"].orEmpty().isNotBlank() || f["product"].orEmpty().isNotBlank()), onClick = {
            onAdd(buildJsonObject { dealFields.forEach { (k, _) -> put(k, f[k].orEmpty()) } }) { f.clear() }
        }) { Text("Add deal") }
    }
}

@Composable
private fun Setup(d: KolabStudioData, busy: Boolean, save: (String, String, JsonObject) -> Unit, initiateKyc: (JsonObject, (String) -> Unit) -> Unit) {
    val p = d.profile
    val f = remember(p) { androidx.compose.runtime.mutableStateMapOf("name" to p.name, "handle" to p.handle, "dob" to p.dob, "pincode" to p.pincode, "website_url" to p.website_url) }
    val handles = remember(d.channels) { androidx.compose.runtime.mutableStateMapOf(*d.channels.map { it.platform to it.handle.orEmpty() }.toTypedArray()) }
    var aadhaar by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf<String?>(null) }
    var otp by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Panel {
            SectionLabel("As followers & brands see you")
            Text(p.name.ifEmpty { "New creator" }, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text(listOfNotNull("@" + p.handle.ifEmpty { "-" }, p.age?.let { "$it yrs" }, listOf(p.city, p.state, p.country).filter { it.isNotEmpty() }.joinToString(", ")).filter { it.isNotEmpty() }.joinToString(" · "),
                fontSize = 12.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
            Text(listOf(if (d.account.kycVerified) "Aadhaar verified" else "Unverified", d.account.plan).joinToString(" · "), fontSize = 12.sp,
                color = if (d.account.kycVerified) Palette.success else Palette.warning)
        }
        Panel {
            SectionLabel("Profile setup")
            Field("Full name", f["name"].orEmpty(), { f["name"] = it })
            Field("Handle", f["handle"].orEmpty(), { f["handle"] = it }, placeholder = "@yourhandle")
            Field("Date of birth (YYYY-MM-DD)", f["dob"].orEmpty(), { f["dob"] = it })
            Field("Pincode", f["pincode"].orEmpty(), { f["pincode"] = it }, keyboard = androidx.compose.ui.text.input.KeyboardType.Number)
            if (d.account.canPro) Field("Website URL", f["website_url"].orEmpty(), { f["website_url"] = it })
            else Hint("Website URL unlocks on Pro.")
            GlowButton("Save profile", enabled = !busy) { save("/api/kolab-studio/profile", "POST", kolabProfileBody(f, d.account.canPro)) }
        }
        Panel {
            SectionLabel("Aadhaar verification")
            if (d.account.kycVerified) Hint("Your identity is verified. Features unlock once you also have an active plan.")
            else {
                Field("Aadhaar number", aadhaar, { aadhaar = it }, keyboard = androidx.compose.ui.text.input.KeyboardType.Number)
                val ref = reference
                if (ref == null) {
                    TextButton(enabled = !busy && aadhaar.count(Char::isDigit) == 12, onClick = {
                        initiateKyc(buildJsonObject { put("action", "initiate"); put("aadhaar", aadhaar); put("consent", true) }) { reference = it }
                    }) { Text("Verify via OTP") }
                    Hint("Runs only through a UIDAI-licensed provider with your consent. Your Aadhaar number is never stored, only the verification status and a masked reference.")
                } else {
                    Hint("OTP sent to your Aadhaar-linked mobile.")
                    Field("OTP", otp, { otp = it }, keyboard = androidx.compose.ui.text.input.KeyboardType.Number)
                    TextButton(enabled = !busy && otp.isNotBlank(), onClick = {
                        save("/api/kolab-studio/kyc", "POST", buildJsonObject { put("action", "verify"); put("reference_id", ref); put("otp", otp) })
                    }) { Text("Confirm") }
                }
            }
        }
        Panel {
            SectionLabel("Social channels")
            d.reference.channels.forEach { c ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(10.dp).background(hexColor(c.c), CircleShape))
                    Box(Modifier.weight(1f)) { Field(c.n, handles[c.k].orEmpty(), { handles[c.k] = it }, placeholder = "@handle") }
                    TextButton(enabled = !busy, onClick = {
                        save("/api/kolab-studio/channels", "PUT", buildJsonObject { put("platform", c.k); put("handle", handles[c.k].orEmpty()) })
                    }) { Text(if (d.channels.any { it.platform == c.k && !it.handle.isNullOrEmpty() }) "Update" else "Link") }
                }
            }
        }
    }
}
