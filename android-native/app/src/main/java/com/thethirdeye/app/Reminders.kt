package com.thethirdeye.app

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// Reminders the assistant set (the server's reminders table), delivered as
// notifications on this phone. The server has no way to push to the app, so
// the app schedules them itself whenever it comes to the front, and again after
// the phone restarts.
@Serializable
data class ReminderRow(
    val id: String,
    val title: String,
    val body: String? = null,
    val fire_at: String,
    val recurrence: String? = null,
    val status: String = "pending",
)

object Reminders {
    private const val CHANNEL = "reminders"
    private const val PREFS = "reminders"

    fun parse(raw: String): Instant? =
        runCatching { Instant.parse(raw) }.recoverCatching { OffsetDateTime.parse(raw.replace(" ", "T")).toInstant() }.getOrNull()

    /** The next time a reminder fires after `now`; a repeating one keeps its time of day (and weekday or day of month). */
    fun nextFire(row: ReminderRow, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): Instant? {
        val first = parse(row.fire_at) ?: return null
        val unit = when (row.recurrence) {
            "daily" -> ChronoUnit.DAYS
            "weekly" -> ChronoUnit.WEEKS
            "monthly" -> ChronoUnit.MONTHS
            else -> return first.takeIf { it.isAfter(now) }
        }
        // Counted from the first time, so the 31st stays the 31st (or the month's last day) rather than drifting.
        val start = first.atZone(zone)
        var n = maxOf(0L, unit.between(start, now.atZone(zone)))
        while (!start.plus(n, unit).toInstant().isAfter(now)) n++
        return start.plus(n, unit).toInstant()
    }

    suspend fun sync(context: Context) {
        val rows = runCatching { DataStore.rows<ReminderRow>("reminders") }.getOrNull() ?: return
        schedule(context, rows.filter { it.status == "pending" })
    }

    /** One-off reminders that came due while nothing was scheduled (phone off, app not opened): shown now, once. */
    fun missed(rows: List<ReminderRow>, shown: Set<String>, now: Instant = Instant.now()): List<ReminderRow> = rows.filter { row ->
        val at = parse(row.fire_at)
        row.recurrence == null && row.id !in shown && at != null && !at.isAfter(now) && at.isAfter(now.minus(1, ChronoUnit.DAYS))
    }

    fun schedule(context: Context, rows: List<ReminderRow>) {
        cancelAll(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val shown = prefs.getStringSet("shown", emptySet()).orEmpty()
        missed(rows, shown).forEach { notify(context, it) }
        val alarms = context.getSystemService(AlarmManager::class.java)
        // Exact when the person allows it (Settings, Alarms & reminders); otherwise Android's
        // standard window, which can run a few minutes late while the phone is idle.
        val exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()
        val scheduled = rows.mapNotNull { row -> nextFire(row)?.let { row to it } }
        for ((row, at) in scheduled) {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toEpochMilli(), pending(context, row))
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toEpochMilli(), pending(context, row))
        }
        prefs.edit()
            .putString("rows", json.encodeToString(ListSerializer(ReminderRow.serializer()), scheduled.map { it.first }))
            .apply()
    }

    fun stored(context: Context): List<ReminderRow> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("rows", null)
            ?.let { runCatching { json.decodeFromString(ListSerializer(ReminderRow.serializer()), it) }.getOrNull() } ?: emptyList()

    private fun cancelAll(context: Context) {
        val alarms = context.getSystemService(AlarmManager::class.java)
        for (row in stored(context)) alarms.cancel(pending(context, row))
    }

    fun clear(context: Context) {
        cancelAll(context)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun pending(context: Context, row: ReminderRow): PendingIntent =
        PendingIntent.getBroadcast(
            context, row.id.hashCode(),
            Intent(context, ReminderReceiver::class.java).putExtra("id", row.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun notify(context: Context, row: ReminderRow) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putStringSet("shown", (prefs.getStringSet("shown", emptySet()).orEmpty() + row.id).toList().takeLast(200).toSet()).apply()
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        manager.notify(
            row.id.hashCode(),
            Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF4FC3F7.toInt())
                .setContentTitle(row.title)
                .setContentText(row.body.orEmpty())
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val rows = Reminders.stored(context)
        val row = rows.firstOrNull { it.id == intent.getStringExtra("id") } ?: return
        Reminders.notify(context, row)
        // Repeating ones are set again for their next time.
        if (row.recurrence != null) Reminders.schedule(context, rows) else Reminders.schedule(context, rows - row)
    }
}

// Alarms are cleared by a restart and an app update, and a time-zone change moves "8am".
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIMEZONE_CHANGED)) {
            Reminders.schedule(context, Reminders.stored(context))
        }
    }
}
