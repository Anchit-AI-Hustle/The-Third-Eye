package com.thethirdeye.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class NotesModel : Records<NoteItem>("notes") {
    override suspend fun fetch() = DataStore.rows<NoteItem>("notes")

    suspend fun save(id: String?, title: String, content: String) {
        mutate {
            if (id != null) DataStore.update("notes", id, buildJsonObject { put("title", title); put("content", content); put("updated_at", now()) })
            else DataStore.insert("notes", buildJsonObject {
                put("id", newId()); put("title", title); put("content", content); put("pinned", false); put("created_at", now()); put("updated_at", now())
            })
        }
    }
}

@Composable
fun NotesScreen(model: NotesModel = remember { NotesModel() }) {
    val scope = rememberCoroutineScope()
    // null: closed; a note with a blank id: a new one.
    var editing by remember { mutableStateOf<NoteItem?>(null) }
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }

    ListScreen("Notes", model.loaded, refresh = { model.load() }, actions = {
        IconButton(onClick = { editing = NoteItem(id = "") }) { Icon(Icons.Outlined.Add, contentDescription = "New note") }
    }) {
        item { ErrorText(model.error) }
        if (model.loaded && model.items.isEmpty()) item { Hint("No notes yet. Tap + to write one, or ask the assistant to take a note.") }
        model.items.forEach { note ->
            item(note.id) {
                Row(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).clickable { editing = note }.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            if (note.pinned == true) Icon(Icons.Outlined.PushPin, contentDescription = "Pinned", tint = Palette.blue)
                            Text(note.title.ifBlank { "Untitled" }, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Text(note.content ?: "", fontSize = 13.sp, color = Palette.secondary, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(onClick = { scope.launch { model.remove(note.id) { it.id } } }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                }
            }
        }
    }

    editing?.let { note ->
        NoteEditor(note, onDismiss = { editing = null }) { title, content ->
            editing = null
            scope.launch { model.save(note.id.ifBlank { null }, title, content) }
        }
    }
}

@Composable
fun NoteEditor(note: NoteItem, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var title by remember { mutableStateOf(note.title) }
    var content by remember { mutableStateOf(note.content ?: "") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Palette.elevated,
        title = { Text(if (note.id.isBlank()) "New note" else "Edit note") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("Title") }, singleLine = true)
                OutlinedTextField(content, { content = it }, Modifier.fillMaxWidth(), label = { Text("Note") }, minLines = 5, maxLines = 14)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(title, content) }, enabled = title.isNotBlank() || content.isNotBlank()) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
