import AppIntents

// "Hey Siri, ask The Third Eye" (or "ask Jarvis"), and the same actions in Shortcuts,
// so they can sit on the Action button, Back Tap (Settings > Accessibility > Touch)
// or a Lock Screen control. Each opens the app on the Assistant.
struct AskThirdEyeIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask The Third Eye"
    static var description = IntentDescription("Opens The Third Eye and asks it your question.")
    static var openAppWhenRun = true

    @Parameter(title: "Question", requestValueDialog: "What would you like to ask?")
    var question: String

    @MainActor
    func perform() async throws -> some IntentResult {
        AppState.shared.ask(question)
        return .result()
    }
}

struct TalkToThirdEyeIntent: AppIntent {
    static var title: LocalizedStringResource = "Talk to The Third Eye"
    static var description = IntentDescription("Opens The Third Eye in a hands-free call: speak, and it answers out loud.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppState.shared.startCall()
        return .result()
    }
}

struct MorningBriefingIntent: AppIntent {
    static var title: LocalizedStringResource = "Morning briefing"
    static var description = IntentDescription("Opens The Third Eye with today's tasks, meetings and weather.")
    static var openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppState.shared.ask("Give me my morning briefing")
        return .result()
    }
}

// In a share-sheet Shortcut, anything shared from another app is saved as a note, as /share on the website.
struct SaveToThirdEyeIntent: AppIntent {
    static var title: LocalizedStringResource = "Save to The Third Eye"
    static var description = IntentDescription("Saves text or a link to The Third Eye as a note.")
    static var openAppWhenRun = true

    @Parameter(title: "Content", requestValueDialog: "What should I save?")
    var content: String

    @MainActor
    func perform() async throws -> some IntentResult {
        AppState.shared.ask(SharedNote.message(content))
        return .result()
    }
}

enum SharedNote {
    static func message(_ content: String) -> String {
        "I shared this with you. Save it as a note, then tell me in one line what it is.\n\n" + String(content.trimmingCharacters(in: .whitespacesAndNewlines).prefix(4000))
    }
}

struct ThirdEyeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AskThirdEyeIntent(), phrases: ["Ask \(.applicationName)", "Ask \(.applicationName) something"],
                    shortTitle: "Ask", systemImageName: "bubble.left.and.text.bubble.right")
        AppShortcut(intent: TalkToThirdEyeIntent(), phrases: ["Talk to \(.applicationName)", "Call \(.applicationName)"],
                    shortTitle: "Talk", systemImageName: "phone.fill")
        AppShortcut(intent: MorningBriefingIntent(), phrases: ["Morning briefing in \(.applicationName)", "Brief me with \(.applicationName)"],
                    shortTitle: "Morning briefing", systemImageName: "sun.max")
        AppShortcut(intent: SaveToThirdEyeIntent(), phrases: ["Save to \(.applicationName)", "Note this in \(.applicationName)"],
                    shortTitle: "Save", systemImageName: "square.and.arrow.down")
    }
}
