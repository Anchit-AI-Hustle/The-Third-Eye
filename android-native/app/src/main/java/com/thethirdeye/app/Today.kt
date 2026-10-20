package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@Composable
fun TodayScreen(session: Session, app: AppState) {
    val scope = rememberCoroutineScope()
    val tasks = remember { TasksModel() }
    val goals = remember { GoalsModel() }
    val notes = remember { NotesModel() }
    var refreshing by remember { mutableStateOf(false) }
    suspend fun load() = coroutineScope {
        listOf(async { tasks.load() }, async { goals.load() }, async { notes.load() }).forEach { it.await() }
    }
    LaunchedEffect(Unit) { load() }
    ReloadOnDataChange { load() }

    Backdrop {
        PullToRefreshBox(refreshing, onRefresh = { scope.launch { refreshing = true; load(); refreshing = false } }, Modifier.fillMaxSize()) {
            Column(
                Modifier.align(Alignment.TopCenter).widthIn(max = 760.dp).fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(greeting(session.name), fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Text(LocalDateTime.now().format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL)), fontSize = 13.sp, color = Palette.secondary)
                    StatusPill("All systems online")
                }
                ErrorText(tasks.error ?: goals.error ?: notes.error)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Stat("${tasks.open.size}", "Open", Palette.blue, Modifier.weight(1f))
                    Stat("${tasks.open.count { it.urgent }}", "Urgent", Palette.red, Modifier.weight(1f))
                    Stat("${tasks.done.size}", "Done", Palette.violet, Modifier.weight(1f))
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("Give me my morning briefing", "Plan my day", "What's overdue?", "Summarise my week").forEach { q ->
                        TextButton(
                            onClick = { app.ask(q) },
                            modifier = Modifier.background(Palette.surface, CircleShape).border(1.dp, Palette.blue.copy(alpha = 0.3f), CircleShape),
                        ) { Text(q, fontSize = 13.sp) }
                    }
                }
                Panel {
                    SectionLabel("Today's focus")
                    if (tasks.open.isEmpty()) Hint(if (tasks.loaded) "Nothing open. Enjoy the clear day." else "Loading…")
                    tasks.open.take(5).forEach { t ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            IconButton(onClick = { scope.launch { tasks.toggle(t) } }) { Icon(Icons.Outlined.Circle, contentDescription = "Mark done", tint = Palette.muted) }
                            Text(t.title, Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                            if (t.urgent) Text(t.priority.replaceFirstChar { it.uppercase() }, fontSize = 11.sp, color = Palette.red)
                        }
                    }
                    TextButton(onClick = { app.tab = AppState.Tab.Tasks }) { Text("All tasks", fontSize = 13.sp) }
                }
                if (goals.items.isNotEmpty()) Panel {
                    SectionLabel("Goals")
                    goals.items.take(3).forEach { g ->
                        Row { Text(g.title, Modifier.weight(1f), fontSize = 14.sp); Text("${(g.progress * 100).toInt()}%", color = Palette.blue, fontSize = 14.sp) }
                        LinearProgressIndicator(progress = { g.progress }, Modifier.fillMaxWidth(), color = Palette.blue, trackColor = Palette.border)
                    }
                }
                if (notes.items.isNotEmpty()) Panel {
                    SectionLabel("Recent notes")
                    notes.items.take(3).forEach { n ->
                        Column {
                            Text(n.title.ifBlank { "Untitled" }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Text(n.content ?: "", fontSize = 12.sp, color = Palette.secondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    TextButton(onClick = { app.tab = AppState.Tab.Notes }) { Text("All notes", fontSize = 13.sp) }
                }
            }
        }
    }
}

fun greeting(name: String?, hour: Int = LocalDateTime.now().hour): String {
    val part = if (hour < 12) "Good morning" else if (hour < 17) "Good afternoon" else "Good evening"
    val first = name?.trim()?.split(" ")?.firstOrNull()?.takeIf { it.isNotBlank() }
    return if (first != null) "$part, $first" else part
}

@Composable
private fun Stat(value: String, label: String, color: Color, modifier: Modifier) {
    Column(
        modifier
            .background(Palette.surface.copy(alpha = 0.8f), RoundedCornerShape(14.dp))
            .border(1.dp, Palette.border, RoundedCornerShape(14.dp))
            .padding(vertical = 12.dp)
            .clearAndSetSemantics { contentDescription = "$value $label" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, fontSize = 24.sp, fontWeight = FontWeight.Bold, color = color)
        Text(label.uppercase(), fontSize = 10.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.5.sp, color = Palette.secondary)
    }
}
