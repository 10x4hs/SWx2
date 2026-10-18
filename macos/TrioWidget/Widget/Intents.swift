// 위젯 편집(오른쪽 클릭 → 위젯 편집)에서 고르는 것: 누구 계획 · 보여 줄 모양 · 날짜. 그리고 위젯에서 바로 체크.
import AppIntents
import WidgetKit

struct PersonEntity: AppEntity {
    let id: String
    let name: String
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "사람"
    static var defaultQuery = PersonQuery()
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    static let me = PersonEntity(id: "me", name: "나")
}

struct PersonQuery: EntityQuery {
    func all() async -> [PersonEntity] {
        guard let users = try? await API.users() else { return [.me] }
        let me = try? await API.me()
        return [.me] + users.filter { $0.id != me?.id }.map { PersonEntity(id: $0.id, name: $0.name) }
    }
    func entities(for identifiers: [String]) async throws -> [PersonEntity] {
        let list = await all()
        return identifiers.compactMap { id in list.first { $0.id == id } }
    }
    func suggestedEntities() async throws -> [PersonEntity] { await all() }
    func defaultResult() async -> PersonEntity? { .me }
}

enum WidgetStyle: String, AppEnum {
    case list, ring, next, week
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "모양"
    static var caseDisplayRepresentations: [WidgetStyle: DisplayRepresentation] = [
        .list: "계획 목록",
        .ring: "하루 시계",
        .next: "지금 · 다음 일정",
        .week: "이번 주",
    ]
}

enum WidgetDay: String, AppEnum {
    case today, tomorrow
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "날짜"
    static var caseDisplayRepresentations: [WidgetDay: DisplayRepresentation] = [.today: "오늘", .tomorrow: "내일"]
}

struct PlansConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Trio 계획"
    static var description = IntentDescription("내 계획(또는 친구 계획)을 바탕화면에 띄워요.")
    @Parameter(title: "누구") var person: PersonEntity?
    @Parameter(title: "모양", default: .list) var style: WidgetStyle
    @Parameter(title: "날짜", default: .today) var day: WidgetDay
}

/// 위젯의 동그라미를 누르면 끝냄 ↔ 안 끝냄
struct ToggleDone: AppIntent {
    static var title: LocalizedStringResource = "계획 체크"
    @Parameter(title: "계획") var planId: String
    @Parameter(title: "끝냄") var done: Bool
    init() {}
    init(planId: String, done: Bool) { self.planId = planId; self.done = done }
    func perform() async throws -> some IntentResult {
        try await API.setDone(planId, done)
        return .result()
    }
}
