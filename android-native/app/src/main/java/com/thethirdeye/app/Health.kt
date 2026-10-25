package com.thethirdeye.app

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Health Engine's form, as /api/tools/health reads it (components/health/HealthEngine). */
@Serializable
data class HealthInput(
    val goal: String = "lose",
    val focus: String = "both",
    val sex: String = "male",
    val age: Int = 30,
    val heightCm: Int = 175,
    val weightKg: Int = 75,
    val activity: String = "moderate",
    val pace: String = "steady",
    val targetWeightKg: Int? = null,
    val dietaryPreference: String = "",
    val allergies: String = "",
    val cuisine: String = "",
    val mealsPerDay: Int? = null,
    val trainingDaysPerWeek: Int? = null,
    val sessionMinutes: Int? = null,
    val experience: String = "",
    val equipment: String = "",
    val injuries: String = "",
    val conditions: String = "",
) {
    fun body(): JsonObject = buildJsonObject {
        put("goal", goal); put("focus", focus); put("sex", sex); put("age", age); put("heightCm", heightCm)
        put("weightKg", weightKg); put("activity", activity); put("pace", pace)
        if (goal != "maintain") targetWeightKg?.let { put("targetWeightKg", it) }
        mealsPerDay?.let { put("mealsPerDay", it) }
        trainingDaysPerWeek?.let { put("trainingDaysPerWeek", it) }
        sessionMinutes?.let { put("sessionMinutes", it) }
        listOf("dietaryPreference" to dietaryPreference, "cuisine" to cuisine, "experience" to experience, "equipment" to equipment,
            "injuries" to injuries, "conditions" to conditions).forEach { (k, v) -> if (v.isNotBlank()) put(k, v.trim()) }
        val list = allergies.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        if (list.isNotEmpty()) put("allergies", buildJsonArray { list.forEach { add(JsonPrimitive(it)) } })
    }
}

@Serializable
data class HealthTargets(
    val bmr: Int,
    val tdee: Int,
    val goalCalories: Int,
    val dailyDeltaKcal: Int,
    val estWeeklyChangeKg: Double,
    val macros: Macros,
    val bmi: Double,
    val bmiCategory: String,
    val healthyWeightRangeKg: List<Double>,
    val waterMl: Int,
    val proteinPerKg: Double,
    val etaWeeks: Double? = null,
    val warnings: List<String> = emptyList(),
) {
    @Serializable data class Macros(val proteinG: Int, val fatG: Int, val carbsG: Int)
}

@Serializable
data class HealthEvent(
    val id: String = "ev_${newId().take(8)}",
    val title: String = "",
    val activity: String = "yoga",
    val format: String = "in_person",
    val frequency: String = "weekly",
    val customEveryDays: Int = 2,
    val durationMin: Int = 60,
    val time: String = "07:00",
    val url: String = "",
) {
    /** As lib/health/events describeSchedule. */
    val schedule: String get() {
        val dur = if (durationMin > 0) " · ${if (durationMin % 60 == 0) "${durationMin / 60}" else "%.1f".format(durationMin / 60.0)}h" else ""
        val at = if (time.isNotEmpty()) " at $time" else ""
        return when (frequency) {
            "once" -> "One-time$at$dur"
            "daily" -> "Every day$at$dur"
            "monthly" -> "Monthly$at$dur"
            "custom" -> "Every $customEveryDays days$at$dur"
            else -> "Weekly$at$dur"
        }
    }
}

@Serializable
private data class HealthReply(val targets: HealthTargets, val plan: String? = null, val provider: String? = null, val warning: String? = null)

class HealthModel(context: Context, private val local: Local) {
    private val prefs = context.getSharedPreferences("health", Context.MODE_PRIVATE)
    var input by mutableStateOf(prefs.getString("lastInput", null)?.let { runCatching { json.decodeFromString(HealthInput.serializer(), it) }.getOrNull() } ?: HealthInput())
    var events by mutableStateOf(prefs.getString("events", null)?.let { runCatching { json.decodeFromString(ListSerializer(HealthEvent.serializer()), it) }.getOrNull() } ?: emptyList())
        private set
    var targets by mutableStateOf<HealthTargets?>(null)
        private set
    var plan by mutableStateOf<String?>(null)
        private set
    var provider by mutableStateOf("")
        private set
    var loading by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    fun setEvents(list: List<HealthEvent>) {
        events = list
        prefs.edit().putString("events", json.encodeToString(ListSerializer(HealthEvent.serializer()), list)).apply()
    }

