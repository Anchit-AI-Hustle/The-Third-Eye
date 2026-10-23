package com.thethirdeye.app

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

// The same server the website uses. Requests carry the NextAuth session cookie
// the sign-in handoff sets, kept in the WebView cookie store so the in-app web
// pages are signed in too.
const val BASE_URL = "https://the-third-eye.anchit-tandon.com"

val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true; explicitNulls = false }

class ApiError(val status: Int, body: String = "") : IOException() {
    private val reply = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull()
    private fun field(key: String) = (reply?.get(key) as? JsonPrimitive)?.contentOrNull

    /** What the server could not delete, when it says. */
    val failed get() = (reply?.get("failed") as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()

    /** The Job Agent answers 403 with this when the server has it switched off. */
    val disabled get() = (reply?.get("disabled") as? JsonPrimitive)?.booleanOrNull == true

    override val message: String
        get() = when {
            status == 401 -> "You're signed out. Sign in again."
            status == 0 -> "No connection. Check your internet."
            status == 402 && field("code") == "insufficient_credits" ->
                "Not enough credits (needs ${field("cost")}, you have ${field("balance")}). See Plans & Credits."
            else -> field("error") ?: "The server said $status. Try again."
        }
}

/** App-wide signals: a row changed (lists reload) and the session expired (back to sign-in). */
object Events {
    val dataChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    val sessionExpired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val signedOut = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
}

/** What the screens talk to. Tests swap in a fake. */
interface Backend {
    suspend fun send(method: String, path: String, body: JsonElement? = null): String
    /** Server-sent events: (event, data) pairs. */
    fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>>
}

object Api {
    var backend: Backend = HttpBackend
    fun url(path: String): String = if (path.startsWith("http")) path else BASE_URL + path
}

private class WebViewCookies : CookieJar {
    private val store get() = CookieManager.getInstance()
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        for (c in cookies) store.setCookie(url.toString(), c.toString())
        store.flush()
    }
    override fun loadForRequest(url: HttpUrl): List<Cookie> =
        store.getCookie(url.toString())?.split(";")?.mapNotNull { Cookie.parse(url, it.trim()) } ?: emptyList()
}

object HttpBackend : Backend {
    // A reply can run tools for minutes before the next event.
    private val streaming by lazy { client.newBuilder().readTimeout(5, TimeUnit.MINUTES).build() }

    private val client by lazy {
        OkHttpClient.Builder()
            .cookieJar(WebViewCookies())
            .readTimeout(90, TimeUnit.SECONDS)
            .build()
    }
    private val type = "application/json".toMediaType()

    private fun request(method: String, path: String, body: JsonElement?): Request =
        Request.Builder().url(Api.url(path))
            .method(method, body?.toString()?.toRequestBody(type) ?: if (method == "GET" || method == "DELETE") null else "".toRequestBody(type))
            .build()

    private fun check(status: Int, body: String = "") {
        if (status == 401) Events.sessionExpired.tryEmit(Unit)
        if (status !in 200..299) throw ApiError(status, body)
    }

    override suspend fun send(method: String, path: String, body: JsonElement?): String =
        kotlinx.coroutines.withContext(Dispatchers.IO) {
            try {
                client.newCall(request(method, path, body)).execute().use { r ->
                    val text = r.body.string()
                    check(r.code, text)
                    text
                }
            } catch (e: ApiError) {
                throw e
            } catch (e: IOException) {
                throw ApiError(0)
            }
        }

    override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = flow {
        val response = try { streaming.newCall(request("POST", path, body)).execute() } catch (e: IOException) { throw ApiError(0) }
        response.use { r ->
            check(r.code)
            val source = r.body.source()
            var event = ""
            while (true) {
                val line = source.readUtf8Line() ?: break
                if (line.startsWith("event: ")) event = line.removePrefix("event: ")
                else if (line.startsWith("data: ")) {
                    val data = runCatching { json.parseToJsonElement(line.removePrefix("data: ")).jsonObject }.getOrNull() ?: continue
                    emit(event to data)
                }
            }
        }
    }.flowOn(Dispatchers.IO)
}

// /api/data/<entity>: rows owned by the signed-in person.
object DataStore {
    suspend fun list(entity: String): JsonArray =
        json.parseToJsonElement(Api.backend.send("GET", "/api/data/$entity")).jsonObject["rows"]?.jsonArray ?: JsonArray(emptyList())

    suspend inline fun <reified T> rows(entity: String): List<T> =
        list(entity).mapNotNull { runCatching { json.decodeFromJsonElement<T>(kotlinx.serialization.serializer(), it) }.getOrNull() }

    suspend fun insert(entity: String, row: JsonObject) {
        Api.backend.send("POST", "/api/data/$entity", row)
        changed()
    }

    suspend fun update(entity: String, id: String, patch: JsonObject) {
        Api.backend.send("PATCH", "/api/data/$entity", buildJsonObject { put("id", id); put("patch", patch) })
        changed()
    }

    suspend fun delete(entity: String, id: String) {
        Api.backend.send("DELETE", "/api/data/$entity?id=${URLEncoder.encode(id, "UTF-8")}")
        changed()
    }

    /** Every screen showing these rows reloads, so Today and Tasks agree. */
    fun changed() {
        Events.dataChanged.tryEmit(Unit)
    }
}
