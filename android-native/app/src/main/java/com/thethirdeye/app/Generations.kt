package com.thethirdeye.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Generation.fileName get() = "${tool ?: app}.${if (kind == "html") "html" else "md"}"

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun GenerationsScreen(onBack: () -> Unit) {
    val local = Local.get(LocalContext.current)
    var query by remember { mutableStateOf("") }
    var app by remember { mutableStateOf<String?>(null) }
    var openId by remember { mutableStateOf<String?>(null) }
    val open = local.generations.firstOrNull { it.id == openId }
    BackHandler(open != null) { openId = null }

    if (open != null) return GenerationDetail(open, onBack = { openId = null }, onDelete = { local.deleteGeneration(open.id); openId = null })

    val apps = local.generations.map { it.app to it.appLabel }.distinct()
    val shown = searchGenerations(local.generations, query, app)
    ListScreen("Generations", loaded = true, refresh = {}, onBack = onBack) {
        item { Field("Search", query, { query = it }) }
        if (apps.size > 1) item("apps") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(app == null, { app = null }, label = { Text("All") })
                apps.forEach { (id, label) -> FilterChip(app == id, { app = id }, label = { Text(label) }) }
            }
        }
        if (local.generations.isEmpty()) item { Hint("Things you make in this app's Studio and Kolab show up here. Website creations stay in that browser.") }
        else if (shown.isEmpty()) item { Hint("Nothing matches.") }
        shown.forEach { g ->
            item(g.id) {
                Column(Modifier.card { openId = g.id }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(g.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text("${g.appLabel} · ${isoDate(g.createdAt)}", fontSize = 12.sp, color = Palette.muted)
                    Text(g.output.replace(Regex("""[#*`>|]"""), "").trim(), fontSize = 12.sp, color = Palette.secondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun GenerationDetail(g: Generation, onBack: () -> Unit, onDelete: () -> Unit) {
    ListScreen(g.appLabel, loaded = true, refresh = {}, onBack = onBack) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(g.title, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                Text(isoDate(g.createdAt), fontSize = 12.sp, color = Palette.muted)
            }
        }
        if (g.inputs.isNotEmpty()) item("inputs") {
            Panel {
                SectionLabel("Inputs")
                g.inputs.forEach { Column { Text(it.label, fontSize = 12.sp, color = Palette.muted); Text(it.value, fontSize = 14.sp) } }
            }
        }
        item("output") { Panel { SectionLabel("Output"); GeneratedOutput(g.output, g.kind) } }
        item("actions") {
            OutputActions(g.output, g.fileName) {
                TextButton(onClick = onDelete) { Icon(Icons.Outlined.Delete, null, Modifier.size(18.dp), tint = Palette.red); Text("  Delete", color = Palette.red) }
            }
        }
    }
}
