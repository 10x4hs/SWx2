// 바탕화면 위젯: 계획 목록 · 하루 시계 · 지금/다음 · 이번 주. 내 계획이면 체크(동그라미)·추가(＋)·수정(줄 누르기), 친구 계획은 보기만.
// 새로 고침: 일정이 시작·끝나는 시각마다 + 앱(메뉴 막대)이 서버에서 바뀜을 보면 바로.
import SwiftUI
import WidgetKit
import AppIntents

struct PlansEntry: TimelineEntry {
    let date: Date
    let config: PlansConfig
    let day: String
    let who: String          // 이름
    let mine: Bool
    let plans: [Plan]
    let week: [(day: String, done: Int, total: Int)]
    let note: String?        // 연결 안 됨 · 비공개 · 오류
}

struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> PlansEntry {
        PlansEntry(date: .now, config: PlansConfig(), day: Day.str(.now), who: "나", mine: true,
                   plans: [Plan(id: "a", text: "논문 읽기", period: "D:", start: "09:00", mins: 60, done: 1),
                           Plan(id: "b", text: "운동", period: "D:", start: "18:00", mins: 45, done: 0)],
                   week: [], note: nil)
    }
    func snapshot(for config: PlansConfig, in context: Context) async -> PlansEntry {
        context.isPreview ? placeholder(in: context) : await load(config, at: .now)
    }
    func timeline(for config: PlansConfig, in context: Context) async -> Timeline<PlansEntry> {
        let now = Date.now
        let first = await load(config, at: now)
        // 일정 시작 · 끝 시각마다 다시 그려요 ('지금' 표시가 옮겨 가게) — 같은 데이터로
        var entries = [first]
        if first.day == Day.str(now) {
            let startOfDay = Calendar.current.startOfDay(for: now)
            let marks = Set(first.plans.flatMap { [$0.startMin, $0.endMin].compactMap { $0 } })
                .map { startOfDay.addingTimeInterval(Double($0) * 60) }
                .filter { $0 > now }.sorted().prefix(40)
            entries += marks.map { PlansEntry(date: $0, config: first.config, day: first.day, who: first.who, mine: first.mine, plans: first.plans, week: first.week, note: first.note) }
        }
        let midnight = Calendar.current.startOfDay(for: Day.add(now, 1))
        return Timeline(entries: entries, policy: .after(min(midnight, now.addingTimeInterval(30 * 60))))
    }

    func load(_ config: PlansConfig, at now: Date) async -> PlansEntry {
        let day = Day.str(config.day == .tomorrow ? Day.add(now, 1) : now)
        func entry(_ who: String = "", _ mine: Bool = true, _ plans: [Plan] = [], _ week: [(String, Int, Int)] = [], _ note: String? = nil) -> PlansEntry {
            PlansEntry(date: now, config: config, day: day, who: who, mine: mine, plans: plans, week: week.map { (day: $0.0, done: $0.1, total: $0.2) }, note: note)
        }
        guard Trio.connected else { return entry("", true, [], [], "앱에서 연결해 주세요") }
        do {
            let me = try await API.me()
            let pid = config.person?.id ?? "me"
            let mine = pid == "me" || pid == me.id
            let user = mine ? nil : pid
            let who = mine ? me.name : (config.person?.name ?? "친구")
            if config.style == .week {
                let cal = Calendar.current
                let wd = (cal.component(.weekday, from: now) + 5) % 7 // 월요일 = 0
                let mon = Day.add(now, -wd)
                let days = (0..<7).map { Day.str(Day.add(mon, $0)) }
                let r = try await API.plans(from: days[0], to: days[6], user: user)
                if r.closed == true { return entry(who, mine, [], [], "계획을 공개하지 않았어요") }
                let week = days.map { d in
                    let ps = r.plans.filter { $0.day == d }
                    return (d, ps.filter(\.isDone).count, ps.count)
                }
                return entry(who, mine, r.plans.filter { $0.day == day }, week)
            }
            let r = try await API.plans(day: day, user: user)
            if r.closed == true { return entry(who, mine, [], [], "계획을 공개하지 않았어요") }
            return entry(who, mine, r.plans)
        } catch {
            return entry("", true, [], [], error.localizedDescription)
        }
    }
}