    suspend fun generate() {
        loading = true
        error = null
        plan = null
        prefs.edit().putString("lastInput", json.encodeToString(HealthInput.serializer(), input)).apply()
        try {
            val reply = json.decodeFromString(HealthReply.serializer(), Api.backend.send("POST", "/api/tools/health", input.body()))
            targets = reply.targets
            plan = reply.plan
            provider = reply.provider.orEmpty()
            error = reply.warning
            reply.plan?.takeIf { it.isNotBlank() }?.let { p ->
                val inputs = listOf("Goal" to input.goal, "Focus" to input.focus, "Activity" to input.activity, "Diet" to input.dietaryPreference)
                    .filter { it.second.isNotBlank() }.map { Generation.Input(it.first, it.second) }
                local.addGeneration(Generation("gen_${newId()}", "health", "health", "Health Engine", "Health plan: ${input.goal} · ${input.focus}", "markdown", now(), inputs, p))
            }
        } catch (e: Exception) {
            error = e.message
        }
        loading = false
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun HealthScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val model = remember { HealthModel(context, Local.get(context)) }
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(0) }
    var fineTune by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf<HealthEvent?>(null) }
    var activityFilter by remember { mutableStateOf("all") }
    var formatFilter by remember { mutableStateOf("all") }
    LaunchedEffect(Unit) { Catalog.load(context) }
    val health = Catalog.data?.health
    val labels = health?.activities.orEmpty()
    fun label(a: String) = labels[a] ?: a.replaceFirstChar(Char::uppercase)
    val f = model.input
    fun update(change: HealthInput.() -> HealthInput) { model.input = model.input.change() }

    @Composable
    fun Segments(options: List<Pair<String, String>>, value: String, onPick: (String) -> Unit) {
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            options.forEachIndexed { i, (v, l) ->
                SegmentedButton(selected = value == v, onClick = { onPick(v) }, shape = SegmentedButtonDefaults.itemShape(i, options.size)) { Text(l, fontSize = 12.sp) }
            }
        }
    }

    @Composable
    fun NumberField(label: String, value: Int?, onChange: (Int?) -> Unit) {
        Field(label, value?.toString().orEmpty(), { onChange(it.filter(Char::isDigit).take(3).toIntOrNull()) }, keyboard = KeyboardType.Number)
    }

    @Composable
    fun Stat(label: String, value: String, sub: String? = null, color: Color = Palette.secondary) {
        Column(Modifier.width(90.dp)) {
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = color)
            Text(label.uppercase(), fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
            sub?.let { Text(it, fontSize = 10.sp, color = Palette.muted) }
        }
    }

    draft?.let { d ->
        return AddHealthEventScreen(d, labels, onCancel = { draft = null }) { model.setEvents(listOf(it) + model.events); draft = null }
    }

    ListScreen("Health Engine", loaded = true, refresh = { Catalog.load(context, refresh = true) }, onBack = onBack) {
        item { Segments(listOf("plan" to "Plan", "events" to "Events & classes"), if (tab == 0) "plan" else "events") { tab = if (it == "plan") 0 else 1 } }
        if (tab == 0) {
            item {
                Panel {
                    SectionLabel("Your goal")
                    Segments(listOf("lose" to "Lose", "maintain" to "Maintain", "gain" to "Gain"), f.goal) { v -> update { copy(goal = v) } }
                    Segments(listOf("nutrition" to "Nutrition", "exercise" to "Exercise", "both" to "Both"), f.focus) { v -> update { copy(focus = v) } }
                    SectionLabel("Basics")
                    Segments(listOf("male" to "Male", "female" to "Female"), f.sex) { v -> update { copy(sex = v) } }
                    NumberField("Age", f.age) { v -> update { copy(age = v ?: 0) } }
                    NumberField("Height (cm)", f.heightCm) { v -> update { copy(heightCm = v ?: 0) } }
                    NumberField("Weight (kg)", f.weightKg) { v -> update { copy(weightKg = v ?: 0) } }
                    val activities = listOf("sedentary" to "Sedentary (desk)", "light" to "Light (1-3 d/wk)", "moderate" to "Moderate (3-5 d/wk)",
                        "active" to "Active (6-7 d/wk)", "very_active" to "Very active / athlete")
                    Choice("Activity", activities.map { it.second }, activities.first { it.first == f.activity }.second) { pick ->
                        update { copy(activity = activities.first { it.second == pick }.first) }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Fine-tune (optional)", Modifier.weight(1f))
                        Switch(fineTune, { fineTune = it })
                    }
                }
            }
            if (fineTune) item {
                Panel {
                    if (f.goal != "maintain") {
                        NumberField("Target weight (kg)", f.targetWeightKg) { v -> update { copy(targetWeightKg = v) } }
                        Segments(listOf("relaxed" to "Relaxed", "steady" to "Steady", "aggressive" to "Aggressive"), f.pace) { v -> update { copy(pace = v) } }
                    }
                    if (f.focus != "exercise") {
                        Field("Dietary preference", f.dietaryPreference, { v -> update { copy(dietaryPreference = v) } }, placeholder = "veg, vegan, keto, jain, halal…")
                        Field("Allergies (comma-separated)", f.allergies, { v -> update { copy(allergies = v) } })
                        Field("Cuisine", f.cuisine, { v -> update { copy(cuisine = v) } }, placeholder = "e.g. North Indian")
                        NumberField("Meals per day", f.mealsPerDay) { v -> update { copy(mealsPerDay = v) } }
                    }
                    if (f.focus != "nutrition") {
                        NumberField("Training days per week", f.trainingDaysPerWeek) { v -> update { copy(trainingDaysPerWeek = v) } }
                        NumberField("Session length (min)", f.sessionMinutes) { v -> update { copy(sessionMinutes = v) } }
                        val levels = listOf("" to "-", "beginner" to "Beginner", "intermediate" to "Intermediate", "advanced" to "Advanced")
                        Choice("Experience", levels.map { it.second }, levels.first { it.first == f.experience }.second) { pick ->
                            update { copy(experience = levels.first { it.second == pick }.first) }
                        }
                        Field("Equipment", f.equipment, { v -> update { copy(equipment = v) } }, placeholder = "home / gym / bodyweight")
                        Field("Injuries / cautions", f.injuries, { v -> update { copy(injuries = v) } })
                    }
                    Field("Medical conditions", f.conditions, { v -> update { copy(conditions = v) } }, placeholder = "planned cautiously")
                }
            }
            item {
                if (model.loading) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                    Text("Building your plan…", fontSize = 13.sp, color = Palette.secondary)
                } else GlowButton("Generate my plan") { scope.launch { model.generate() } }
            }
            model.error?.let { item { Text(it, fontSize = 12.sp, color = Palette.warning) } }
            model.targets?.let { t ->
                item("targets") {
                    Panel {
                        SectionLabel("Your daily targets (computed, exact)", Palette.success)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Stat("Calories", "${t.goalCalories}", "${if (t.dailyDeltaKcal >= 0) "+" else ""}${t.dailyDeltaKcal} vs maint.", Palette.success)
                            Stat("Protein", "${t.macros.proteinG}g", "${t.proteinPerKg} g/kg", Palette.blue)
                            Stat("Fat", "${t.macros.fatG}g", color = Palette.warning)
                            Stat("Carbs", "${t.macros.carbsG}g", color = Palette.violet)
                            Stat("BMR", "${t.bmr}")
                            Stat("TDEE", "${t.tdee}")
                            Stat("BMI", "${t.bmi}", t.bmiCategory)
                            Stat("Water", "%.1fL".format(t.waterMl / 1000.0))
                        }
                        if (t.healthyWeightRangeKg.size == 2) Text(
                            "Healthy weight for your height: ${t.healthyWeightRangeKg[0]}-${t.healthyWeightRangeKg[1]} kg" +
                                (if (t.estWeeklyChangeKg != 0.0) " · ~${kotlin.math.abs(t.estWeeklyChangeKg)} kg/week" else "") +
                                (t.etaWeeks?.let { " · ~${it.toInt()} weeks to target" } ?: ""),
                            fontSize = 11.sp, color = Palette.muted,
                        )
                        t.warnings.forEach { Text("• $it", fontSize = 11.sp, color = Palette.warning) }
                    }
                }
            }
            model.plan?.let { p ->
                item("plan") {
                    Panel {
                        SectionLabel(if (model.provider.isEmpty()) "Your plan" else "Your plan · via ${model.provider}", Palette.success)
                        MarkdownText(p)
                    }
                }
                item("planActions") { OutputActions(p, "health-plan.md") }
            }
        } else {
            item { SectionLabel("My health schedule") }
            if (model.events.isEmpty()) item { Hint("Nothing scheduled yet. Add a class, run or game, daily, weekly or any rhythm; it's kept on this phone.") }
            model.events.forEach { e ->
                item(e.id) {
                    Row(Modifier.card(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(e.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text("${label(e.activity)} · ${if (e.format == "online") "online" else "in-person"}", fontSize = 11.sp, color = Palette.success)
                            Text(e.schedule, fontSize = 12.sp, color = Palette.secondary)
                            if (e.url.isNotBlank()) TextButton(onClick = { openInBrowser(context, e.url) }) { Text("Open booking link", fontSize = 12.sp) }
                        }
                        IconButton(onClick = { model.setEvents(model.events.filter { it.id != e.id }) }) { Icon(Icons.Outlined.Delete, "Delete", tint = Palette.muted) }
                    }
                }
            }
            item { TextButton(onClick = { draft = HealthEvent() }) { Text("Add an event") } }
            item { SectionLabel("Find & book events") }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (listOf("all") + labels.keys.sorted()).forEach { a ->
                        FilterChip(selected = activityFilter == a, onClick = { activityFilter = a }, label = { Text(if (a == "all") "All" else label(a), fontSize = 11.sp) })
                    }
                }
            }
            item { Segments(listOf("all" to "Any", "in_person" to "In-person", "online" to "Online"), formatFilter) { formatFilter = it } }
            health?.platforms.orEmpty().filter {
                (activityFilter == "all" || activityFilter in it.activities) && (formatFilter == "all" || it.format == formatFilter || it.format == "both")
            }.forEach { p ->
                item("p-${p.id}") {
                    Column(Modifier.card { openInBrowser(context, p.url) }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(p.name, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        Text(p.blurb, fontSize = 12.sp, color = Palette.muted)
                        Text((p.activities.take(4).map(::label) + if (p.format == "both") "in-person + online" else if (p.format == "online") "online" else "in-person").joinToString(" · "),
                            fontSize = 10.sp, color = Palette.muted)
                    }
                }
            }
            item { Hint("Live timings, slots and prices are on each provider when you open it. We link out; we don't book for you.") }
        }
    }
}

