import SwiftUI

// Sign-in: Google refuses sign-in inside an app, so the app registers a random
// code, opens /auth/handoff in Safari where the person signs in and approves
// it, then claims the code for its own session cookie (frontend
// app/api/auth/handoff).
@MainActor
final class Session: ObservableObject {
    enum State { case checking, signedOut, signedIn }

    @Published var state: State = .checking
    @Published var pendingCode: String?
    @Published var error: String?
    @Published var name: String?

    private var poller: Task<Void, Never>?

    func refresh() async {
        // CI's layout screenshots open the tabs without an account.
        if UserDefaults.standard.string(forKey: "preview-tab") != nil { state = .signedIn; return }
        do {
            let data = try await API.send("GET", "/api/auth/session")
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let user = json?["user"] as? [String: Any]
            name = user?["name"] as? String
            state = user == nil ? .signedOut : .signedIn
        } catch {
            state = .signedOut
        }
    }

    func signIn() async {
        error = nil
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let code = bytes.map { String(format: "%02x", $0) }.joined()
        do {
            try await API.send("POST", "/api/auth/handoff", json: ["code": code])
        } catch {
            self.error = error.localizedDescription
            return
        }
        pendingCode = code
        _ = await UIApplication.shared.open(API.url("/auth/handoff?code=\(code)"))
        poller?.cancel()
        poller = Task {
            // The code lives ten minutes on the server.
            for _ in 0..<300 where !Task.isCancelled {
                if await pollOnce() { return }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    @discardableResult
    func pollOnce() async -> Bool {
        guard let code = pendingCode else { return false }
        guard let data = try? await API.send("GET", "/api/auth/handoff?code=\(code)"),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              json["signedIn"] as? Bool == true else { return false }
        pendingCode = nil
        poller?.cancel()
        await refresh()
        return true
    }

    func signOut() {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] { HTTPCookieStorage.shared.deleteCookie(cookie) }
        state = .signedOut
    }
}

struct SignInView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        ZStack {
            Starfield()
            ScrollView {
                VStack(spacing: 28) {
                    Spacer(minLength: 40)
                    Image("LaunchLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 240)
                        .shadow(color: Theme.violet.opacity(0.45), radius: 24)
                    StatusPill(text: "Personal AI OS")
                    VStack(spacing: 8) {
                        Text("Your assistant, always on call")
                            .font(.system(size: 28, weight: .bold))
                            .multilineTextAlignment(.center)
                        Text("Talk or type. It knows your tasks, notes and files, and acts on them for you.")
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.secondary)
                            .multilineTextAlignment(.center)
                    }
                    VStack(spacing: 14) {
                        if let code = session.pendingCode {
                            Text("Finish signing in with Google in Safari, approve code")
                                .font(.system(size: 14))
                                .multilineTextAlignment(.center)
                            Text(code.prefix(4).uppercased())
                                .font(.system(size: 26, weight: .semibold, design: .monospaced))
                                .tracking(6)
                                .foregroundStyle(Theme.blue)
                            Text("then come back here. This screen opens your workspace by itself.")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                                .multilineTextAlignment(.center)
                        } else {
                            Button("Continue with Google") { Task { await session.signIn() } }
                                .buttonStyle(GlowButtonStyle())
                        }
                        if let error = session.error {
                            Text(error).font(.system(size: 13)).foregroundStyle(Theme.red)
                        }
                    }
                    .padding(24)
                    .background(Theme.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.border))
                    Text("Private by design. Your data stays in your own workspace.")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
    }
}
