package com.thethirdeye.app

import android.content.Context
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DeviceTest {
    private class Recorder : Backend {
        val paths = mutableListOf<String>()
        override suspend fun send(method: String, path: String, body: JsonElement?): String {
            paths += path
            return if (path.startsWith("/api/auth/handoff")) """{"signedIn":true}""" else "{}"
        }
        override fun stream(path: String, body: JsonElement): Flow<Pair<String, JsonObject>> = emptyFlow()
    }

    private val real = Api.backend
    private val backend = Recorder()
    private val app get() = RuntimeEnvironment.getApplication()

    @Before fun fake() { Api.backend = backend }
    @After fun restore() { Api.backend = real }

    @Test fun `each account is welcomed aloud once on this phone`() {
        val prefs = app.getSharedPreferences("welcome-test", Context.MODE_PRIVATE)
        assertEquals("Welcome to The Third Eye, Anchit. I'm JARVIS, your assistant. Ask me anything, any time.", welcomeLine(prefs, "a@x.com", "Anchit Tandon"))
        // Not heard yet (the speech engine may have failed): offered again.
        assertEquals("Welcome to The Third Eye, Anchit. I'm JARVIS, your assistant. Ask me anything, any time.", welcomeLine(prefs, "a@x.com", "Anchit Tandon"))
        markWelcomed(prefs, "a@x.com")
        assertEquals(null, welcomeLine(prefs, "a@x.com", "Anchit Tandon"))
        assertEquals("Welcome to The Third Eye. I'm JARVIS, your assistant. Ask me anything, any time.", welcomeLine(prefs, "p@x.com", null))
        assertEquals(null, welcomeLine(prefs, null, "Nobody"))
    }

    @Test fun `a sign-in link this app did not ask for is ignored`() {
        val session = Session(app)
        ShadowLooper.idleMainLooper()
        app.getSharedPreferences("session", Context.MODE_PRIVATE).edit().putString("sign-in-state", "mine-1234567890ab").commit()
        session.claim("attackers-code", "someone-elses-state")
        session.claim("attackers-code", null)
        ShadowLooper.idleMainLooper()
        assertTrue(backend.paths.none { it.startsWith("/api/auth/handoff") })
        session.claim("real-code", "mine-1234567890ab")
        ShadowLooper.idleMainLooper()
        assertEquals(listOf("/api/auth/handoff?code=real-code"), backend.paths.filter { it.startsWith("/api/auth/handoff") })
        // Used once: the same link again does nothing.
        session.claim("real-code", "mine-1234567890ab")
        ShadowLooper.idleMainLooper()
        assertEquals(1, backend.paths.count { it.startsWith("/api/auth/handoff") })
    }

    @Test fun `a one-off reminder missed in the last day is shown once`() {
        val now = Instant.parse("2026-10-20T10:00:00Z")
        val rows = listOf(
            ReminderRow("a", "Call the bank", fire_at = "2026-10-20T09:00:00Z"),
            ReminderRow("b", "Old", fire_at = "2026-10-17T09:00:00Z"),
            ReminderRow("c", "Later", fire_at = "2026-10-20T12:00:00Z"),
            ReminderRow("d", "Daily", fire_at = "2026-10-20T09:00:00Z", recurrence = "daily"),
            ReminderRow("e", "Shown", fire_at = "2026-10-20T09:30:00Z"),
        )
        assertEquals(listOf("a"), Reminders.missed(rows, shown = setOf("e"), now = now).map { it.id })
    }

    @Test fun `the file picker offers every type the page accepts`() {
        assertArrayEquals(arrayOf("image/*", "application/pdf"), mimeTypes(arrayOf("image/*,.pdf")))
        assertArrayEquals(arrayOf("*/*"), mimeTypes(arrayOf("")))
    }
}
