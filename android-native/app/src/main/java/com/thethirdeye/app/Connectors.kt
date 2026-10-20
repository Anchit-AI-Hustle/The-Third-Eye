package com.thethirdeye.app

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URLEncoder

@Serializable
data class Connector(val id: String, val name: String, val host: String? = null, val enabled: Boolean = true, val tool_count: Flex? = null)

@Serializable
private data class Listing(val connectors: List<Connector> = emptyList())

@Serializable
private data class Added(val connector: Connector)

// /api/connectors: the same MCP connectors the website's Connectors page adds.
class ConnectorsModel {
    var items by mutableStateOf<List<Connector>>(emptyList())
    var error by mutableStateOf<String?>(null)
    var notice by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)
    var unavailable by mutableStateOf(false)

    /** The server's own error text, which says why a URL was refused. */
    private suspend fun call(method: String, path: String, body: kotlinx.serialization.json.JsonObject? = null): String = try {
        Api.backend.send(method, path, body)
    } catch (e: ApiError) {
        if (e.status == 501) unavailable = true
        throw e
    }

    suspend fun load() {
        try {
            items = json.decodeFromString(Listing.serializer(), call("GET", "/api/connectors")).connectors
            error = null
        } catch (e: Exception) {
            if (!unavailable) error = e.message
        }
        loaded = true
    }

    suspend fun add(name: String, url: String, token: String): Boolean = try {
        val c = json.decodeFromString(Added.serializer(), call("POST", "/api/connectors", buildJsonObject { put("name", name); put("url", url); put("token", token) })).connector
        val tools = (c.tool_count ?: 0.0).toInt()
        notice = "${c.name} connected: $tools tool${if (tools == 1) "" else "s"} available to the assistant."
        error = null
        load()
        true
    } catch (e: Exception) {
        error = e.message
        false
    }

    suspend fun toggle(c: Connector) {
        runCatching { call("PATCH", "/api/connectors", buildJsonObject { put("id", c.id); put("enabled", !c.enabled) }) }.onFailure { error = it.message }
        load()
    }

    suspend fun delete(c: Connector) {
        runCatching { call("DELETE", "/api/connectors?id=${URLEncoder.encode(c.id, "UTF-8")}") }.onFailure { error = it.message }
        load()
    }
}

private data class Directory(val name: String, val blurb: String, val link: String)

private val directories = listOf(
    Directory("Zapier", "8,000+ apps: Slack, Notion, Sheets, HubSpot. Copy your personal MCP URL.", "https://mcp.zapier.com"),
    Directory("Composio", "250+ apps with managed sign-in. Copy a server URL from your dashboard.", "https://composio.dev"),
    Directory("Pipedream", "2,500+ APIs. Create an MCP server and copy its URL.", "https://mcp.pipedream.com"),
)

@Composable
fun ConnectorsScreen(onBack: () -> Unit, model: ConnectorsModel = remember { ConnectorsModel() }) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var adding by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { model.load() }

    ListScreen("Connectors", model.loaded, refresh = { model.load() }, onBack = onBack, actions = {
        IconButton(onClick = { adding = true }, enabled = !model.unavailable) { Icon(Icons.Outlined.Add, contentDescription = "Add connector") }
    }) {
        item { ErrorText(model.error) }
        model.notice?.let { n -> item { Text(n, color = Palette.blue, fontSize = 13.sp) } }
        if (model.unavailable) item { Hint("Connectors aren't set up on this server yet.") }
        item { SectionLabel("Your connectors") }
        if (model.loaded && model.items.isEmpty() && !model.unavailable) item { Hint("None yet. Add an MCP server to give the assistant new tools.") }
        model.items.forEach { c ->
            item(c.id) {
                Row(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(c.name, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        Text("${c.host ?: ""} · ${(c.tool_count ?: 0.0).toInt()} tools", fontSize = 12.sp, color = Palette.muted)
                    }
                    Switch(c.enabled, { scope.launch { model.toggle(c) } }, colors = SwitchDefaults.colors(checkedTrackColor = Palette.blue))
                    IconButton(onClick = { scope.launch { model.delete(c) } }) { Icon(Icons.Outlined.Delete, contentDescription = "Remove", tint = Palette.muted) }
                }
            }
        }
        item { SectionLabel("Find servers") }
        directories.forEach { d ->
            item(d.name) {
                Column(
                    Modifier.fillMaxWidth().background(Palette.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp))
                        .clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(d.link))) }.padding(12.dp),
                ) {
                    Text(d.name, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = Palette.blue)
                    Text(d.blurb, fontSize = 12.sp, color = Palette.muted)
                }
            }
        }
    }

    if (adding) AddConnector(model, onDone = { adding = false })
}

@Composable
private fun AddConnector(model: ConnectorsModel, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var token by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDone,
        containerColor = Palette.elevated,
        title = { Text("Add connector") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Name, e.g. Notion") }, singleLine = true)
                OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text("https://… server URL") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                OutlinedTextField(token, { token = it }, Modifier.fillMaxWidth(), label = { Text("Token (optional)") }, singleLine = true, visualTransformation = PasswordVisualTransformation())
                ErrorText(model.error)
            }
        },
        confirmButton = {
            if (busy) CircularProgressIndicator(color = Palette.blue) else TextButton(
                onClick = { busy = true; scope.launch { if (model.add(name, url, token)) onDone(); busy = false } },
                enabled = name.isNotBlank() && url.isNotBlank(),
            ) { Text("Connect") }
        },
        dismissButton = { TextButton(onClick = onDone) { Text("Cancel") } },
    )
}