struct TrioPlansWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: Trio.widgetKind, intent: PlansConfig.self, provider: Provider()) { e in
            PlansView(e: e).containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Trio 계획")
        .description("계획 목록 · 하루 시계 · 지금/다음 · 이번 주 — 위젯 편집에서 골라요.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct TrioWidgets: WidgetBundle {
    var body: some Widget { TrioPlansWidget() }
}

// MARK: - 화면

private let accent = Color(red: 0.36, green: 0.42, blue: 0.95)

struct PlansView: View {
    let e: PlansEntry
    @Environment(\.widgetFamily) var family

    var nowMin: Int? { e.day == Day.str(e.date) ? Day.minuteOfDay(e.date) : nil }
    func isNow(_ p: Plan) -> Bool {
        guard let n = nowMin, let s = p.startMin, let t = p.endMin else { return false }
        return s <= n && n < t
    }

    var body: some View {
        if let note = e.note {
            VStack(spacing: 6) {
                Image(systemName: "calendar.badge.exclamationmark").font(.title2).foregroundStyle(.secondary)
                Text(note).font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .widgetURL(URL(string: "triowidget://open"))
        } else {
            VStack(alignment: .leading, spacing: 6) {
                header
                switch e.config.style {
                case .list: list
                case .ring: ring
                case .next: next
                case .week: week
                }
            }
        }
    }

    var header: some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 0) {
                Text(e.mine ? Day.label(e.day) : "\(e.who) · \(Day.label(e.day))")
                    .font(.caption.weight(.semibold)).lineLimit(1)
                if family != .systemSmall {
                    let done = e.plans.filter(\.isDone).count
                    Text("\(done)/\(e.plans.count) 끝냄").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
            if let web = Day.webURL(e.day), family != .systemSmall {
                Link(destination: web) { Text("보기").font(.caption2.weight(.medium)).padding(.horizontal, 7).padding(.vertical, 3).background(.quaternary, in: Capsule()) }
            }
            if e.mine, let add = URL(string: "triowidget://add?day=\(e.day)") {
                Link(destination: add) { Image(systemName: "plus").font(.caption.weight(.bold)).frame(width: 20, height: 20).background(accent.opacity(0.18), in: Circle()).foregroundStyle(accent) }
            }
        }
    }

    var maxRows: Int { family == .systemSmall ? 4 : family == .systemMedium ? 4 : 11 }

    /// 지난 일정은 접고 지금 · 다음부터 보여요 (공간이 모자랄 때)
    var visible: [Plan] {
        guard e.plans.count > maxRows, let n = nowMin else { return Array(e.plans.prefix(maxRows)) }
        let i = e.plans.firstIndex { ($0.endMin ?? 0) > n && $0.startMin != nil } ?? 0
        return Array(e.plans.dropFirst(max(0, min(i, e.plans.count - maxRows))).prefix(maxRows))
    }

