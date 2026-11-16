package com.thethirdeye.app

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

data class AuditTotals(val current: Double, val target: Double, val pages: Int, val openIssues: Int)

fun auditTotals(audits: List<CatalogData.Audit>) = AuditTotals(
    current = if (audits.isEmpty()) 0.0 else audits.sumOf { it.current } / audits.size,
    target = if (audits.isEmpty()) 0.0 else audits.sumOf { it.target } / audits.size,
    pages = audits.size,
    openIssues = audits.sumOf { a -> a.issues.count { it.status != "fixed" } },
)

private fun severityColor(severity: String): Color = when (severity) {
    "critical" -> Palette.red
    "high" -> Color(0xFFFB923C)
    "medium" -> Palette.warning
    else -> Palette.muted
}

private fun scoreColor(n: Double): Color = when {
    n >= 8.5 -> Palette.success
    n >= 7 -> Palette.blue
    n >= 5 -> Palette.warning
    else -> Palette.red
}

@Composable
private fun Stat(value: String, label: String, color: Color = Color.White) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = color)
        Text(label, fontSize = 11.sp, color = Palette.muted)
    }
}

@Composable
private fun DimBar(label: String, value: Double) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(label.uppercase(), Modifier.weight(1f), fontSize = 10.sp, color = Palette.muted, fontFamily = FontFamily.Monospace)
            Text("%.1f".format(value), fontSize = 11.sp, color = scoreColor(value))
        }
        LinearProgressIndicator(progress = { (value / 10).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth(), color = Palette.blue, trackColor = Palette.border)
    }
}

@Composable
fun AuditScreen(app: AppState, nav: Nav) {
    val context = LocalContext.current
    var open by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { Catalog.load(context) }
    val catalog = Catalog.data

    ListScreen("App Audit", catalog != null || Catalog.error != null, refresh = { Catalog.load(context, refresh = true) }, onBack = nav::back) {
        item { ErrorText(Catalog.error) }
        if (catalog == null) return@ListScreen
        val totals = auditTotals(catalog.audits)
        item("totals") {
            Panel {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Stat("%.1f".format(totals.current), "now", scoreColor(totals.current))
                    Stat("%.1f".format(totals.target), "target", Palette.blue)
                    Stat(totals.pages.toString(), "pages")
                    Stat(totals.openIssues.toString(), "open issues", if (totals.openIssues > 0) Palette.warning else Palette.success)
                }
            }
        }
        catalog.audits.forEach { audit ->
            item(audit.page) {
                val expanded = open == audit.page
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            audit.page, Modifier.weight(1f).clickable { nav.open(audit.href, app, context) },
                            fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Palette.blue,
                        )
                        Text("%.1f → %.1f".format(audit.current, audit.target), fontSize = 13.sp, fontFamily = FontFamily.Monospace, color = scoreColor(audit.current))
                        IconButton(onClick = { open = if (expanded) null else audit.page }) {
                            Icon(if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, contentDescription = if (expanded) "Collapse" else "Expand", tint = Palette.muted)
                        }
                    }
                    if (expanded) {
                        DimBar("Accuracy", audit.dims.accuracy)
                        DimBar("Implementation", audit.dims.implementation)
                        DimBar("Execution", audit.dims.execution)
                        DimBar("Results", audit.dims.results)
                        Text(audit.verdict, fontSize = 13.sp, color = Palette.secondary)
                        audit.issues.forEach { issue ->
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Badge(issue.severity, severityColor(issue.severity))
                                    Badge(issue.status, if (issue.status == "fixed") Palette.success else Palette.muted)
                                }
                                Text(issue.text, fontSize = 13.sp)
                                Text("Fix: ${issue.fix}", fontSize = 12.sp, color = Palette.muted)
                            }
                        }
                    }
                }
            }
        }
    }
}
