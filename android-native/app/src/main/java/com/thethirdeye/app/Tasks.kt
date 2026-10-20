package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

val priorities = listOf("low", "medium", "high", "urgent")

class TasksModel : Records<TaskItem>("tasks") {
    val open get() = items.filter { !it.done && it.status != "cancelled" }
    val done get() = items.filter { it.done }

    override suspend fun fetch() = DataStore.rows<TaskItem>("tasks")

    suspend fun add(title: String, priority: String) {
        val item = TaskItem(id = newId(), title = title, priority = priority)
        mutate({ listOf(item) + it }) {
            DataStore.insert("tasks", buildJsonObject {
                put("id", item.id); put("title", title); put("status", "todo"); put("priority", priority)
                put("created_at", now()); put("updated_at", now())
            })
        }
    }

    suspend fun toggle(item: TaskItem) {
        val status = if (item.done) "todo" else "done"
        mutate({ list -> list.map { if (it.id == item.id) it.copy(status = status) else it } }) {
            DataStore.update("tasks", item.id, buildJsonObject { put("status", status); put("updated_at", now()) })
        }
    }

    suspend fun save(item: TaskItem, title: String, description: String, priority: String, due: String?) {
        mutate({ list -> list.map { if (it.id == item.id) it.copy(title = title, description = description, priority = priority, due_date = due) else it } }) {
            DataStore.update("tasks", item.id, buildJsonObject {
                put("title", title); put("description", description); put("priority", priority)
                put("due_date", due?.let(::prim) ?: JsonNull); put("updated_at", now())
            })
        }
    }
}

@Composable
fun TasksScreen(model: TasksModel = remember { TasksModel() }) {
    val scope = rememberCoroutineScope()
    var draft by remember { mutableStateOf("") }
    var priority by remember { mutableStateOf("medium") }
    var editing by remember { mutableStateOf<TaskItem?>(null) }
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }

    fun add() {
        val title = draft.trim()
        if (title.isEmpty()) return
        draft = ""
        scope.launch { model.add(title, priority) }
    }

    ListScreen("Tasks", model.loaded, refresh = { model.load() }) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    draft, { draft = it }, Modifier.weight(1f), placeholder = { Text("Add a task") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { add() }),
                )
                PriorityPicker(priority) { priority = it }
            }
        }
        item { ErrorText(model.error) }
        item { SectionLabel("Open (${model.open.size})") }
        if (model.loaded && model.open.isEmpty()) item { Hint("Nothing open. Add one above, or ask the assistant.") }
        model.open.forEach { t -> item(t.id) { TaskRow(t, model, scope) { editing = t } } }
        if (model.done.isNotEmpty()) {
            item { SectionLabel("Done (${model.done.size})") }
            model.done.forEach { t -> item(t.id) { TaskRow(t, model, scope) { editing = t } } }
        }
    }

    editing?.let { item ->
        TaskEditor(item, onDismiss = { editing = null }) { title, description, p, due ->
            editing = null
            scope.launch { model.save(item, title, description, p, due) }
        }
    }
}

@Composable
private fun TaskRow(item: TaskItem, model: TasksModel, scope: kotlinx.coroutines.CoroutineScope, onEdit: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable(onClickLabel = "Edit", onClick = onEdit).padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        IconButton(onClick = { scope.launch { model.toggle(item) } }) {
            Icon(
                if (item.done) Icons.Outlined.CheckCircle else Icons.Outlined.Circle,
                contentDescription = if (item.done) "Mark not done" else "Mark done",
                tint = if (item.done) Palette.blue else Palette.muted,
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.title, color = if (item.done) Palette.muted else androidx.compose.ui.graphics.Color.White, textDecoration = if (item.done) TextDecoration.LineThrough else null)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(item.priority.replaceFirstChar { it.uppercase() }, fontSize = 11.sp, fontWeight = FontWeight.Medium, color = if (item.urgent) Palette.red else Palette.secondary)
                item.due_date?.takeIf { it.isNotBlank() }?.let {
                    Icon(Icons.Outlined.CalendarMonth, null, tint = Palette.secondary, modifier = Modifier.size(13.dp))
                    Text(it.take(10), fontSize = 11.sp, color = Palette.secondary)
                }
            }
        }
        IconButton(onClick = { scope.launch { model.remove(item.id) { it.id } } }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
    }
}

@Composable
fun PriorityPicker(value: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Priority: $value" }) { Text(value.replaceFirstChar { it.uppercase() }) }
    DropdownMenu(open, onDismissRequest = { open = false }) {
        priorities.forEach { p -> DropdownMenuItem(text = { Text(p.replaceFirstChar { it.uppercase() }) }, onClick = { onPick(p); open = false }) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskEditor(item: TaskItem, onDismiss: () -> Unit, onSave: (String, String, String, String?) -> Unit) {
    var title by remember { mutableStateOf(item.title) }
    var description by remember { mutableStateOf(item.description ?: "") }
    var priority by remember { mutableStateOf(item.priority) }
    var due by remember { mutableStateOf(item.due_date?.take(10)?.takeIf { runCatching { LocalDate.parse(it) }.isSuccess }) }
    var picking by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Palette.elevated,
        title = { Text("Edit task") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Task") }, singleLine = true)
                OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text("Details") }, minLines = 2, maxLines = 6)
                Row(verticalAlignment = Alignment.CenterVertically) { Text("Priority", Modifier.weight(1f)); PriorityPicker(priority) { priority = it } }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Due date", Modifier.weight(1f))
                    Switch(due != null, { on -> due = if (on) today() else null })
                }
                due?.let { TextButton(onClick = { picking = true }) { Text(it) } }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(title.trim(), description, priority, due) }, enabled = title.isNotBlank()) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )

    if (picking) {
        val state = rememberDatePickerState(initialSelectedDateMillis = due?.let { LocalDate.parse(it).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() })
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { due = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().format(dayFormat) }
                    picking = false
                }) { Text("OK") }
            },
        ) { DatePicker(state) }
    }
}