@Composable
private fun AddHealthEventScreen(start: HealthEvent, labels: Map<String, String>, onCancel: () -> Unit, onAdd: (HealthEvent) -> Unit) {
    var e by remember { mutableStateOf(start) }
    val frequencies = listOf("once" to "One-time", "daily" to "Daily", "weekly" to "Weekly", "monthly" to "Monthly", "custom" to "Custom")
    val activities = labels.entries.sortedBy { it.key }.map { it.key to it.value }.ifEmpty { listOf("yoga" to "Yoga") }
    ListScreen("Add an event", loaded = true, refresh = {}, onBack = onCancel) {
        item {
            Panel {
                Field("Event name", e.title, { e = e.copy(title = it) }, placeholder = "e.g. Morning yoga")
                Choice("Activity", activities.map { it.second }, activities.firstOrNull { it.first == e.activity }?.second ?: e.activity) { pick ->
                    e = e.copy(activity = activities.first { it.second == pick }.first)
                }
                Choice("Format", listOf("In-person", "Online"), if (e.format == "online") "Online" else "In-person") { e = e.copy(format = if (it == "Online") "online" else "in_person") }
                Choice("Repeats", frequencies.map { it.second }, frequencies.first { it.first == e.frequency }.second) { pick ->
                    e = e.copy(frequency = frequencies.first { it.second == pick }.first)
                }
                if (e.frequency == "custom") Field("Every how many days", e.customEveryDays.toString(), { v -> e = e.copy(customEveryDays = v.filter(Char::isDigit).take(2).toIntOrNull() ?: 2) }, keyboard = KeyboardType.Number)
                Field("Duration (min)", e.durationMin.toString(), { v -> e = e.copy(durationMin = v.filter(Char::isDigit).take(3).toIntOrNull() ?: 0) }, keyboard = KeyboardType.Number)
                Field("Time (HH:MM)", e.time, { v -> e = e.copy(time = v.filter { it.isDigit() || it == ':' }.take(5)) })
                Field("Booking link (optional)", e.url, { e = e.copy(url = it.trim()) }, keyboard = KeyboardType.Uri)
            }
        }
        item {
            val valid = e.title.isNotBlank() && Regex("""^([01]\d|2[0-3]):[0-5]\d$""").matches(e.time)
            GlowButton("Add", enabled = valid) { onAdd(e.copy(title = e.title.trim())) }
        }
    }
}
