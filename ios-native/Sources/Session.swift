import AuthenticationServices
import SwiftUI
import WebKit

// Sign-in: Google refuses sign-in inside an app's own web view, so it runs in
// the system sign-in sheet (shared with Safari, so a Google account already
// signed in there is one tap). frontend api/app-signin then hands back a
// one-time code through thethirdeye://auth, which the app claims for its own
// session cookie at /api/auth/handoff.
@MainActor
final class Session: ObservableObject {
    enum State { case checking, signedOut, signedIn }

    @Published var state: State = .checking
    @Published var busy = false
    @Published var error: String?
    @Published var name: String?

    private static let wasSignedIn = "was-signed-in"
    private var expiry: NSObjectProtocol?

    init() {
        expiry = NotificationCenter.default.addObserver(forName: .sessionExpired, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.expired() }
        }
    }

    func refresh() async {
        // CI's layout screenshots open the tabs without an account.
        if UserDefaults.standard.string(forKey: "preview-tab") != nil { state = .signedIn; return }
        do {
            let data = try await API.send("GET", "/api/auth/session")
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            let user = json?["user"] as? [String: Any]
            name = user?["name"] as? String
            state = user == nil ? .signedOut : .signedIn
            UserDefaults.standard.set(state == .signedIn, forKey: Self.wasSignedIn)
        } catch {
            // Offline is not signed out: open the app and let each screen say it can't reach the server.
            state = UserDefaults.standard.bool(forKey: Self.wasSignedIn) ? .signedIn : .signedOut
        }
    }

    private func expired() {
        guard state == .signedIn, UserDefaults.standard.string(forKey: "preview-tab") == nil else { return }
        signOut()
        error = "Your session ended. Sign in again to carry on."
    }

    func signIn(with web: WebAuthenticationSession) async {
        error = nil
        busy = true
        defer { busy = false }
        do {
            let back = try await web.authenticate(using: API.url("/api/app-signin"), callbackURLScheme: "thethirdeye")
            guard let code = URLComponents(url: back, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else {
                error = "Sign-in didn't finish. Try again."
                return
            }
            let escaped = code.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
            let data = try await API.send("GET", "/api/auth/handoff?code=\(escaped)")
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard json?["signedIn"] as? Bool == true else {
                error = "Sign-in expired. Try again."
                return
            }
            await refresh()
        } catch ASWebAuthenticationSessionError.canceledLogin {
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Leaves nothing signed in behind: the app's cookies, the in-app web pages'
    /// own store, this phone's action log and its scheduled reminders.
    func signOut() {
        for cookie in HTTPCookieStorage.shared.cookies ?? [] { HTTPCookieStorage.shared.deleteCookie(cookie) }
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
        AgentLog.shared.clear()
        Reminders.clear()
        UserDefaults.standard.set(false, forKey: Self.wasSignedIn)
        name = nil
        state = .signedOut
    }
}

struct SignInView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.webAuthenticationSession) private var webAuth

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
                        Button(session.busy ? "Signing in…" : "Continue with Google") { Task { await session.signIn(with: webAuth) } }
                            .buttonStyle(GlowButtonStyle())
                            .disabled(session.busy)
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
