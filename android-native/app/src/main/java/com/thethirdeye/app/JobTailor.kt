package com.thethirdeye.app

import android.annotation.SuppressLint
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/** Tailor & Apply for one job, as on the website (components/jobAgent/ApplicationKitReview). */
class TailorKit(val raw: JsonObject, docs: JsonObject) {
    class Answer(val question: String, val answer: String, val requiresUserInput: Boolean, val warning: String?)

    private val match = raw["match"] as? JsonObject ?: JsonObject(emptyMap())
    val score = (match["overallScore"] as? JsonPrimitive)?.intOrNull ?: 0
    val recommended = match.str("recommendedAction").replace('_', ' ')
    val confidence = (match["confidence"] as? JsonPrimitive)?.doubleOrNull ?: 0.0
    val eligibility = match.str("eligibility").replace('_', ' ')
    val warnings = raw.strings("warnings")
    val needsInformation = raw.strings("needsInformation")
    val unsupportedKeywords = (raw["resume"] as? JsonObject)?.strings("unsupportedKeywords").orEmpty()
    val answers = (raw["screeningAnswers"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }.map {
        Answer(it.str("question"), it.str("answer"), (it["requiresUserInput"] as? JsonPrimitive)?.booleanOrNull == true, it.str("warning").ifBlank { null })
    }
    val resumeHtml = docs.str("resumeHtml")
    val resumeMarkdown = docs.str("resumeMarkdown")
    val coverHtml = docs.str("coverHtml")
    val coverText = docs.str("coverText")
    val resumeName = docs.str("resumeName").ifBlank { "Resume" }
    val coverName = docs.str("coverName").ifBlank { "Cover_Letter" }

    companion object {
        fun from(reply: JsonObject): TailorKit? {
            val kit = reply["kit"] as? JsonObject ?: return null
            val docs = reply["documents"] as? JsonObject ?: return null
            return TailorKit(kit, docs)
        }
    }
}

private fun JsonObject.str(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
private fun JsonObject.strings(key: String) = (this[key] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }

/** The rows approving a kit writes, as the website's approve(): resume, cover letter and the application's fields. */
fun approvalRows(kit: TailorKit, listing: JobListing, stamp: String, at: String): Triple<JsonObject, JsonObject, JsonObject> {
    val name = "${listing.job.company.ifBlank { "Company" }} - ${listing.job.title}"
    val resume = kit.raw["resume"] as? JsonObject ?: JsonObject(emptyMap())
    val resumeRow = buildJsonObject {
        put("id", "resume_$stamp"); put("name", name); put("target_job_id", listing.job.id); put("document_json", resume)
        put("template_id", resume.str("templateId").ifBlank { "classic-ats" }); put("version_number", 1)
        put("validation_json", buildJsonObject { put("warnings", buildJsonArray { kit.warnings.forEach { add(JsonPrimitive(it)) } }) })
        put("generation_metadata_json", buildJsonObject { put("generatedAt", kit.raw["generatedAt"] ?: JsonPrimitive(at)); put("provider", kit.raw["provider"] ?: JsonNull) })
        put("created_at", at); put("updated_at", at)
    }
    val coverRow = buildJsonObject {
        put("id", "cover_$stamp"); put("target_job_id", listing.job.id); put("title", name)
        put("document_json", kit.raw["coverLetter"] ?: JsonObject(emptyMap())); put("version_number", 1); put("created_at", at); put("updated_at", at)
    }
    val application = buildJsonObject {
        put("status", "ready_to_apply"); put("match_score", kit.score); put("submitted_resume_id", "resume_$stamp")
        put("submitted_cover_letter_id", "cover_$stamp"); put("submission_url", listing.job.applyUrl.ifBlank { null }); put("updated_at", at)
    }
    return Triple(resumeRow, coverRow, application)
}

class TailorModel(private val listing: JobListing) {
    var kit by mutableStateOf<TailorKit?>(null)
        private set
    var loading by mutableStateOf(false)
        private set
    var approving by mutableStateOf(false)
        private set
    var approved by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)

    suspend fun build() {
        loading = true
        error = null
        try {
            val body = buildJsonObject { put("job", listing.raw); put("useSaved", true); put("questions", JsonArray(emptyList())) }
            kit = TailorKit.from(json.parseToJsonElement(Api.backend.send("POST", "/api/job-agent/application-kit", body)).jsonObject) ?: throw ApiError(502)
        } catch (e: Exception) {
            error = e.message
        }
        loading = false
    }

    suspend fun approve(applications: List<ApplicationRow>) {
        val kit = kit ?: return
        if (approving) return
        approving = true
        error = null
        try {
            val at = now()
            val stamp = System.currentTimeMillis().toString(36)
            val (resume, cover, fields) = approvalRows(kit, listing, stamp, at)
            DataStore.insert("resume_documents", resume)
            DataStore.insert("cover_letters", cover)
            val existing = applications.firstOrNull { it.job_id == listing.job.id }
            if (existing != null) DataStore.update("applications", existing.id, fields)
            else DataStore.insert("applications", JsonObject(fields + mapOf<String, JsonElement>(
                "id" to JsonPrimitive("app_$stamp"), "job_id" to JsonPrimitive(listing.job.id), "job_json" to listing.raw, "created_at" to JsonPrimitive(at),
            )))
            approved = true
        } catch (e: Exception) {
            error = "Couldn't save these documents: ${e.message}"
        }
        approving = false
    }
}

// Held until the print sheet has the page: a WebView that is collected first prints nothing.
@SuppressLint("StaticFieldLeak")
private var printing: WebView? = null

/** The system print dialog, which also saves a PDF. */
fun printHtml(context: Context, html: String, name: String) {
    printing = WebView(context).apply {
        webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                context.getSystemService(PrintManager::class.java).print(name, view.createPrintDocumentAdapter(name), PrintAttributes.Builder().build())
            }
        }
        loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobTailorScreen(agent: JobAgentModel, listing: JobListing, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val model = remember(listing.job.id) { TailorModel(listing) }
    var tab by remember { mutableStateOf(0) }
    LaunchedEffect(listing.job.id) { if (model.kit == null) model.build() }

    @Composable
    fun DocActions(html: String, name: String, text: String) {
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { printHtml(context, html, name) }) { Text("PDF") }
            TextButton(onClick = { shareText(context, text, name) }) { Text("Share") }
            TextButton(onClick = { copyText(context, text) }) { Text("Copy") }
        }
    }

    ListScreen("Tailor & Apply", loaded = true, refresh = {}, onBack = onBack) {
        item {
            Column {
                Text(listing.job.title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                Text(listOf(listing.job.company, listing.job.sourceAttribution).filter { it.isNotBlank() }.joinToString(" · "), fontSize = 12.sp, color = Palette.muted)
            }
        }
        if (model.loading) item {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                Text("Analyzing the role and tailoring your documents…", fontSize = 13.sp, color = Palette.secondary)
            }
        }
        model.error?.let { e ->
            item { ErrorText(e) }
            if (model.kit == null && !model.loading) item { TextButton(onClick = { scope.launch { model.build() } }) { Text("Try again") } }
        }
        val kit = model.kit ?: return@ListScreen
        item("match") {
            Panel {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Column {
                        Text("${kit.score}", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Palette.blue)
                        Text("MATCH SCORE", fontSize = 10.sp, fontFamily = FontFamily.Monospace, color = Palette.muted)
                    }
                    Column {
                        Text("Recommended: ${kit.recommended}", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        Text("Confidence ${Math.round(kit.confidence * 100)}% · ${kit.eligibility}", fontSize = 12.sp, color = Palette.secondary)
                    }
                }
                if (kit.warnings.isNotEmpty()) {
                    Text("Review these before applying", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Palette.warning)
                    kit.warnings.forEach { Text("• $it", fontSize = 12.sp, color = Palette.secondary) }
                }
                if (kit.needsInformation.isNotEmpty()) {
                    Text("Needs your input", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    kit.needsInformation.forEach { Text("• $it", fontSize = 12.sp, color = Palette.muted) }
                }
            }
        }
        item("tabs") {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                listOf("Resume", "Cover letter", "Screening").forEachIndexed { i, label ->
                    SegmentedButton(selected = tab == i, onClick = { tab = i }, shape = SegmentedButtonDefaults.itemShape(i, 3)) { Text(label, fontSize = 12.sp) }
                }
            }
        }
        when (tab) {
            0 -> item("resume") {
                Column {
                    DocActions(kit.resumeHtml, kit.resumeName, kit.resumeMarkdown)
                    if (kit.unsupportedKeywords.isNotEmpty()) Text("Unsupported keywords left out: ${kit.unsupportedKeywords.joinToString(", ")}", fontSize = 11.sp, color = Palette.red)
                    Column(Modifier.height(420.dp)) { HtmlView(kit.resumeHtml) }
                }
            }
            1 -> item("cover") {
                Column {
                    DocActions(kit.coverHtml, kit.coverName, kit.coverText)
                    Column(Modifier.height(360.dp)) { HtmlView(kit.coverHtml) }
                }
            }
            else -> {
                if (kit.answers.isEmpty()) item { Hint("No screening questions were detected. Add them from the employer's form on the website and run it again.") }
                kit.answers.forEachIndexed { i, a ->
                    item("a$i") {
                        Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(a.question, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            if (a.requiresUserInput) Text(a.warning ?: "You must answer this yourself.", fontSize = 12.sp, color = Palette.warning)
                            else {
                                SelectionContainer { Text(a.answer, fontSize = 13.sp, color = Palette.secondary) }
                                TextButton(onClick = { copyText(context, a.answer) }) { Text("Copy", fontSize = 12.sp) }
                            }
                        }
                    }
                }
            }
        }
        item("approve") {
            Panel {
                if (model.approved) {
                    Text("Approved and saved to your applications.", color = Palette.success, fontSize = 14.sp)
                    Text("Open the employer's posting, then copy your answers and attach your documents. You review CAPTCHA, attestations and the final submit yourself.",
                        fontSize = 12.sp, color = Palette.muted)
                    if (listing.job.applyUrl.isNotBlank()) GlowButton("Open application") { openInBrowser(context, listing.job.applyUrl) }
                } else {
                    Text("Approving saves a snapshot of these documents with this application. Nothing is submitted automatically; you apply on the employer's site yourself.",
                        fontSize = 12.sp, color = Palette.muted)
                    if (model.approving) CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                    else GlowButton("Approve & save") {
                        scope.launch {
                            model.approve(agent.applications)
                            if (model.approved) agent.load()
                        }
                    }
                }
                Text("Match scores are a candidate-side relevance heuristic, not an employer decision or a guarantee of an interview or offer.",
                    fontSize = 10.sp, color = Palette.muted)
            }
        }
    }
}
