import Foundation

extension Notification.Name {
    /// A row was saved or deleted here or by the assistant: lists reload.
    static let dataChanged = Notification.Name("TheThirdEye.dataChanged")
    /// The server answered 401: the session cookie has expired.
    static let sessionExpired = Notification.Name("TheThirdEye.sessionExpired")
}

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
        if PreviewMode.active { config.protocolClasses = [PreviewProtocol.self] }
        return URLSession(configuration: config)
    }()

    static func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)?.absoluteURL ?? base
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
        if status == 401 { NotificationCenter.default.post(name: .sessionExpired, object: nil) }
        guard (200..<300).contains(status) else { throw APIError(status: status) }
        return data
    }

    /// Like send, but keeps the server's own error text and its 402 / disabled details.
    @discardableResult
    static func fetch(_ method: String, _ path: String, json: Any? = nil) async throws -> Data {
        let (data, response) = try await session.data(for: request(method, path, json: json))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { NotificationCenter.default.post(name: .sessionExpired, object: nil) }
        guard (200..<300).contains(status) else { throw ServerError(status: status, body: data) }
        return data
    }

    static func call<T: Decodable>(_ method: String, _ path: String, json: Any? = nil, as type: T.Type) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await fetch(method, path, json: json))
    }

    static func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        try JSONDecoder().decode(T.self, from: try await send("GET", path))
    }

    /// Sends files as multipart form fields named `field`, keeping the server's own error text.
    static func upload(_ path: String, field: String, files: [(name: String, mime: String, data: Data)]) async throws -> Data {
        let boundary = "TheThirdEye-\(UUID().uuidString)"
        var body = Data()
        for file in files {
            let name = file.name.replacingOccurrences(of: "\"", with: "'")
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"; filename=\"\(name)\"\r\nContent-Type: \(file.mime)\r\n\r\n".utf8))
            body.append(file.data)
            body.append(Data("\r\n".utf8))
        }
        body.append(Data("--\(boundary)--\r\n".utf8))
        var req = request("POST", path)
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.upload(for: req, from: body)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { NotificationCenter.default.post(name: .sessionExpired, object: nil) }
        guard (200..<300).contains(status) else { throw ServerError(status: status, body: data) }
        return data
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

struct ServerError: LocalizedError {
    let status: Int
    let message: String?
    let disabled: Bool
    let failed: [String]

    init(status: Int, body: Data) {
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        self.status = status
        failed = json?["failed"] as? [String] ?? []
        disabled = json?["disabled"] as? Bool == true
        if status == 402, json?["code"] as? String == "insufficient_credits",
           let cost = json?["cost"] as? NSNumber, let balance = json?["balance"] as? NSNumber {
            message = "Not enough credits (needs \(cost.intValue), you have \(balance.intValue)). See Plans & Credits."
        } else {
            message = json?["error"] as? String
        }
    }

    var errorDescription: String? { message ?? APIError(status: status).errorDescription }
}

// /api/data/<entity>: rows owned by the signed-in person.
enum DataStore {
    private struct Rows<T: Decodable>: Decodable { let rows: [T] }

    static func list<T: Decodable>(_ entity: String, as type: T.Type) async throws -> [T] {
        try await API.get("/api/data/\(entity)", as: Rows<T>.self).rows
    }

    static func insert(_ entity: String, _ row: [String: Any]) async throws {
        try await API.send("POST", "/api/data/\(entity)", json: row)
        changed()
    }

    static func update(_ entity: String, id: String, _ patch: [String: Any]) async throws {
        try await API.send("PATCH", "/api/data/\(entity)", json: ["id": id, "patch": patch])
        changed()
    }

    static func delete(_ entity: String, id: String) async throws {
        let escaped = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        try await API.send("DELETE", "/api/data/\(entity)?id=\(escaped)")
        changed()
    }

    /// Every screen showing these rows reloads, so Today and Tasks agree.
    static func changed() {
        NotificationCenter.default.post(name: .dataChanged, object: nil)
    }
}