    @ViewBuilder var list: some View {
        if e.plans.isEmpty {
            empty
        } else {
            VStack(alignment: .leading, spacing: family == .systemLarge ? 5 : 3) {
                ForEach(visible) { p in row(p) }
            }
            Spacer(minLength: 0)
            if e.plans.count > visible.count {
                Text("+\(e.plans.count - visible.count)개 더").font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    var empty: some View {
        VStack(spacing: 4) {
            Spacer(minLength: 0)
            Text(e.mine ? "계획이 없어요" : "계획이 없어요").font(.caption).foregroundStyle(.secondary)
            if e.mine { Text("＋ 를 눌러 추가해요").font(.caption2).foregroundStyle(.tertiary) }
            Spacer(minLength: 0)
        }.frame(maxWidth: .infinity)
    }

    func row(_ p: Plan) -> some View {
        let now = isNow(p)
        return HStack(spacing: 6) {
            if e.mine {
                Button(intent: ToggleDone(planId: p.id, done: !p.isDone)) {
                    Image(systemName: p.isDone ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(p.isDone ? accent : .secondary)
                }.buttonStyle(.plain)
            } else {
                Image(systemName: p.isDone ? "checkmark.circle.fill" : "circle").foregroundStyle(p.isDone ? accent : .secondary)
            }
            Link(destination: URL(string: "triowidget://edit?id=\(p.id)&day=\(e.day)")!) {
                HStack(spacing: 6) {
                    if let s = p.start, family != .systemSmall {
                        Text(s).font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
                    }
                    Text(p.text).font(.caption.weight(now ? .bold : .regular)).lineLimit(1)
                        .strikethrough(p.isDone).foregroundStyle(p.isDone ? .secondary : .primary)
                    Spacer(minLength: 0)
                }
            }.disabled(!e.mine)
        }
        .padding(.horizontal, now ? 5 : 0).padding(.vertical, now ? 2 : 0)
        .background(now ? accent.opacity(0.15) : .clear, in: RoundedRectangle(cornerRadius: 6))
    }

    // 하루 시계: 24시간 원 위에 계획을 색 띠로, 지금 시각 바늘
    var ring: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(.quaternary, lineWidth: 9)
                ForEach(e.plans.filter { $0.startMin != nil }) { p in
                    Circle()
                        .trim(from: Double(p.startMin!) / 1440, to: Double(min(p.endMin!, 1440)) / 1440)
                        .stroke(p.isDone ? accent : accent.opacity(isNow(p) ? 0.85 : 0.4), style: StrokeStyle(lineWidth: 9, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                }
                if let n = nowMin {
                    Rectangle().fill(.primary).frame(width: 1.5, height: 10).offset(y: -0.5).offset(y: -sizeHalf + 5)
                        .rotationEffect(.degrees(Double(n) / 1440 * 360))
                }
                VStack(spacing: 0) {
                    if let cur = e.plans.first(where: isNow) {
                        Text(cur.text).font(.caption2.weight(.semibold)).lineLimit(2).multilineTextAlignment(.center)
                    } else {
                        Text("\(e.plans.filter(\.isDone).count)/\(e.plans.count)").font(.headline.monospacedDigit())
                    }
                }.padding(14)
            }
            .frame(width: sizeHalf * 2, height: sizeHalf * 2)
            .widgetURL(Day.webURL(e.day))
            if family != .systemSmall { list.frame(maxWidth: .infinity) }
        }
    }
    var sizeHalf: CGFloat { family == .systemLarge ? 70 : 52 }

    // 지금 · 다음
    var next: some View {
        let n = nowMin ?? -1
        let cur = e.plans.first(where: isNow)
        let nxt = e.plans.first { ($0.startMin ?? -1) > n && !$0.isDone }
        return VStack(alignment: .leading, spacing: 6) {
            if let cur {
                Text("지금").font(.caption2).foregroundStyle(accent)
                Text(cur.text).font(.headline).lineLimit(2)
                if let t = cur.endMin { Text("\(max(t - n, 0))분 남음 · ~\(Day.hhmm(t))").font(.caption2).foregroundStyle(.secondary) }
            }
            if let nxt {
                Text("다음 · \(nxt.start ?? "")").font(.caption2).foregroundStyle(.secondary)
                Text(nxt.text).font(cur == nil ? .headline : .caption).lineLimit(2)
                if cur == nil, let s = nxt.startMin, n >= 0 { Text("\(s - n)분 뒤").font(.caption2).foregroundStyle(.secondary) }
            }
            if cur == nil && nxt == nil { empty }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // 이번 주: 요일마다 끝냄/전체 막대
    var week: some View {
        HStack(alignment: .bottom, spacing: 5) {
            ForEach(e.week, id: \.day) { d in
                VStack(spacing: 3) {
                    GeometryReader { g in
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 3).fill(.quaternary)
                            RoundedRectangle(cornerRadius: 3).fill(accent)
                                .frame(height: d.total == 0 ? 0 : g.size.height * Double(d.done) / Double(d.total))
                        }
                    }
                    Text(String(Day.label(d.day).suffix(3).dropLast().dropFirst()))
                        .font(.caption2.weight(d.day == Day.str(e.date) ? .bold : .regular))
                    if family != .systemSmall { Text("\(d.done)/\(d.total)").font(.system(size: 9).monospacedDigit()).foregroundStyle(.secondary) }
                }
            }
        }
        .widgetURL(Day.webURL(e.day))
    }
}
