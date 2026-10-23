package com.thethirdeye.app

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

/** The list-row card the screens share. */
fun Modifier.card(color: Color = Palette.surface.copy(alpha = 0.7f), onClick: (() -> Unit)? = null): Modifier =
    fillMaxWidth().background(color, RoundedCornerShape(12.dp))
        .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
        .padding(12.dp)

@Composable
fun Dot(color: Color, size: Int = 10) {
    Box(Modifier.size(size.dp).background(color, CircleShape))
}

@Composable
fun Badge(text: String, color: Color) {
    Text(
        text.uppercase(), color = color, fontSize = 10.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp,
        modifier = Modifier.background(color.copy(alpha = 0.14f), RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** Personal / Professional / Enterprise, shared by Studio and Apps. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModePicker(mode: String, onPick: (String) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        appModes.forEachIndexed { i, (id, label) ->
            SegmentedButton(
                selected = mode == id, onClick = { onPick(id) },
                shape = SegmentedButtonDefaults.itemShape(i, appModes.size),
                icon = {},
                label = { Text(label, fontSize = 13.sp, maxLines = 1) },
            )
        }
    }
}

@Composable
fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    minLines: Int = 1,
    placeholder: String? = null,
    keyboard: KeyboardType = KeyboardType.Text,
    secret: Boolean = false,
) {
    OutlinedTextField(
        value, onChange, modifier.fillMaxWidth(),
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        singleLine = minLines == 1,
        minLines = minLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
    )
}

sealed interface MdBlock {
    data class Heading(val level: Int, val text: String) : MdBlock
    data class Item(val marker: String, val text: String, val indent: Int) : MdBlock
    data class Quote(val text: String) : MdBlock
    data class Code(val text: String) : MdBlock
    data class Table(val rows: List<List<String>>) : MdBlock
    data class Para(val text: String) : MdBlock
    data object Rule : MdBlock
}

private val bullet = Regex("""^(\s*)[-*+]\s+(.*)""")
private val numbered = Regex("""^(\s*)(\d+)[.)]\s+(.*)""")
private val headingLine = Regex("""^(#{1,6})\s+(.*)""")
private val rule = Regex("""^\s*([-*_])(\s*\1){2,}\s*$""")
private val tableSeparator = Regex("""^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$""")

fun markdownBlocks(md: String): List<MdBlock> {
    val blocks = mutableListOf<MdBlock>()
    val para = mutableListOf<String>()
    val code = mutableListOf<String>()
    val table = mutableListOf<List<String>>()
    var fenced = false
    fun flush() {
        if (para.isNotEmpty()) blocks += MdBlock.Para(para.joinToString(" ")).also { para.clear() }
        if (table.isNotEmpty()) blocks += MdBlock.Table(table.toList()).also { table.clear() }
    }
    for (raw in md.lines()) {
        val line = raw.trimEnd()
        if (line.trimStart().startsWith("```")) {
            if (fenced) blocks += MdBlock.Code(code.joinToString("\n")).also { code.clear() } else flush()
            fenced = !fenced
            continue
        }
        if (fenced) { code += raw; continue }
        val heading = headingLine.find(line)
        val bulleted = bullet.find(line)
        val numberedItem = numbered.find(line)
        when {
            line.isBlank() -> flush()
            line.trimStart().startsWith("|") -> {
                if (para.isNotEmpty()) flush()
                if (!tableSeparator.matches(line)) table += line.trim().trim('|').split("|").map { it.trim() }
            }
            heading != null -> { flush(); blocks += MdBlock.Heading(heading.groupValues[1].length, heading.groupValues[2]) }
            rule.matches(line) -> { flush(); blocks += MdBlock.Rule }
            bulleted != null -> { flush(); blocks += MdBlock.Item("•", bulleted.groupValues[2], bulleted.groupValues[1].length / 2) }
            numberedItem != null -> { flush(); blocks += MdBlock.Item("${numberedItem.groupValues[2]}.", numberedItem.groupValues[3], numberedItem.groupValues[1].length / 2) }
            line.startsWith(">") -> { flush(); blocks += MdBlock.Quote(line.removePrefix(">").trim()) }
            else -> { if (table.isNotEmpty()) flush(); para += line.trim() }
        }
    }
    if (fenced && code.isNotEmpty()) blocks += MdBlock.Code(code.joinToString("\n"))
    flush()
    return blocks
}

/** Headings, lists, tables, quotes and code, with bold, italic and links inside. */
@Composable
fun MarkdownText(md: String) {
    SelectionContainer {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            markdownBlocks(md).forEach { block ->
                when (block) {
                    is MdBlock.Heading -> Text(
                        inlineMarkdown(block.text), fontWeight = FontWeight.Bold, color = if (block.level <= 2) Palette.blue else Color.White,
                        fontSize = when (block.level) { 1 -> 20.sp; 2 -> 18.sp; 3 -> 16.sp; else -> 15.sp },
                        modifier = Modifier.padding(top = if (block.level <= 2) 6.dp else 2.dp),
                    )
                    is MdBlock.Item -> Row(Modifier.padding(start = (block.indent * 14).dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(block.marker, color = Palette.blue, fontSize = 14.sp)
                        Text(inlineMarkdown(block.text), Modifier.weight(1f), fontSize = 14.sp)
                    }
                    is MdBlock.Quote -> Text(
                        inlineMarkdown(block.text), color = Palette.secondary, fontSize = 14.sp,
                        modifier = Modifier.fillMaxWidth().background(Palette.elevated.copy(alpha = 0.6f), RoundedCornerShape(8.dp)).padding(10.dp),
                    )
                    is MdBlock.Code -> Text(
                        block.text, fontFamily = FontFamily.Monospace, fontSize = 12.sp,
                        modifier = Modifier.fillMaxWidth().background(Palette.elevated, RoundedCornerShape(8.dp)).padding(10.dp),
                    )
                    is MdBlock.Table -> Column(Modifier.fillMaxWidth().background(Palette.elevated.copy(alpha = 0.6f), RoundedCornerShape(8.dp)).padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        block.rows.forEachIndexed { r, cells ->
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                cells.forEach { Text(inlineMarkdown(it), Modifier.weight(1f), fontSize = 12.sp, fontWeight = if (r == 0) FontWeight.Bold else FontWeight.Normal) }
                            }
                        }
                    }
                    is MdBlock.Para -> Text(inlineMarkdown(block.text), fontSize = 14.sp)
                    MdBlock.Rule -> Box(Modifier.fillMaxWidth().height(1.dp).background(Palette.border))
                }
            }
        }
    }
}

