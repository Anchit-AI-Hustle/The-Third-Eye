import Combine
import SwiftUI

extension View {
    /// Reloads when any row is saved or deleted, here or by the assistant.
    func reloadsOnDataChange(_ load: @escaping () async -> Void) -> some View {
        onReceive(NotificationCenter.default.publisher(for: .dataChanged).receive(on: RunLoop.main)) { _ in
            Task { await load() }
        }
    }
}

// frontend/DESIGN.md tokens.
enum Theme {
    static let background = Color(red: 0x05 / 255, green: 0x05 / 255, blue: 0x05 / 255)
    static let surface = Color(red: 0x07 / 255, green: 0x11 / 255, blue: 0x1F / 255)
    static let elevated = Color(red: 0x0D / 255, green: 0x1B / 255, blue: 0x30 / 255)
    static let border = Color(red: 0x0F / 255, green: 0x22 / 255, blue: 0x35 / 255)
    static let blue = Color(red: 0x4F / 255, green: 0xC3 / 255, blue: 0xF7 / 255)
    static let violet = Color(red: 0x7B / 255, green: 0x5C / 255, blue: 0xF0 / 255)
    static let secondary = Color(red: 0xB0 / 255, green: 0xB8 / 255, blue: 0xC8 / 255)
    static let muted = Color(red: 0x7F / 255, green: 0x87 / 255, blue: 0xA8 / 255)
    static let red = Color(red: 0xEF / 255, green: 0x44 / 255, blue: 0x44 / 255)
    static let gradient = LinearGradient(colors: [blue, violet], startPoint: .topLeading, endPoint: .bottomTrailing)
}

// The landing page's look: near-black, scattered stars, a blue-violet glow.
struct Starfield: View {
    var body: some View {
        Canvas { ctx, size in
            var seed: UInt64 = 7
            func next() -> Double {
                seed = seed &* 6364136223846793005 &+ 1442695040888963407
                return Double(seed >> 33) / Double(1 << 31)
            }
            for _ in 0..<Int(size.width * size.height / 2600) {
                let r = 0.4 + next() * 1.1
                let rect = CGRect(x: next() * size.width, y: next() * size.height, width: r * 2, height: r * 2)
                let color = next() < 0.7 ? Theme.blue : Color(red: 0.7, green: 0.78, blue: 1)
                ctx.fill(Path(ellipseIn: rect), with: .color(color.opacity(0.2 + next() * 0.5)))
            }
        }
        .background(
            RadialGradient(colors: [Theme.violet.opacity(0.22), Theme.blue.opacity(0.06), .clear], center: .center, startRadius: 0, endRadius: 420)
        )
        .background(Theme.background)
        .ignoresSafeArea()
    }
}

struct GlowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Theme.background)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Theme.blue, in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: Theme.blue.opacity(0.35), radius: 16)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct StatusPill: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(Theme.blue).frame(width: 6, height: 6)
            Text(text.uppercased()).font(.system(size: 11, weight: .medium, design: .monospaced)).tracking(2)
        }
        .foregroundStyle(Theme.blue)
        .padding(.horizontal, 12).padding(.vertical, 5)
        .background(Theme.blue.opacity(0.1), in: Capsule())
        .overlay(Capsule().stroke(Theme.blue.opacity(0.3)))
    }
}
