package com.thethirdeye.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private data class Starter(val name: String, val description: String, val steps: List<String>)

private val starters = listOf(
    Starter("Morning kickoff", "Start the day", listOf("Summarise my urgent tasks and anything overdue", "Read my unread emails and flag anything needing a reply", "Give me today's calendar", "Suggest my top 3 priorities")),
    Starter("Inbox to tasks", "Turn email into action", listOf("Scan my recent unread emails", "Create tasks for anything that needs an action, with due dates", "Draft replies for the ones I just need to acknowledge")),
    Starter("Follow-up sweep", "Chase open threads", listOf("Find tasks assigned to others that are overdue", "Draft a short, polite follow-up message for each", "List them for my approval before sending")),
)

/** A skill being edited; `existing` null means a new one. */
private class Draft(val existing: Skill?) {
    var name by mutableStateOf(existing?.name.orEmpty())
    var description by mutableStateOf(existing?.description.orEmpty())
    val steps = mutableStateListOf<String>().apply { addAll(existing?.steps ?: listOf("")) }

    fun move(i: Int, by: Int) {
        val j = i + by
        if (j in steps.indices) { val s = steps[i]; steps[i] = steps[j]; steps[j] = s }
    }

    fun build(): Skill {
        val at = now()
        return Skill(existing?.id ?: newId(), name.trim(), description.trim().ifEmpty { null }, steps.map { it.trim() }.filter { it.isNotEmpty() }, existing?.createdAt ?: at, at)
    }
}

@Composable
fun SkillsScreen(app: AppState, onBack: () -> Unit) {
    val local = Local.get(LocalContext.current)
    var draft by remember { mutableStateOf<Draft?>(null) }
    var deleting by remember { mutableStateOf<Skill?>(null) }
    BackHandler(draft != null) { draft = null }

    draft?.let { d -> return SkillEditor(d, onBack = { draft = null }) { local.saveSkill(d.build()); draft = null } }

    ListScreen("Skills", loaded = true, refresh = {}, onBack = onBack, actions = {
        IconButton(onClick = { draft = Draft(null) }, enabled = local.skills.size < MAX_SKILLS) { Icon(Icons.Outlined.Add, contentDescription = "New skill") }
    }) {
        item { Text("Save multi-step automations the assistant runs on command. It does each step with its tools and asks first before anything sensitive.", fontSize = 13.sp, color = Palette.secondary) }
        if (local.skills.isEmpty()) {
            item { SectionLabel("Start from a template") }
            starters.forEach { t ->
                item(t.name) {
                    Column(Modifier.card { local.saveSkill(Skill(newId(), t.name, t.description, t.steps, now(), now())) }) {
                        Text(t.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.blue)
                        Text("${t.steps.size} steps · ${t.description}", fontSize = 12.sp, color = Palette.muted)
                    }
                }
            }
        }
        local.skills.forEach { skill ->
            item(skill.id) {
                Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(skill.name, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                            skill.description?.let { Text(it, fontSize = 12.sp, color = Palette.muted) }
                        }
                        IconButton(onClick = { draft = Draft(skill) }) { Icon(Icons.Outlined.Edit, contentDescription = "Edit", tint = Palette.muted) }
                        IconButton(onClick = { deleting = skill }) { Icon(Icons.Outlined.Delete, contentDescription = "Delete", tint = Palette.muted) }
                    }
                    skill.steps.forEachIndexed { i, step ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${i + 1}.", fontSize = 12.sp, color = Palette.muted)
                            Text(step, fontSize = 13.sp, color = Palette.secondary)
                        }
                    }
                    TextButton(onClick = { app.ask(composeSkillRun(skill)) }) { Icon(Icons.Outlined.PlayArrow, null, Modifier.size(18.dp)); Text("  Run") }
                }
            }
        }
    }

    deleting?.let { s ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            containerColor = Palette.elevated,
            title = { Text("Delete \"${s.name}\"?") },
            confirmButton = { TextButton(onClick = { local.deleteSkill(s.id); deleting = null }) { Text("Delete", color = Palette.red) } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SkillEditor(d: Draft, onBack: () -> Unit, onSave: () -> Unit) {
    ListScreen(if (d.existing == null) "New skill" else "Edit skill", loaded = true, refresh = {}, onBack = onBack) {
        item { Field("Name", d.name, { d.name = it }) }
        item { Field("What it's for (optional)", d.description, { d.description = it }) }
        item { SectionLabel("Steps, in order") }
        d.steps.forEachIndexed { i, step ->
            item("step$i") {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Field("Step ${i + 1}", step, { d.steps[i] = it }, Modifier.weight(1f), minLines = 2)
                    Column {
                        IconButton(onClick = { d.move(i, -1) }, enabled = i > 0) { Icon(Icons.Outlined.ArrowUpward, contentDescription = "Move up") }
                        IconButton(onClick = { d.move(i, 1) }, enabled = i < d.steps.lastIndex) { Icon(Icons.Outlined.ArrowDownward, contentDescription = "Move down") }
                    }
                    IconButton(onClick = { d.steps.removeAt(i) }, enabled = d.steps.size > 1) { Icon(Icons.Outlined.Close, contentDescription = "Remove step", tint = Palette.muted) }
                }
            }
        }
        item { TextButton(onClick = { d.steps.add("") }) { Icon(Icons.Outlined.Add, null, Modifier.size(18.dp)); Text("  Add step") } }
        item { GlowButton("Save", enabled = d.name.isNotBlank(), onClick = onSave) }
    }
}