/** Generated HTML as a page, with scripts off; links open in the browser, never inside it. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HtmlView(html: String) {
    val context = LocalContext.current
    var view by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(Unit) { onDispose { view?.apply { stopLoading(); destroy() }; view = null } }
    key(html) {
        AndroidView(
            modifier = Modifier.fillMaxWidth().height(520.dp).clip(RoundedCornerShape(12.dp)),
            factory = { ctx ->
                WebView(ctx).apply {
                    setBackgroundColor(android.graphics.Color.WHITE)
                    settings.javaScriptEnabled = false
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                            return true
                        }
                    }
                    loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
                    view = this
                }
            },
        )
    }
}

/** What a tool or program made: markdown or a page, or plain text. */
@Composable
fun GeneratedOutput(output: String, kind: String) {
    when (kind) {
        "html" -> HtmlView(output)
        "markdown" -> MarkdownText(output)
        else -> SelectionContainer { Text(output, fontSize = 14.sp) }
    }
}

fun copyText(context: Context, text: String) {
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("The Third Eye", text))
}

fun shareText(context: Context, text: String, name: String) {
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, name).putExtra(Intent.EXTRA_TEXT, text), "Share $name"))
}

/** Copy and Share for some output, plus whatever else the screen adds (save, regenerate, delete). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OutputActions(output: String, fileName: String, extra: @Composable () -> Unit = {}) {
    val context = LocalContext.current
    var copied by remember(output) { mutableStateOf(false) }
    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        TextButton(onClick = { copyText(context, output); copied = true }) {
            Icon(if (copied) Icons.Outlined.Check else Icons.Outlined.ContentCopy, null, Modifier.size(18.dp)); Text(if (copied) "  Copied" else "  Copy")
        }
        TextButton(onClick = { shareText(context, output, fileName) }) { Icon(Icons.Outlined.Share, null, Modifier.size(18.dp)); Text("  Share") }
        extra()
    }
}

@Composable
fun RegenerateButton(onClick: () -> Unit) {
    TextButton(onClick = onClick) { Icon(Icons.Outlined.Refresh, null, Modifier.size(18.dp)); Text("  Regenerate") }
}

fun openInBrowser(context: Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
}

fun isoDate(iso: String?): String =
    iso?.let { runCatching { java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString() }.getOrNull() ?: it.take(10) } ?: ""

/** needs_review as "Needs Review". */
fun titleCase(raw: String): String = raw.replace('_', ' ').split(' ').joinToString(" ") { it.replaceFirstChar(Char::uppercase) }
