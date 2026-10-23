package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AddCircle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

val goalCategories = listOf("Personal", "Health", "Career", "Finance", "Learning")

class GoalsModel : Records<Goal>("goals") {
    override suspend fun fetch() = DataStore.rows<Goal>("goals")

    suspend fun add(title: String, target: Double, unit: String, category: String) = mutate {
        DataStore.insert("goals", buildJsonObject {
            put("id", newId()); put("title", title); put("target", target); put("current", 0)
            put("unit", unit); put("category", category); put("created_at", now())
        })
    }

    suspend fun setCurrent(goal: Goal, value: Double) =
        mutate({ list -> list.map { if (it.id == goal.id) it.copy(current = value) else it } }) {
            DataStore.update("goals", goal.id, buildJsonObject { put("current", value) })
        }
}

@Composable
fun GoalsScreen(onBack: () -> Unit, model: GoalsModel = remember { GoalsModel() }) {
    val scope = rememberCoroutineScope()
    var adding by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }

    ListScreen("Goals", model.loaded, refresh = { model.load() }, onBack = onBack, actions = {
        IconButton(onClick = { adding = true }) { Icon(Icons.Outlined.Add, contentDescription = "New goal") }
    }) {
        item { ErrorText(model.error) }
        if (model.loaded && model.items.isEmpty()) item { Hint("No goals yet. Tap + to set one.") }
        model.items.forEach { goal ->
            item(goal.id) {
                Column(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).padding(12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(goal.title, Modifier.weight(1f), fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        Text("${(goal.progress * 100).toInt()}%", fontSize = 13.sp, fontFamily = FontFamily.Monospace, color = Palette.blue)
                    }
                    LinearProgressIndicator(progress = { goal.progress }, Modifier.fillMaxWidth(), color = Palette.blue, trackColor = Palette.border)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${formatNumber(goal.current)} / ${formatNumber(goal.target)} ${goal.unit ?: ""}" + (goal.category?.let { " · $it" } ?: ""),
                            Modifier.weight(1f), fontSize = 12.sp, color = Palette.secondary,
                        )
                        IconButton(onClick = { scope.launch { model.setCurrent(goal, maxOf(0.0, goal.current - 1)) } }) { Icon(Icons.Outlined.RemoveCircleOutline, contentDescription = "Decrease") }
                        IconButton(onClick = { scope.launch { model.setCurrent(goal, goal.current + 1) } }) { Icon(Icons.Outlined.AddCircle, contentDescription = "Increase", tint = Palette.blue) }
                        IconButton(onClick = { scope.launch { model.remove(goal.id) { it.id } } }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                    }
                }
            }
        }
    }

    if (adding) NewGoal(onDismiss = { adding = false }) { title, target, unit, category ->
        adding = false
        scope.launch { model.add(title, target, unit, category) }
    }
}

@Composable
private fun NewGoal(onDismiss: () -> Unit, onSave: (String, Double, String, String) -> Unit) {
    var title by remember { mutableStateOf("") }
    var target by remember { mutableStateOf("10") }
    var unit by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("Personal") }
    val value = target.toDoubleOrNull() ?: 0.0
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Palette.elevated,
        title = { Text("New goal") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Goal") }, singleLine = true)
                OutlinedTextField(target, { target = it }, Modifier.fillMaxWidth(), label = { Text("Target") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))
                OutlinedTextField(unit, { unit = it }, Modifier.fillMaxWidth(), label = { Text("Unit (km, books, ₹…)") }, singleLine = true)
                Choice("Category", goalCategories, category) { category = it }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(title.trim(), value, unit, category) }, enabled = title.isNotBlank() && value > 0) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** A labelled dropdown of fixed options. */
@Composable
fun Choice(label: String, options: List<String>, value: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Column {
            TextButton(onClick = { open = true }) { Text(value) }
            androidx.compose.material3.DropdownMenu(open, onDismissRequest = { open = false }) {
                options.forEach { o -> androidx.compose.material3.DropdownMenuItem(text = { Text(o) }, onClick = { onPick(o); open = false }) }
            }
        }
    }
}
