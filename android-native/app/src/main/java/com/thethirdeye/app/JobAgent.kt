package com.thethirdeye.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put
import java.net.URLEncoder

@Serializable
data class Job(
    val id: String = "",
    val source: String = "",
    val title: String = "",
    val company: String = "",
    val locationText: String? = null,
    val remoteType: String? = null,
    val employmentType: String? = null,
    val salaryMin: Flex? = null,
    val salaryMax: Flex? = null,
    val salaryCurrency: String? = null,
    val salaryOriginalText: String? = null,
    val publishedAt: String? = null,
    val applyUrl: String = "",
    val canonicalUrl: String = "",
    val descriptionText: String = "",
    val sourceAttribution: String = "",
)

/** A job as the server sent it (kept whole, so saving stores what the website stores) and what the screens read from it. */
data class JobListing(val raw: JsonObject, val job: Job)

fun jobListing(raw: JsonObject): JobListing? = runCatching { JobListing(raw, json.decodeFromJsonElement(Job.serializer(), raw)) }.getOrNull()

fun salaryText(job: Job): String? = job.salaryOriginalText?.takeIf { it.isNotBlank() } ?: run {
    val low = job.salaryMin
    val high = job.salaryMax
    val currency = job.salaryCurrency.orEmpty()
    when {
        low != null && high != null -> "${formatNumber(low)}–${formatNumber(high)} $currency".trim()
        low != null -> "From ${formatNumber(low)} $currency".trim()
        high != null -> "Up to ${formatNumber(high)} $currency".trim()
        else -> null
    }
}

fun jobSubtitle(job: Job): String = listOfNotNull(job.company.takeIf { it.isNotBlank() }, job.locationText, job.remoteType, job.employmentType).filter { it.isNotBlank() }.joinToString(" · ")

@Serializable
data class JobSource(val id: String = "", val displayName: String = "", val state: String = "", val count: Flex? = null, val url: String? = null, val message: String? = null)

@Serializable
private data class SearchReply(val jobs: List<JsonObject> = emptyList(), val sources: List<JobSource> = emptyList())

@Serializable
data class SavedRow(val id: String, val job_id: String = "", val job_json: JsonObject? = null, val state: String = "saved", val created_at: String = "")

@Serializable
data class ApplicationRow(val id: String, val job_id: String = "", val job_json: JsonObject? = null, val status: String = "preparing", val created_at: String = "", val updated_at: String? = null)

@Serializable
private data class ProfileReply(val profile: JsonObject = JsonObject(emptyMap()), val facts: List<JsonObject> = emptyList())

val applicationStatuses = listOf(
    "preparing", "needs_review", "ready_to_apply", "applying", "submitted", "recruiter_contact", "assessment",
    "interview", "final_interview", "offer", "accepted", "rejected", "withdrawn", "archived",
)

val remotePreferences = listOf("any", "remote", "hybrid", "onsite")

/** What the import found overrides what was already saved, except where it found nothing. */
fun mergeProfile(existing: JsonObject?, imported: JsonObject): JsonObject = JsonObject(
    existing.orEmpty() + imported.filterValues { v ->
        when (v) {
            is JsonNull -> false
            is JsonPrimitive -> v.content.isNotBlank()
            is JsonArray -> v.isNotEmpty()
            else -> true
        }
    },
)

fun factText(fact: JsonObject): String {
    val value = fact["value"] ?: fact["value_json"]
    return (if (value is JsonPrimitive) value.contentOrNull else value?.toString()).orEmpty().take(240)
}

/** An imported fact as a candidate_facts row: the table's snake_case columns, not the website's camelCase fields. */
fun factRow(fact: JsonObject, profileId: String, at: String): JsonObject = buildJsonObject {
    put("id", fact.text("id") ?: newId()); put("profile_id", profileId); put("fact_type", fact.text("factType") ?: "")
    put("value_json", fact["value"] ?: JsonNull)
    fact["confidence"]?.let { put("confidence", it) }
    put("verified", fact.text("verified") ?: "unverified"); put("sensitivity", fact.text("sensitivity") ?: "normal"); put("updated_at", at)
}

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

class JobAgentModel(private val email: String?) {
    var disabled by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var notice by mutableStateOf<String?>(null)

    var query by mutableStateOf("")
    var location by mutableStateOf("")
    var remote by mutableStateOf("any")
    var searching by mutableStateOf(false)
    var searched by mutableStateOf(false)
    var results by mutableStateOf<List<JobListing>>(emptyList())
    var sources by mutableStateOf<List<JobSource>>(emptyList())

