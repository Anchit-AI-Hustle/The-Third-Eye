import Foundation

enum Fmt {
    static func now() -> String { ISO8601DateFormatter().string(from: Date()) }

    static func date(_ raw: String) -> String {
        Reminders.date(raw)?.formatted(date: .abbreviated, time: .shortened) ?? raw
    }

    static func number(_ value: Double) -> String { Int(value.rounded()).formatted() }

    /// Safe inside a query string value: an e-mail's "+" must not read as a space.
    static func query(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? value
    }

    static func initialLine(_ values: [String]) -> String {
        let first = values.first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ?? ""
        return String(first.trimmingCharacters(in: .whitespacesAndNewlines).prefix(60))
    }
}

enum LocalFile {
    static let generations = "generations.json"
    static let skills = "skills.json"
    static let kolab = "kolab.json"
    static let catalog = "catalog.json"
}

// Files this phone keeps for the signed-in person (Generations, Skills, the Kolab
// brand) and the last good catalog for offline. Each store removes its own file
// on sign-out.
enum LocalStore {
    private static func url(_ name: String) -> URL { URL.applicationSupportDirectory.appending(path: name) }

    static func readData(_ name: String) -> Data? { try? Data(contentsOf: url(name)) }

    static func saveData(_ name: String, _ data: Data) {
        try? FileManager.default.createDirectory(at: .applicationSupportDirectory, withIntermediateDirectories: true)
        try? data.write(to: url(name), options: .atomic)
    }

    static func read<T: Decodable>(_ name: String, as type: T.Type) -> T? {
        guard let data = readData(name) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func write<T: Encodable>(_ name: String, _ value: T) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        saveData(name, data)
    }

    static func remove(_ name: String) {
        try? FileManager.default.removeItem(at: url(name))
    }
}

// Any JSON value, kept exactly as the server sent it so it can be sent back unchanged.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([JSONValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    /// For JSONSerialization request bodies.
    var anyValue: Any {
        switch self {
        case .null: return NSNull()
        case .bool(let v): return v
        case .number(let v): return v
        case .string(let v): return v
        case .array(let v): return v.map(\.anyValue)
        case .object(let v): return v.mapValues(\.anyValue)
        }
    }

    var text: String {
        switch self {
        case .null: return ""
        case .bool(let v): return v ? "yes" : "no"
        case .number(let v): return v.rounded() == v && abs(v) < 1e15 ? String(Int(v)) : String(v)
        case .string(let v): return v
        case .array(let v): return v.map(\.text).filter { !$0.isEmpty }.joined(separator: ", ")
        case .object(let v): return v.keys.sorted().compactMap { key in v[key].map { "\(key): \($0.text)" } }.joined(separator: ", ")
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let v) = self { return v[key] }
        return nil
    }
}

extension Encodable {
    /// A Codable value as the plain JSON object JSONSerialization request bodies take.
    var jsonObject: Any {
        guard let data = try? JSONEncoder().encode(self),
              let object = try? JSONSerialization.jsonObject(with: data) else { return NSNull() }
        return object
    }
}
