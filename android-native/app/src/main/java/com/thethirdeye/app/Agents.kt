package com.thethirdeye.app

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Agents first, then subsystems, each in the website's order. */
fun orderedSystems(systems: List<CatalogData.AgentSystem>): List<CatalogData.AgentSystem> =
    systems.filter { it.kind == "agent" } + systems.filter { it.kind != "agent" }

@Composable
fun AgentsScreen(app: AppState, nav: Nav) {
    val context = LocalContext.current
    val log = AgentLog.get(context)
    val voice = remember { Voice(context) }
    var playing by remember { mutableStateOf<String?>(null) }
    DisposableEffect(Unit) { onDispose { voice.release() } }
    LaunchedEffect(Unit) { Catalog.load(context) }
    val catalog = Catalog.data
    val systems = orderedSystems(catalog?.systems.orEmpty())

    // One random line per system in turn; each system speaks in its own accent.
    fun rollCall(i: Int) {
        val system = systems.getOrNull(i)
        if (system == null) { playing = null; return }
        val line = system.lines.randomOrNull() ?: return rollCall(i + 1)
        playing = system.id
        voice.speak(line, Voice.Accent(system.lang, system.pitch.toFloat(), system.rate.toFloat(), system.gender)) { rollCall(i + 1) }
    }

    ListScreen("Online Agents", catalog != null || Catalog.error != null, refresh = { Catalog.load(context, refresh = true) }, onBack = nav::back) {
        item { ErrorText(Catalog.error) }
        if (catalog == null) return@ListScreen
        item("controls") {
            Panel {
                Text(
                    if (log.killed) "The kill switch is on: agents are halted." else "${systems.size} systems online.",
                    fontSize = 13.sp, color = if (log.killed) Palette.red else Palette.secondary,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlowButton("Run status check", enabled = playing == null && systems.isNotEmpty(), modifier = Modifier.weight(1f)) { rollCall(0) }
                    if (playing != null) TextButton(onClick = { voice.stopSpeaking(); playing = null }) { Text("Stop") }
                }
            }
        }
        systems.forEach { system ->
            item(system.id) {
                val accent = hexColor(system.accentColor)
                Column(
                    Modifier.card().then(if (playing == system.id) Modifier.border(1.dp, accent, RoundedCornerShape(12.dp)) else Modifier),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Dot(accent)
                        Text(system.name, Modifier.weight(1f), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        Badge(if (log.killed) "Halted" else "Online", if (log.killed) Palette.red else Palette.success)
                    }
                    Text(system.purpose, fontSize = 13.sp, color = Palette.secondary)
                    TextButton(onClick = { nav.open(system.href, app, context) }) { Text("Open", color = accent) }
                }
            }
        }
    }
}
