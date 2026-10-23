package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** The apps for a mode that match a search, grouped by category in the order first seen. */
fun appsFor(apps: List<CatalogData.AppEntry>, mode: String, query: String): List<Pair<String, List<CatalogData.AppEntry>>> =
    apps.filter { mode in it.modes && (query.isBlank() || it.label.contains(query.trim(), ignoreCase = true) || it.blurb.orEmpty().contains(query.trim(), ignoreCase = true)) }
        .groupBy { it.category }.toList()

@Composable
fun AppsScreen(app: AppState, nav: Nav) {
    val context = LocalContext.current
    val local = Local.get(context)
    var query by remember { mutableStateOf("") }
    var dialing by remember { mutableStateOf<CatalogData.AppEntry?>(null) }
    LaunchedEffect(Unit) { Catalog.load(context) }
    val catalog = Catalog.data

    ListScreen("Apps", catalog != null || Catalog.error != null, refresh = { Catalog.load(context, refresh = true) }, onBack = nav::back) {
        item { ErrorText(Catalog.error) }
        if (catalog == null) return@ListScreen
        item { ModePicker(local.mode, local::pickMode) }
        item { Field("Search apps", query, { query = it }) }
        val groups = appsFor(catalog.apps, local.mode, query)
        if (groups.isEmpty()) item { Hint("No apps match.") }
        groups.forEach { (category, apps) ->
            item(category) { SectionLabel(category) }
            apps.forEach { entry ->
                item(entry.id) {
                    val tint = if (entry.emergency) Palette.red else Color.White
                    Row(
                        Modifier.card(
                            onClick = { if (entry.emergency && entry.href.startsWith("tel:")) dialing = entry else nav.open(entry.href, app, context) },
                            color = if (entry.emergency) Palette.red.copy(alpha = 0.12f) else Palette.surface.copy(alpha = 0.7f),
                        ),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(entry.label, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = tint)
                            entry.blurb?.let { Text(it, fontSize = 12.sp, color = if (entry.emergency) Palette.red.copy(alpha = 0.8f) else Palette.muted, maxLines = 2) }
                        }
                        if (entry.selfBuilt) Badge("Ours", Palette.blue)
                    }
                }
            }
        }
    }

    dialing?.let { entry ->
        AlertDialog(
            onDismissRequest = { dialing = null },
            containerColor = Palette.elevated,
            title = { Text("Call ${entry.label}?") },
            text = { Text(entry.href.removePrefix("tel:")) },
            confirmButton = { TextButton(onClick = { nav.open(entry.href, app, context); dialing = null }) { Text("Call", color = Palette.red) } },
            dismissButton = { TextButton(onClick = { dialing = null }) { Text("Cancel") } },
        )
    }
}
