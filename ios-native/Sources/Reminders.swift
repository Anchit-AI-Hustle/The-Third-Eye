import Foundation
import UserNotifications

// Reminders the assistant set (the server's reminders table), delivered as
// notifications on this iPhone. The server has no way to push to the app, so
// the app schedules them itself whenever it opens or the assistant changes them.
struct ReminderRow: Decodable {
    let id: String
    let title: String
    let body: String?
    let fire_at: String
    let recurrence: String?
    let status: String
}

enum Reminders {
    // iOS keeps at most 64 pending notifications per app.
    private static let limit = 60

    static func sync() async {
        guard UserDefaults.standard.string(forKey: "preview-tab") == nil,
              let rows = try? await DataStore.list("reminders", as: ReminderRow.self) else { return }
        let center = UNUserNotificationCenter.current()
        let pending = rows.filter { $0.status == "pending" }
        center.removeAllPendingNotificationRequests()
        guard !pending.isEmpty,
              (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true else { return }
        for row in pending.prefix(limit) {
            guard let request = request(for: row) else { continue }
            try? await center.add(request)
        }
    }

    static func clear() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    static func date(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }

    /// One notification per reminder: a repeating one keeps the time of day (and
    /// weekday or day of month) of its next firing.
    static func request(for row: ReminderRow, calendar: Calendar = .current, now: Date = .now) -> UNNotificationRequest? {
        guard let at = date(row.fire_at) else { return nil }
        let fields: Set<Calendar.Component>
        switch row.recurrence {
        case "daily": fields = [.hour, .minute]
        case "weekly": fields = [.weekday, .hour, .minute]
        case "monthly": fields = [.day, .hour, .minute]
        default:
            guard at > now else { return nil }
            fields = [.year, .month, .day, .hour, .minute, .second]
        }
        let content = UNMutableNotificationContent()
        content.title = row.title
        content.body = row.body ?? ""
        content.sound = .default
        let trigger = UNCalendarNotificationTrigger(dateMatching: calendar.dateComponents(fields, from: at), repeats: fields.count < 6)
        return UNNotificationRequest(identifier: row.id, content: content, trigger: trigger)
    }
}
