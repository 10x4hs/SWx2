// 집중 알림 (맥 알림 센터): 브라우저를 안 보고 있어도, 탭을 닫아도 맥 오른쪽 위에 떠요.
// - 집중 시작: 웹에서 집중을 켜면 (내 presence 가 focus 로 바뀌면) 바로 "집중 시작"
// - 집중 끝: 끝나는 시각(ends_at)에 맥이 스스로 띄우도록 미리 예약해요 → 그 시각에 인터넷이 끊겨도 와요
// - 자동 집중 계획: 오늘 · 내일 '◎ 자동 집중' 계획의 시작 시각도 미리 예약해요
// Live.tick (5초마다) 이 sync() 를 불러요. 계획은 1분에 한 번만 다시 읽어요.
import Foundation
import UserNotifications

@MainActor
enum FocusAlerts {
    private static var asked = false
    private static var lastEnds: Double?
    private static var lastPlans = Date.distantPast
    private static let center = UNUserNotificationCenter.current()

    static func sync() async {
        if !asked {
            asked = true
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
        await syncPresence()
        if Date.now.timeIntervalSince(lastPlans) > 60 {
            lastPlans = .now
            await syncAutoFocus()
        }
    }

    // MARK: 지금 집중 (presence)
    private struct PresenceResponse: Decodable { let now: Double; let members: [Member] }
    private struct Member: Decodable { let user_id: String; let focus: Bool; let started_at: Double?; let ends_at: Double? }

    private static func syncPresence() async {
        guard let me = try? await API.me(),
              let r = try? await API.call("GET", "/presence", as: PresenceResponse.self),
              let mine = r.members.first(where: { $0.user_id == me.id }) else { return }
        if mine.focus, let ends = mine.ends_at {
            if lastEnds != ends {
                let mins = Int(((ends - (mine.started_at ?? r.now)) / 60000).rounded())
                // 새로 시작한 집중이면 (1분 안) 바로 알려요. 앱을 막 켰을 때 이미 돌던 집중은 끝 알림만 예약
                if lastEnds == nil ? (r.now - (mine.started_at ?? 0) < 60000) : true {
                    post("start", "집중 시작", "\(mins)분 집중해요", at: nil)
                }
                post("end", "집중 끝", "\(mins)분 집중을 마쳤어요", at: Date(timeIntervalSince1970: ends / 1000))
                lastEnds = ends
            }
        } else if lastEnds != nil {
            // 일찍 멈췄으면 예약해 둔 '끝' 알림은 지워요 (이미 끝났으면 벌써 떴어요)
            if let e = lastEnds, Date.now.timeIntervalSince1970 * 1000 < e - 3000 { center.removePendingNotificationRequests(withIdentifiers: ["focus-end"]) }
            lastEnds = nil
        }
    }

    // MARK: 자동 집중 계획
    private struct PlansResponse: Decodable { let plans: [P] }
    private struct P: Decodable { let id: String; let text: String; let period: String; let start: String?; let auto_focus: Int?; let done: Int }

    private static func syncAutoFocus() async {
        let now = Date.now
        guard let r = try? await API.call("GET", "/plans?days=\(Day.str(now))..\(Day.str(Day.add(now, 1)))", as: PlansResponse.self) else { return }
        var want = Set<String>()
        for p in r.plans where p.auto_focus != nil && p.done == 0 {
            guard let s = p.start, p.period.hasPrefix("D:"), let at = date(String(p.period.dropFirst(2)), s), at > now else { continue }
            let id = "af-\(p.id)-\(p.period)-\(s)"
            want.insert(id)
            post(id, "집중 모드가 켜져요", "\(p.text) · \(p.auto_focus ?? 0)분", at: at, raw: true)
        }
        let pending = await center.pendingNotificationRequests()
        let stale = pending.map(\.identifier).filter { $0.hasPrefix("af-") && !want.contains($0) }
        center.removePendingNotificationRequests(withIdentifiers: stale)
    }

    private static func date(_ day: String, _ hm: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(day) \(hm)")
    }

    // at == nil 이면 바로, 아니면 그 시각에. 같은 id 면 앞의 예약을 바꿔요
    private static func post(_ key: String, _ title: String, _ body: String, at: Date?, raw: Bool = false) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        let id = raw ? key : "focus-\(key)"
        var trigger: UNNotificationTrigger? = nil
        if let at {
            let secs = at.timeIntervalSinceNow
            if secs <= 1 { trigger = nil } else { trigger = UNTimeIntervalNotificationTrigger(timeInterval: secs, repeats: false) }
        }
        center.add(UNNotificationRequest(identifier: id, content: c, trigger: trigger))
    }
}
