package com.thethirdeye.app

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

class LogicTest {
    @Test fun `only a plain yes approves, and a no at the start cancels`() {
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("yes"))
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("Yes please, go ahead"))
        assertEquals(VoiceAnswer.Yes, VoiceAnswer.of("haan ji"))
        assertEquals(VoiceAnswer.No, VoiceAnswer.of("no"))
        assertEquals(VoiceAnswer.No, VoiceAnswer.of("Don't"))
        assertNull(VoiceAnswer.of("yes but don't send it"))
        assertNull(VoiceAnswer.of("wait"))
        assertNull(VoiceAnswer.of("what's the weather"))
        assertNull(VoiceAnswer.of(""))
    }

    @Test fun `replies are spoken without markdown or links`() {
        assertEquals("Done. See the docs", Voice.speakable("**Done.** See [the docs](https://x.com) https://y.com"))
    }

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun row(at: String, recurrence: String? = null) = ReminderRow(id = "r", title = "t", fire_at = at, recurrence = recurrence)

    @Test fun `a one-off reminder fires once, only if still ahead`() {
        val now = Instant.parse("2026-10-20T10:00:00Z")
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), Reminders.nextFire(row("2026-10-20T12:00:00.000Z"), now, ist))
        assertNull(Reminders.nextFire(row("2026-10-20T09:00:00Z"), now, ist))
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), Reminders.nextFire(row("2026-10-20 12:00:00+00:00"), now, ist))
        assertNull(Reminders.nextFire(row("not a date"), now, ist))
    }

    @Test fun `repeating reminders keep their time of day, weekday and day of month`() {
        val now = Instant.parse("2026-10-20T10:00:00Z")
        // 08:00 IST daily, first set months ago: next is tomorrow 08:00 IST.
        assertEquals(Instant.parse("2026-10-21T02:30:00Z"), Reminders.nextFire(row("2026-06-01T02:30:00Z", "daily"), now, ist))
        // Weekly from a Monday: next Monday.
        assertEquals(Instant.parse("2026-10-26T02:30:00Z"), Reminders.nextFire(row("2026-10-05T02:30:00Z", "weekly"), now, ist))
        // Monthly on the 31st: October 31st, not a date that drifted to the 28th.
        assertEquals(Instant.parse("2026-10-31T02:30:00Z"), Reminders.nextFire(row("2026-01-31T02:30:00Z", "monthly"), now, ist))
    }

    @Test fun `numbers decode whether the database sends them as numbers or strings`() {
        val j = Json { ignoreUnknownKeys = true }
        assertEquals(12.5, j.decodeFromString(Goal.serializer(), """{"id":"g","title":"Read","target":"12.5","current":3}""").target, 0.0)
        assertEquals(0.25f, j.decodeFromString(Goal.serializer(), """{"id":"g","title":"Read","target":12,"current":"3"}""").progress, 0.001f)
        assertEquals(0.0, j.decodeFromString(Expense.serializer(), """{"id":"e","amount":"oops"}""").amount, 0.0)
    }

    @Test fun `bold and code render, the rest stays as written`() {
        val text = inlineMarkdown("Your **3 tasks** are in `Tasks`.")
        assertEquals("Your 3 tasks are in Tasks.", text.text)
        assertEquals(2, text.spanStyles.size)
    }

    @Test fun `greeting uses the first name and the hour`() {
        assertEquals("Good morning, Anchit", greeting("Anchit Tandon", 8))
        assertEquals("Good evening", greeting(null, 20))
        assertEquals("Good afternoon", greeting("  ", 13))
    }
}
