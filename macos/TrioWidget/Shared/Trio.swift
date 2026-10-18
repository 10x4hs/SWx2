// 앱과 위젯이 같이 쓰는 것: 연결 정보(앱 그룹), 서버 API, 계획 모델, 날짜 도우미.
import Foundation
import WidgetKit

enum Trio {
    /// 앱과 위젯이 같이 읽는 설정 (~/Library/Preferences/dev.dsmmafia.trio.shared.plist).
    /// 앱 그룹은 유료 개발자 서명이 있어야 해서, 위젯 샌드박스의 shared-preference 예외로 읽어요 — 무료 · 서명 없이도 돼요
    static let defaults = UserDefaults(suiteName: "dev.dsmmafia.trio.shared") ?? .standard
    static let widgetKind = "TrioPlans"

    static var base: URL? {
        get { defaults.string(forKey: "base").flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: "base") }
    }
    static var token: String? {
        get { defaults.string(forKey: "token") }
        set { defaults.set(newValue, forKey: "token") }
    }
    static var connected: Bool { base != nil && token != nil }

    /// triowidget://connect?base=…&token=… 를 저장해요
    @discardableResult
    static func connect(_ url: URL) -> Bool {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let b = c.queryItems?.first(where: { $0.name == "base" })?.value, let base = URL(string: b),
              let t = c.queryItems?.first(where: { $0.name == "token" })?.value, !t.isEmpty else { return false }
        Trio.base = base
        Trio.token = t
        defaults.removeObject(forKey: "me")
        WidgetCenter.shared.reloadAllTimelines()
        return true
    }
    static func disconnect() {
        base = nil; token = nil
        defaults.removeObject(forKey: "me")
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - 모델

struct Plan: Codable, Identifiable, Hashable {
    let id: String
    var text: String
    var period: String
    var start: String?
    var mins: Int?
    var done: Int
    var missed: Int?
    var priority: String?

    var isDone: Bool { done == 1 }
    /// 시작 분 (0~1439), 시간이 없으면 nil
    var startMin: Int? {
        guard let s = start else { return nil }
        let p = s.split(separator: ":").compactMap { Int($0) }
        return p.count == 2 ? p[0] * 60 + p[1] : nil
    }
    var endMin: Int? { startMin.map { $0 + max(mins ?? 30, 1) } }
    var day: String { String(period.dropFirst(2)) }
}

struct Member: Codable, Identifiable, Hashable {
    let id: String
    let username: String
    let display_name: String?
    let color: String?
    let plans_open: Bool?
    var name: String { display_name ?? username.uppercased() }
}

struct PlansResponse: Codable { let plans: [Plan]; let closed: Bool? }
struct UsersResponse: Codable { let users: [Member] }
struct MeResponse: Codable { let user: Member }
struct PlanResponse: Codable { let plan: Plan }
struct StampResponse: Codable { let stamp: String }
struct ErrorResponse: Codable { let error: String }

struct TrioError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// MARK: - 서버 API (Authorization: Bearer 내 토큰)

enum API {
    static func call<T: Decodable>(_ method: String, _ path: String, body: [String: Any?]? = nil, as: T.Type = T.self) async throws -> T {
        guard let base = Trio.base, let token = Trio.token else { throw TrioError(message: "아직 연결하지 않았어요.") }
        guard let url = URL(string: "/api" + path, relativeTo: base) else { throw TrioError(message: "주소가 이상해요.") }
        var req = URLRequest(url: url, timeoutInterval: 15)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("1", forHTTPHeaderField: "x-trio")
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        if let body {
            let clean = body.mapValues { $0 ?? NSNull() }
            req.httpBody = try JSONSerialization.data(withJSONObject: clean)
        }
        let (data, res) = try await URLSession.shared.data(for: req)
        let code = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            let msg = (try? JSONDecoder().decode(ErrorResponse.self, from: data))?.error ?? "서버 오류 (\(code))"
            throw TrioError(message: msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func me() async throws -> Member {
        if let d = Trio.defaults.data(forKey: "me"), let m = try? JSONDecoder().decode(Member.self, from: d) { return m }
        let m = try await call("GET", "/me", as: MeResponse.self).user
        Trio.defaults.set(try? JSONEncoder().encode(m), forKey: "me")
        return m
    }
    static func users() async throws -> [Member] { try await call("GET", "/users", as: UsersResponse.self).users }
    static func plans(day: String, user: String? = nil) async throws -> PlansResponse {
        var p = "/plans?periods=D:\(day)"
        if let user { p += "&user=\(user)" }
        return try await call("GET", p, as: PlansResponse.self)
    }
    static func plans(from: String, to: String, user: String? = nil) async throws -> PlansResponse {
        var p = "/plans?days=\(from)..\(to)"
        if let user { p += "&user=\(user)" }
        return try await call("GET", p, as: PlansResponse.self)
    }
    static func stamp(from: String, to: String) async throws -> String {
        try await call("GET", "/widget/stamp?days=\(from)..\(to)", as: StampResponse.self).stamp
    }
    static func setDone(_ id: String, _ done: Bool) async throws {
        _ = try await call("PATCH", "/plans/\(id)", body: ["done": done], as: PlanResponse.self)
    }
    static func add(day: String, text: String, start: String?, mins: Int?) async throws -> Plan {
        try await call("POST", "/plans", body: ["scope": "day", "period": "D:\(day)", "text": text, "start": start, "mins": mins], as: PlanResponse.self).plan
    }
    static func update(_ id: String, day: String, text: String, start: String?, mins: Int?) async throws {
        _ = try await call("PATCH", "/plans/\(id)", body: ["text": text, "period": "D:\(day)", "start": start, "mins": mins], as: PlanResponse.self)
    }
    static func delete(_ id: String) async throws {
        struct OK: Codable { let ok: Bool }
        _ = try await call("DELETE", "/plans/\(id)", as: OK.self)
    }
}

// MARK: - 날짜

enum Day {
    static let fmt: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    static func str(_ d: Date) -> String { fmt.string(from: d) }
    static func date(_ s: String) -> Date? { fmt.date(from: s) }
    static func add(_ d: Date, _ n: Int) -> Date { Calendar.current.date(byAdding: .day, value: n, to: d) ?? d }
    static func minuteOfDay(_ d: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
    static func hhmm(_ m: Int) -> String { String(format: "%02d:%02d", (m / 60) % 24, m % 60) }
    static func label(_ s: String) -> String {
        guard let d = date(s) else { return s }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ko_KR")
        f.dateFormat = "M월 d일 (E)"
        return f.string(from: d)
    }
    /// 웹에서 그날 계획 화면
    static func webURL(_ day: String) -> URL? {
        guard let base = Trio.base else { return nil }
        return URL(string: "/#/calendar/\(day)", relativeTo: base)
    }
}
