package com.thethirdeye.app

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

// The app's own record of every action it ran for the person, and a kill
// switch that stops it running any, like the website's Agent Activity page.
// Kept on this phone: it records what this app did.
class AgentLog private constructor(context: Context) {
    @Serializable
    data class Entry(val at: Long, val label: String, val outcome: String, val detail: String? = null)

    private val prefs = context.getSharedPreferences("agent-log", Context.MODE_PRIVATE)
    var entries by mutableStateOf(load())
        private set
    var killed by mutableStateOf(prefs.getBoolean("killed", false))
        private set

    private fun load(): List<Entry> =
        prefs.getString("entries", null)?.let { runCatching { json.decodeFromString(ListSerializer(Entry.serializer()), it) }.getOrNull() } ?: emptyList()

    fun halt(on: Boolean) {
        killed = on
        prefs.edit().putBoolean("killed", on).apply()
    }

    fun record(label: String, outcome: String, detail: String? = null) {
        entries = (listOf(Entry(System.currentTimeMillis(), label, outcome, detail)) + entries).take(500)
        prefs.edit().putString("entries", json.encodeToString(ListSerializer(Entry.serializer()), entries)).apply()
    }

    fun clear() {
        entries = emptyList()
        prefs.edit().remove("entries").apply()
    }

    companion object {
        @Volatile private var instance: AgentLog? = null
        fun get(context: Context): AgentLog = instance ?: synchronized(this) { instance ?: AgentLog(context.applicationContext).also { instance = it } }
    }
}

private val stamp = DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT)
private fun whenText(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).format(stamp)

@Composable
fun ActivityScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val log = AgentLog.get(context)
    ListScreen("Agent Activity", loaded = true, refresh = {}, onBack = onBack, actions = {
        if (log.entries.isNotEmpty()) {
            TextButton(onClick = { log.clear() }) { Text("Clear", color = Palette.red) }
            IconButton(onClick = {
                val text = log.entries.joinToString("\n") { "${Instant.ofEpochMilli(it.at)}\t${it.outcome}\t${it.label}\t${it.detail ?: ""}" }
                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Export log"))
            }) { Icon(Icons.Outlined.Share, contentDescription = "Export log") }
        }
    }) {
        item {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(if (log.killed) "Agent halted" else "Agent active", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = if (log.killed) Palette.red else Palette.blue)
                        Text(
                            if (log.killed) "The kill switch is on: approved actions are blocked and logged." else "Actions you approve run and are logged here.",
                            fontSize = 12.sp, color = Palette.muted,
                        )
                    }
                    Switch(!log.killed, { log.halt(!it) }, colors = SwitchDefaults.colors(checkedTrackColor = Palette.blue))
                }
            }
        }
        item { SectionLabel("Log") }
        if (log.entries.isEmpty()) item { Hint("Nothing yet. Every action you approve in the Assistant is recorded here.") }
        log.entries.forEach { e ->
            item {
                Row(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        when (e.outcome) { "applied" -> Icons.Outlined.CheckCircle; "blocked" -> Icons.Outlined.Block; else -> Icons.Outlined.WarningAmber },
                        contentDescription = e.outcome,
                        tint = if (e.outcome == "applied") Palette.blue else Palette.red,
                    )
                    Column {
                        Text(e.label, fontSize = 14.sp)
                        Text(listOf(whenText(e.at), e.detail ?: "").filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Palette.muted, maxLines = 3)
                    }
                }
            }
        }
    }
}
