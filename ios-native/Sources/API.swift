import Foundation

// The same server the website uses. Requests carry the NextAuth session
// cookie the sign-in handoff sets, kept in the shared cookie store.
enum API {
    static let base = URL(string: "https://the-third-eye.anchit-tandon.com")!

    static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = .shared
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 90
        return URLSession(configuration: config)
    }()

    static func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)!.absoluteURL
    }

    static func request(_ method: String, _ path: String, json: Any? = nil) -> URLRequest {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: json)
        }
        return req
    }

    @discardableResult
    static func send(_ method: String, _ path: String, json: Any? = nil) async throws -> Data {
        let (data, response) = try await session.data(for: request(method, path, json: json))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status) }
        return data
    }

    static func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send("GET", path))
    }
}

struct APIError: LocalizedError {
    let status: Int
    var errorDescription: String? {
        switch status {
        case 401: return "You're signed out. Sign in again."
        case 0: return "No connection. Check your internet."
        default: return "The server said \(status). Try again."
        }
    }
}

// /api/data/<entity>: rows owned by the signed-in person.
enum DataStore {
    private struct Rows<T: Decodable>: Decodable { let rows: [T] }

    static func list<T: Decodable>(_ entity: String, as type: T.Type) async throws -> [T] {
        try await API.get("/api/data/\(entity)", as: Rows<T>.self).rows
    }

    static func insert(_ entity: String, _ row: [String: Any]) async throws {
        try await API.send("POST", "/api/data/\(entity)", json: row)
    }

    static func update(_ entity: String, id: String, _ patch: [String: Any]) async throws {
        try await API.send("PATCH", "/api/data/\(entity)", json: ["id": id, "patch": patch])
    }

    static func delete(_ entity: String, id: String) async throws {
        let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        try await API.send("DELETE", "/api/data/\(entity)?id=\(escaped)")
    }
}
