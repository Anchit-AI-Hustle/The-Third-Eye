package com.thethirdeye.app

import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.content.Context
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import kotlinx.serialization.Serializable

// GET /api/catalog: the website's built-in lists (Studio tools, apps, capabilities,
// agents, audits, plans), so these screens stay in step with the site.
@Serializable
data class CatalogData(
    val studios: Map<String, Studio> = emptyMap(),
    val categoryOrder: Map<String, List<String>> = emptyMap(),
    val studioTools: List<StudioTool> = emptyList(),
    val apps: List<AppEntry> = emptyList(),
    val capabilities: List<Capability> = emptyList(),
    val systems: List<AgentSystem> = emptyList(),
    val audits: List<Audit> = emptyList(),
    val plans: Plans = Plans(),
) {
    @Serializable data class Studio(val name: String = "", val tagline: String = "", val accent: String = "#4FC3F7", val icon: String = "")

    @Serializable
    data class StudioTool(
        val id: String,
        val label: String,
        val mode: String = "personal",
        val icon: String = "",
        val accent: String = "#4FC3F7",
        val blurb: String = "",
        val format: String = "markdown",
        val downloadExt: String = "md",
        val cta: String = "Generate",
        val category: String = "More",
        val fields: List<Field> = emptyList(),
    )

    @Serializable
    data class Field(
        val name: String,
        val label: String,
        val type: String = "text",
        val placeholder: String? = null,
        val options: List<String> = emptyList(),
        val required: Boolean = false,
    )

    @Serializable
    data class AppEntry(
        val id: String,
        val label: String,
        val category: String = "",
        val modes: List<String> = emptyList(),
        val kind: String = "internal",
        val href: String,
        val icon: String = "",
        val blurb: String? = null,
        val selfBuilt: Boolean = false,
        val emergency: Boolean = false,
    )

    @Serializable
    data class Capability(
        val group: String,
        val name: String,
        val blurb: String = "",
        val inspiration: String = "",
        val required: List<String> = emptyList(),
        val envKey: String? = null,
        val status: String = "planned",
        val premium: Boolean = false,
        val logo: String? = null,
    )

    @Serializable
    data class AgentSystem(
        val id: String,
        val name: String,
        val accentColor: String = "#4FC3F7",
        val purpose: String = "",
        val href: String = "",
        val kind: String = "agent",
        val lang: String = "en-US",
        val pitch: Double = 1.0,
        val rate: Double = 1.0,
        val lines: List<String> = emptyList(),
    )

    @Serializable
    data class Audit(
        val page: String,
        val href: String = "",
        val current: Double = 0.0,
        val target: Double = 0.0,
        val dims: Dims = Dims(),
        val verdict: String = "",
        val issues: List<Issue> = emptyList(),
    ) {
        @Serializable data class Dims(val accuracy: Double = 0.0, val implementation: Double = 0.0, val execution: Double = 0.0, val results: Double = 0.0)
        @Serializable data class Issue(val severity: String = "low", val text: String = "", val fix: String = "", val status: String = "pending")
    }

    @Serializable
    data class Plans(
        val tiers: List<Tier> = emptyList(),
        val periods: List<Period> = emptyList(),
        val bundles: List<Bundle> = emptyList(),
        val costs: Map<String, Double> = emptyMap(),
        val levels: List<Level> = emptyList(),
    ) {
        @Serializable
        data class Tier(
            val id: String,
            val label: String,
            val badge: String = "",
            val color: String = "#8E8EBC",
            val monthlyCredits: Double = 0.0,
            val priceMonthlyInr: Double = 0.0,
            val features: List<String> = emptyList(),
            val prices: Map<String, Double> = emptyMap(),
        )
        @Serializable data class Period(val id: String, val label: String, val days: Double = 0.0, val note: String? = null)
        @Serializable data class Bundle(val id: String, val label: String, val credits: Double = 0.0, val bonus: Double = 0.0, val priceInr: Double = 0.0, val best: Boolean = false)
        @Serializable data class Level(val min: Double = 0.0, val name: String, val avatar: String = "")
    }
}

val appModes = listOf("personal" to "Personal", "professional" to "Professional", "enterprise" to "Enterprise")

fun hexColor(hex: String): Color = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Palette.blue)

/** The wallet level for `used` creations, and how many more reach the next one. */
fun levelFor(levels: List<CatalogData.Plans.Level>, used: Double): LevelProgress? {
    val sorted = levels.sortedBy { it.min }
    val current = sorted.lastOrNull { used >= it.min } ?: return null
    val next = sorted.firstOrNull { it.min > current.min }
    return LevelProgress(current, next, next?.let { (it.min - used).toInt() })
}

data class LevelProgress(val level: CatalogData.Plans.Level, val next: CatalogData.Plans.Level?, val remaining: Int?)

/** Held in memory for the run and on disk for offline; a refresh replaces both. */
object Catalog {
    var data by mutableStateOf<CatalogData?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun parse(text: String): CatalogData = json.decodeFromString(CatalogData.serializer(), text)

    suspend fun load(context: Context, refresh: Boolean = false) {
        if (data != null && !refresh) return
        val prefs = context.getSharedPreferences("catalog", Context.MODE_PRIVATE)
        try {
            val text = Api.backend.send("GET", "/api/catalog")
            data = parse(text)
            prefs.edit().putString("last", text).apply()
            error = null
        } catch (e: Exception) {
            if (data == null) data = prefs.getString("last", null)?.let { runCatching { parse(it) }.getOrNull() }
            error = if (data == null) e.message else null
        }
    }
}