    var saved by mutableStateOf<List<SavedRow>>(emptyList())
    var applications by mutableStateOf<List<ApplicationRow>>(emptyList())
    var loaded by mutableStateOf(false)

    var resume by mutableStateOf("")
    var importing by mutableStateOf(false)
    var headline by mutableStateOf("")
    var summary by mutableStateOf("")
    var facts by mutableStateOf<List<JsonObject>>(emptyList())
    private var profile: JsonObject? = null
    private var unsavedFacts = emptyList<JsonObject>()
    private var savedRows = emptyList<SavedRow>()
    val unsaved get() = unsavedFacts.isNotEmpty() || profileEdited
    private var profileEdited by mutableStateOf(false)

    private val profileId get() = "japrofile_$email"

    private suspend fun guarded(block: suspend () -> Unit) {
        try {
            block()
            error = null
        } catch (e: ApiError) {
            if (e.status == 403 && e.disabled) disabled = true else error = e.message
        } catch (e: Exception) {
            error = e.message
        }
    }

    suspend fun load() {
        guarded {
            savedRows = DataStore.rows<SavedRow>("saved_jobs")
            saved = savedRows.filter { it.state == "saved" }
            applications = DataStore.rows<ApplicationRow>("applications")
            val row = DataStore.list("job_agent_profiles").firstOrNull { (it as? JsonObject)?.text("id") == profileId } as? JsonObject
            if (!profileEdited) {
                profile = row?.get("profile_json") as? JsonObject
                headline = profile?.text("headline").orEmpty()
                summary = profile?.text("summary").orEmpty()
                facts = DataStore.list("candidate_facts").mapNotNull { it as? JsonObject }
            }
        }
        loaded = true
    }

    suspend fun search() {
        searching = true
        guarded {
            val reply = json.decodeFromString(SearchReply.serializer(), Api.backend.send("POST", "/api/job-agent/search", buildJsonObject {
                put("query", query.trim())
                if (location.isNotBlank()) put("location", location.trim())
                put("remotePreference", remote)
                put("limit", 30)
            }))
            results = reply.jobs.mapNotNull(::jobListing)
            sources = reply.sources
            searched = true
        }
        searching = false
    }

    fun isSaved(job: Job) = saved.any { it.job_id == job.id }
    fun isTracked(job: Job) = applications.any { it.job_id == job.id }

    suspend fun save(listing: JobListing) {
        guarded {
            val existing = savedRows.firstOrNull { it.job_id == listing.job.id }
            if (existing != null) DataStore.update("saved_jobs", existing.id, buildJsonObject { put("state", "saved") })
            else DataStore.insert("saved_jobs", buildJsonObject {
                put("id", "sj_${newId()}"); put("job_id", listing.job.id); put("job_json", listing.raw); put("state", "saved"); put("created_at", now())
            })
            load()
        }
    }

    suspend fun unsave(row: SavedRow) {
        guarded { DataStore.delete("saved_jobs", row.id); load() }
    }

    suspend fun track(listing: JobListing) {
        guarded {
            if (isTracked(listing.job)) return@guarded
            val at = now()
            DataStore.insert("applications", buildJsonObject {
                put("id", "app_${newId()}"); put("job_id", listing.job.id); put("job_json", listing.raw); put("status", "preparing")
                put("match_score", JsonNull); put("created_at", at); put("updated_at", at)
            })
            load()
        }
    }

    suspend fun setStatus(row: ApplicationRow, status: String) {
        guarded {
            DataStore.update("applications", row.id, buildJsonObject { put("status", status); put("updated_at", now()) })
            load()
        }
    }

    suspend fun import() {
        importing = true
        guarded {
            val reply = json.decodeFromString(ProfileReply.serializer(), Api.backend.send("POST", "/api/job-agent/profile/import", buildJsonObject { put("text", resume) }))
            profile = mergeProfile(profile, reply.profile)
            headline = profile?.text("headline").orEmpty()
            summary = profile?.text("summary").orEmpty()
            unsavedFacts = unsavedFacts + reply.facts
            facts = reply.facts + facts
            profileEdited = true
            notice = "Imported ${reply.facts.size} facts. Review them, then save."
        }
        importing = false
    }

