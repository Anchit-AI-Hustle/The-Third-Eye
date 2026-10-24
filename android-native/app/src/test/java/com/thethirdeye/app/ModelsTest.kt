package com.thethirdeye.app

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class Scripted(val replies: Map<String, String>) : Backend {
    val calls = mutableListOf<Triple<String, String, JsonElement?>>()
    override suspend fun send(method: String, path: String, body: JsonElement?): String {
        calls += Triple(method, path, body)
        return replies["$method ${path.substringBefore("?")}"] ?: if (method == "GET") """{"rows":[]}""" else """{"ok":true}"""
    }
    override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = error("unused")
}

class ModelsTest {
    private val real = Api.backend
    @After fun restore() { Api.backend = real }

    private fun obj(s: String) = json.parseToJsonElement(s).jsonObject
    private val job = """{"id":"job_1","title":"Growth Marketer","company":"Northwind"}"""

    @Test fun `two assistant models picked before the first save returns are both kept`() {
        val gate = CompletableDeferred<Unit>()
        val puts = mutableListOf<JsonElement?>()
        Api.backend = object : Backend {
            override suspend fun send(method: String, path: String, body: JsonElement?): String {
                if (method == "PUT") { puts += body; gate.await() }
                return if (path == "/api/user/local-model") """{"assistantModels":{}}""" else """{"rows":[]}"""
            }
            override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = error("unused")
        }
        val model = SettingsModel().apply { local = LocalModel() }
        runBlocking {
            launch { model.setAssistantModel("jarvis", "llama3.1:8b") }
            launch { model.setAssistantModel("friday", "qwen2.5:14b") }
            launch { gate.complete(Unit) }
        }
        assertEquals(obj("""{"assistantModels":{"jarvis":"llama3.1:8b","friday":"qwen2.5:14b"}}"""), puts.last())
    }

    @Test fun `an unlock reply with ok false is not an unlock`() {
        assertTrue(unlockSucceeded("""{"ok":true}"""))
        assertFalse(unlockSucceeded("""{"ok":false}"""))
        assertFalse(unlockSucceeded("""{}"""))
        assertFalse(unlockSucceeded("not json"))
    }

    @Test fun `a wrong unlock code says so and does not reload the wallet`() {
        val backend = Scripted(mapOf("POST /api/billing/unlock" to """{"ok":false}"""))
        Api.backend = backend
        val model = PlansModel()
        runBlocking { model.unlock("nope") }
        assertEquals("That code didn't work.", model.unlockNote)
        assertTrue(backend.calls.none { it.second == "/api/billing/credits" })
    }

    @Test fun `a right unlock code reloads the wallet`() {
        val backend = Scripted(mapOf("POST /api/billing/unlock" to """{"ok":true}""", "GET /api/billing/credits" to """{"balance":10}"""))
        Api.backend = backend
        val model = PlansModel()
        runBlocking { model.unlock("yes") }
        assertEquals("Unlocked", model.unlockNote)
        assertEquals(1, backend.calls.count { it.second == "/api/billing/credits" })
    }

    @Test fun `saving a job the website dismissed updates its row instead of inserting`() {
        val backend = Scripted(mapOf("GET /api/data/saved_jobs" to """{"rows":[{"id":"sj_9","job_id":"job_1","job_json":$job,"state":"dismissed"}]}"""))
        Api.backend = backend
        val model = JobAgentModel("a@x.com")
        runBlocking {
            model.load()
            assertTrue(model.saved.isEmpty())
            model.save(jobListing(obj(job))!!)
        }
        val write = backend.calls.last { it.first != "GET" }
        assertEquals("PATCH", write.first)
        assertEquals("sj_9", write.third!!.jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals("saved", write.third!!.jsonObject["patch"]!!.jsonObject["state"]!!.jsonPrimitive.content)
    }

    @Test fun `saving a new job inserts a row`() {
        val backend = Scripted(emptyMap())
        Api.backend = backend
        runBlocking { JobAgentModel("a@x.com").save(jobListing(obj(job))!!) }
        assertEquals("POST", backend.calls.last { it.first != "GET" }.first)
    }

    @Test fun `tracking an already tracked job writes nothing`() {
        val backend = Scripted(mapOf("GET /api/data/applications" to """{"rows":[{"id":"app_1","job_id":"job_1","job_json":$job,"status":"interview"}]}"""))
        Api.backend = backend
        val model = JobAgentModel("a@x.com")
        runBlocking {
            model.load()
            model.track(jobListing(obj(job))!!)
        }
        assertTrue(backend.calls.all { it.first == "GET" })
    }

    @Test fun `every imported resume batch is saved, not just the last`() {
        fun batch(id: String) = """{"profile":{"headline":"H"},"facts":[{"id":"$id","factType":"skill","value":"$id"}]}"""
        val replies = ArrayDeque(listOf(batch("a"), batch("b")))
        val backend = object : Backend {
            val calls = mutableListOf<Triple<String, String, JsonElement?>>()
            override suspend fun send(method: String, path: String, body: JsonElement?): String {
                calls += Triple(method, path, body)
                return when {
                    path == "/api/job-agent/profile/import" -> replies.removeFirst()
                    method == "GET" -> """{"rows":[]}"""
                    else -> """{"ok":true}"""
                }
            }
            override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = error("unused")
        }
        Api.backend = backend
        val model = JobAgentModel("a@x.com")
        model.resume = "x".repeat(60)
        runBlocking {
            model.import()
            model.import()
            model.saveProfile()
        }
        val posted = backend.calls.last { it.second == "/api/data/candidate_facts" && it.first == "POST" }.third as kotlinx.serialization.json.JsonArray
        assertEquals(listOf("a", "b"), posted.map { it.jsonObject["id"]!!.jsonPrimitive.content })
    }
}
