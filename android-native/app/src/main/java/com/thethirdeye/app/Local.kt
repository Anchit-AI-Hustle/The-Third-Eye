package com.thethirdeye.app

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.content.Context
import androidx.compose.runtime.mutableStateOf
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.KSerializer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class Generation(
    val id: String,
    val app: String,
    val tool: String? = null,
    val appLabel: String,
    val title: String,
    val kind: String = "markdown",
    val createdAt: String,
    val inputs: List<Input> = emptyList(),
    val output: String,
) {
    @Serializable data class Input(val label: String, val value: String)
}

@Serializable
data class Skill(val id: String, val name: String, val description: String? = null, val steps: List<String>, val createdAt: String, val updatedAt: String)

@Serializable
data class Brand(
    val name: String = "",
    val industry: String = "",
    val product: String = "",
    val audience: String = "",
    val positioning: String = "",
    val usp: String = "",
    val pricePoint: String = "",
    val region: String = "",
    val channels: List<String> = emptyList(),
    val competitors: String = "",
    val toneOfVoice: String = "",
    val stage: String = "",
    val goals: String = "",
    val metricsNote: String = "",
    val constraints: String = "",
)

const val MAX_GENERATIONS = 500
const val MAX_SKILLS = 200

/** Newest first, the oldest dropped past the cap. */
fun withGeneration(list: List<Generation>, g: Generation): List<Generation> = (listOf(g) + list.filterNot { it.id == g.id }).take(MAX_GENERATIONS)

fun searchGenerations(list: List<Generation>, query: String, app: String?): List<Generation> = list.filter { g ->
    (app == null || g.app == app) && (query.isBlank() || g.title.contains(query.trim(), ignoreCase = true) || g.output.contains(query.trim(), ignoreCase = true))
}

fun withSkill(list: List<Skill>, skill: Skill): List<Skill> =
    if (list.any { it.id == skill.id }) list.map { if (it.id == skill.id) skill else it } else (listOf(skill) + list).take(MAX_SKILLS)

/** The instruction the assistant runs for a skill, the same text as the website's composeSkillRun. */
fun composeSkillRun(skill: Skill): String {
    val steps = skill.steps.filter { it.isNotBlank() }.mapIndexed { i, s -> "${i + 1}. ${s.trim()}" }.joinToString("\n")
    return listOf(
        "Run my saved automation \"${skill.name}\".",
        skill.description?.takeIf { it.isNotEmpty() }?.let { "Goal: $it" } ?: "",
        "Do these steps in order, using your tools. Pause for my approval on anything sensitive (payments, emails, messages). If a step can't be done, say so and continue with the rest.",
        "",
        steps,
    ).filter { it.isNotEmpty() }.joinToString("\n")
}

/** Things kept on this phone only, like the website keeps them in its browser. Gone on sign-out. */
class Local private constructor(context: Context) {
    private val prefs = context.getSharedPreferences("local-data", Context.MODE_PRIVATE)

    var generations by mutableStateOf(read("generations", Generation.serializer()))
        private set
    var skills by mutableStateOf(read("skills", Skill.serializer()))
        private set
    var brand by mutableStateOf(prefs.getString("brand", null)?.let { runCatching { json.decodeFromString(Brand.serializer(), it) }.getOrNull() } ?: Brand())
        private set
    var mode by mutableStateOf(prefs.getString("mode", null) ?: "personal")
        private set

    private fun <T> read(key: String, item: KSerializer<T>): List<T> =
        prefs.getString(key, null)?.let { runCatching { json.decodeFromString(ListSerializer(item), it) }.getOrNull() } ?: emptyList()

    private fun <T> write(key: String, item: KSerializer<T>, list: List<T>) {
        prefs.edit().putString(key, json.encodeToString(ListSerializer(item), list)).apply()
    }

    fun addGeneration(g: Generation) {
        generations = withGeneration(generations, g)
        write("generations", Generation.serializer(), generations)
        CoroutineScope(Dispatchers.IO).launch { runCatching { DataStore.insert("generations", generationRow(g)) } }
    }

    fun deleteGeneration(id: String) {
        generations = generations.filterNot { it.id == id }
        write("generations", Generation.serializer(), generations)
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { if (id.startsWith("music_")) DataStore.delete("music_tracks", id.removePrefix("music_")) else DataStore.delete("generations", id) }
        }
    }

    fun saveSkill(skill: Skill) {
        skills = withSkill(skills, skill)
        write("skills", Skill.serializer(), skills)
    }

    fun deleteSkill(id: String) {
        skills = skills.filterNot { it.id == id }
        write("skills", Skill.serializer(), skills)
    }

    fun saveBrand(value: Brand) {
        brand = value
        prefs.edit().putString("brand", json.encodeToString(Brand.serializer(), value)).apply()
    }

    fun pickMode(value: String) {
        mode = value
        prefs.edit().putString("mode", value).apply()
    }

    fun clear() {
        generations = emptyList()
        skills = emptyList()
        brand = Brand()
        mode = "personal"
        prefs.edit().clear().apply()
    }

    companion object {
        @Volatile private var instance: Local? = null
        fun get(context: Context): Local = instance ?: synchronized(this) { instance ?: Local(context.applicationContext).also { instance = it } }
    }
}

/** The account's copy, so it lists with everything made on the website and other devices. */
fun generationRow(g: Generation): JsonObject = buildJsonObject {
    put("id", g.id); put("app", g.app); put("tool", g.tool?.let { JsonPrimitive(it) } ?: JsonNull)
    put("app_label", g.appLabel); put("title", g.title); put("kind", g.kind); put("created_at", g.createdAt)
    put("inputs", buildJsonArray { g.inputs.forEach { i -> add(buildJsonObject { put("label", i.label); put("value", i.value) }) } })
    put("output", if (g.output.length <= 1_500_000) g.output else "")
}