    suspend fun saveProfile() {
        guarded {
            val saved = profile ?: JsonObject(emptyMap())
            val exists = (json.parseToJsonElement(Api.backend.send("GET", "/api/data/job_agent_profiles?id=${URLEncoder.encode(profileId, "UTF-8")}")) as? JsonObject)
                ?.get("rows")?.jsonArray?.isNotEmpty() == true
            val at = now()
            if (exists) {
                DataStore.update("job_agent_profiles", profileId, buildJsonObject {
                    put("profile_json", saved); put("headline", headline); put("summary", summary); put("updated_at", at)
                })
            } else {
                DataStore.insert("job_agent_profiles", buildJsonObject {
                    put("id", profileId); put("profile_json", saved); put("headline", headline); put("summary", summary); put("updated_at", at)
                })
            }
            if (unsavedFacts.isNotEmpty()) {
                Api.backend.send("POST", "/api/data/candidate_facts", JsonArray(unsavedFacts.map { factRow(it, profileId, at) }))
                DataStore.changed()
            }
            unsavedFacts = emptyList()
            profileEdited = false
            notice = "Profile saved."
        }
    }
}

private enum class Section(val label: String) { Search("Search"), Saved("Saved"), Applications("Applications"), Profile("Profile") }

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun JobAgentScreen(session: Session, nav: Nav) {
    val scope = rememberCoroutineScope()
    val model = remember { JobAgentModel(session.email) }
    var section by remember { mutableStateOf(Section.Search) }
    var opened by remember { mutableStateOf<JobListing?>(null) }
    LaunchedEffect(Unit) { model.load() }
    ReloadOnDataChange { model.load() }
    BackHandler(opened != null) { opened = null }

    var tailoring by remember { mutableStateOf<JobListing?>(null) }
    BackHandler(tailoring != null) { tailoring = null }

    tailoring?.let { return JobTailorScreen(model, it) { tailoring = null } }
    opened?.let { return JobDetail(model, it, onBack = { opened = null }, tailor = { tailoring = it }) }

    ListScreen("Job Agent", model.loaded, refresh = { model.load() }, onBack = nav::back) {
        if (model.disabled) {
            item { Hint("Job Agent is turned off on this server.") }
            return@ListScreen
        }
        item("sections") {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Section.entries.forEach { s -> FilterChip(section == s, { section = s }, label = { Text(s.label) }) }
            }
        }
        item { ErrorText(model.error) }
        when (section) {
            Section.Search -> searchItems(model) { opened = it }
            Section.Saved -> savedItems(model) { opened = it }
            Section.Applications -> applicationItems(model, onOpen = { opened = it }, tailor = { tailoring = it })
            Section.Profile -> profileItems(model)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.searchItems(model: JobAgentModel, open: (JobListing) -> Unit) {
    item("query") {
        val scope = rememberCoroutineScope()
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Job title or keywords *", model.query, { model.query = it })
            Field("Location", model.location, { model.location = it })
            Choice("Remote", remotePreferences.map(::titleCase), titleCase(model.remote)) { model.remote = it.lowercase() }
            if (model.searching) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(24.dp), color = Palette.blue, strokeWidth = 2.dp)
                Text("Searching job boards…", fontSize = 13.sp, color = Palette.secondary)
            } else GlowButton("Search", enabled = model.query.isNotBlank()) { scope.launch { model.search() } }
        }
    }
    if (model.searched && model.results.isEmpty()) item { Hint("No jobs found. Try other words or a wider location.") }
    model.results.forEach { listing -> item(listing.job.id.ifEmpty { listing.job.canonicalUrl }) { JobRow(listing.job) { open(listing) } } }
    model.sources.filter { it.state != "complete" }.forEach { s ->
        item("source-${s.id}") {
            val context = LocalContext.current
            if (s.state == "external-search" && s.url != null) TextButton(onClick = { openInBrowser(context, s.url) }) { Text("Search on ${s.displayName}") }
            else Text("${s.displayName}: ${s.message ?: titleCase(s.state)}", fontSize = 12.sp, color = Palette.muted)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.savedItems(model: JobAgentModel, open: (JobListing) -> Unit) {
    if (model.loaded && model.saved.isEmpty()) item { Hint("No saved jobs. Open a job from Search and tap Save.") }
    model.saved.forEach { row ->
        val listing = row.job_json?.let(::jobListing) ?: return@forEach
        item(row.id) {
            val scope = rememberCoroutineScope()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { JobRow(listing.job) { open(listing) } }
                IconButton(onClick = { scope.launch { model.unsave(row) } }) { Icon(Icons.Outlined.Delete, contentDescription = "Remove", tint = Palette.muted) }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.applicationItems(model: JobAgentModel, onOpen: (JobListing) -> Unit, tailor: (JobListing) -> Unit) {
    if (model.loaded && model.applications.isEmpty()) item { Hint("No applications tracked yet. Open a job and tap Track application.") }
    model.applications.forEach { row ->
        val listing = row.job_json?.let(::jobListing) ?: return@forEach
        item(row.id) {
            val scope = rememberCoroutineScope()
            Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Column {
                    Text(listing.job.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(jobSubtitle(listing.job), fontSize = 12.sp, color = Palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Choice("Status", applicationStatuses.map(::titleCase), titleCase(row.status)) { label ->
                    scope.launch { model.setStatus(row, applicationStatuses.first { titleCase(it) == label }) }
                }
                Row {
                    TextButton(onClick = { onOpen(listing) }) { Text("View job") }
                    TextButton(onClick = { tailor(listing) }) { Text("Tailor resume & cover letter") }
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.profileItems(model: JobAgentModel) {
    item("import") {
        val scope = rememberCoroutineScope()
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SectionLabel("Import your resume")
            Field("Paste your resume text", model.resume, { model.resume = it }, minLines = 6)
            if (model.importing) CircularProgressIndicator(color = Palette.blue)
            else GlowButton("Import and extract", enabled = model.resume.trim().length >= 40) { scope.launch { model.import() } }
            model.notice?.let { Text(it, fontSize = 13.sp, color = Palette.blue) }
        }
    }
    item("profile") {
        val scope = rememberCoroutineScope()
        Panel {
            SectionLabel("Profile")
            if (model.headline.isBlank() && model.summary.isBlank()) Hint("Nothing yet. Import a resume to fill this in.")
            if (model.headline.isNotBlank()) Text(model.headline, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            if (model.summary.isNotBlank()) Text(model.summary, fontSize = 13.sp, color = Palette.secondary)
            if (model.unsaved) GlowButton("Save profile") { scope.launch { model.saveProfile() } }
        }
    }
    item { SectionLabel("Facts (${model.facts.size})") }
    model.facts.forEachIndexed { i, fact ->
        item("fact$i") {
            Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (fact.text("factType") ?: fact.text("fact_type"))?.let { Badge(it, Palette.blue) }
                    (fact["verified"] as? JsonPrimitive)?.contentOrNull?.let { Badge(if (it == "true") "verified" else if (it == "false") "unverified" else it, Palette.muted) }
                }
                Text(factText(fact), fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun JobRow(job: Job, onClick: () -> Unit) {
    Column(Modifier.card(onClick = onClick), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(job.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(jobSubtitle(job), fontSize = 12.sp, color = Palette.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        salaryText(job)?.let { Text(it, fontSize = 12.sp, color = Palette.blue) }
        job.publishedAt?.let { Text("Posted ${isoDate(it)}", fontSize = 11.sp, color = Palette.muted) }
    }
}

@Composable
private fun JobDetail(model: JobAgentModel, listing: JobListing, onBack: () -> Unit, tailor: (JobListing) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val job = listing.job
    ListScreen(job.company.ifBlank { "Job" }, loaded = true, refresh = {}, onBack = onBack) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(job.title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(jobSubtitle(job), fontSize = 13.sp, color = Palette.secondary)
                salaryText(job)?.let { Text(it, fontSize = 13.sp, color = Palette.blue) }
            }
        }
        item { ErrorText(model.error) }
        item("actions") {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                GlowButton("Apply", enabled = job.applyUrl.isNotBlank()) { openInBrowser(context, job.applyUrl) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { scope.launch { model.save(listing) } }, enabled = !model.isSaved(job)) { Text(if (model.isSaved(job)) "Saved" else "Save") }
                    TextButton(onClick = { scope.launch { model.track(listing) } }, enabled = !model.isTracked(job)) { Text(if (model.isTracked(job)) "Tracking" else "Track application") }
                }
                TextButton(onClick = { tailor(listing) }) { Text("Tailor resume & cover letter") }
            }
        }
        item("description") { Panel { SectionLabel("Description"); androidx.compose.foundation.text.selection.SelectionContainer { Text(job.descriptionText.ifBlank { "No description." }, fontSize = 13.sp) } } }
        if (job.sourceAttribution.isNotBlank()) item { Text(job.sourceAttribution, fontSize = 11.sp, color = Palette.muted) }
    }
}
