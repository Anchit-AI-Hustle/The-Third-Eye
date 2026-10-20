package com.thethirdeye.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// Postgres numeric columns can arrive as JSON strings.
object FlexSerializer : KSerializer<Double> {
    override val descriptor = PrimitiveSerialDescriptor("Flex", PrimitiveKind.DOUBLE)
    override fun deserialize(decoder: Decoder): Double {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeDouble()
        return runCatching { element.jsonPrimitive.doubleOrNull ?: element.jsonPrimitive.content.toDouble() }.getOrDefault(0.0)
    }
    override fun serialize(encoder: Encoder, value: Double) = encoder.encodeDouble(value)
}

typealias Flex = @Serializable(with = FlexSerializer::class) Double

@Serializable
data class TaskItem(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: String = "todo",
    val priority: String = "medium",
    val due_date: String? = null,
) {
    val done get() = status == "done"
    val urgent get() = priority == "urgent" || priority == "high"
}

@Serializable
data class NoteItem(val id: String, val title: String = "", val content: String? = null, val pinned: Boolean? = null, val updated_at: String? = null)

@Serializable
data class Goal(
    val id: String,
    val title: String,
    val category: String? = null,
    val target: Flex = 0.0,
    val current: Flex = 0.0,
    val unit: String? = null,
    val deadline: String? = null,
) {
    val progress: Float get() = if (target > 0) (current / target).coerceIn(0.0, 1.0).toFloat() else 0f
}

@Serializable
data class Expense(val id: String, val amount: Flex = 0.0, val category: String = "Other", val note: String? = null, val spent_on: String = "")

@Serializable
data class KnowledgeDoc(
    val id: String,
    val title: String = "Untitled",
    val content: String? = null,
    val file_type: String? = null,
    val file_size_bytes: Flex? = null,
    val chunk_count: Flex? = null,
    val processing_status: String? = null,
    val error: String? = null,
)

val dayFormat: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
fun today(): String = LocalDate.now().format(dayFormat)
fun now(): String = java.time.Instant.now().toString()
fun newId(): String = java.util.UUID.randomUUID().toString()
fun prim(value: String) = JsonPrimitive(value)

fun formatNumber(v: Double): String = if (v == Math.rint(v)) v.toLong().toString() else "%.1f".format(v)

/** A screen's list: loads, reloads on any change, and keeps the last error to show. */
abstract class Records<T>(private val entity: String) {
    var items by mutableStateOf<List<T>>(emptyList())
    var error by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)

    protected abstract suspend fun fetch(): List<T>

    suspend fun load() {
        try {
            items = fetch()
            error = null
        } catch (e: Exception) {
            error = e.message
        }
        loaded = true
    }

    protected suspend fun mutate(optimistic: (List<T>) -> List<T> = { it }, call: suspend () -> Unit) {
        items = optimistic(items)
        try {
            call()
        } catch (e: Exception) {
            error = e.message
            load()
        }
    }

    suspend fun remove(id: String, idOf: (T) -> String) = mutate({ list -> list.filterNot { idOf(it) == id } }) { DataStore.delete(entity, id) }
}

/** A titled screen on the starfield, with an optional back arrow. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TitledScreen(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Backdrop {
        Scaffold(
            containerColor = Color.Transparent,
            contentColor = Color.White,
            topBar = {
                TopAppBar(
                    title = { Text(title, maxLines = 1) },
                    navigationIcon = {
                        if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                    },
                    actions = actions,
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
            content = content,
        )
    }
}

/** The app's list screen: title bar, pull to refresh, a spinner until the first load. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListScreen(
    title: String,
    loaded: Boolean,
    refresh: suspend () -> Unit,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    content: LazyListScope.() -> Unit,
) {
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    TitledScreen(title, onBack, actions) { padding ->
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { refreshing = true; refresh(); refreshing = false } },
            modifier = Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()),
        ) {
            LazyColumn(
                Modifier.fillMaxSize().widthIn(max = 760.dp).align(Alignment.TopCenter),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
            if (!loaded) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Palette.blue) }
        }
    }
}
