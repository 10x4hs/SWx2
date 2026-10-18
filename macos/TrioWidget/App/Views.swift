// 앱 창: 연결 · 설정(MainView), 계획 추가 · 수정(EditView)
import SwiftUI
import WidgetKit
import ServiceManagement

struct MainView: View {
    @ObservedObject var live: Live
    let close: () -> Void
    @State private var link = ""
    @State private var me: Member?
    @State private var error: String?
    @State private var connected = Trio.connected
    @State private var atLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("TrioWidget").font(.title2.bold())
            if connected {
                Label(me.map { "\($0.name) 계정으로 연결됨" } ?? "연결됨", systemImage: "checkmark.seal.fill").foregroundStyle(.green)
                Text(live.status).font(.caption).foregroundStyle(.secondary)
                GroupBox("위젯 놓기") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("1. 바탕화면을 오른쪽 클릭 → **위젯 편집…**")
                        Text("2. 목록에서 **TrioWidget** 을 찾아 바탕화면으로 끌어다 놓기")
                        Text("3. 위젯을 오른쪽 클릭 → **위젯 편집** 에서 누구 · 모양 · 날짜 고르기")
                    }.font(.callout).frame(maxWidth: .infinity, alignment: .leading)
                }
                Toggle("로그인할 때 자동으로 켜기 (실시간 반영에 필요해요)", isOn: $atLogin)
                    .onChange(of: atLogin) { _, on in
                        do { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } }
                        catch { self.error = error.localizedDescription }
                    }
                HStack {
                    Button("위젯 새로 고침") { live.reload() }
                    Spacer()
                    Button("연결 끊기", role: .destructive) { Trio.disconnect(); connected = false; me = nil }
                }
            } else {
                Text("웹에서 **프로필 메뉴 → MCP 연결 → Mac 위젯 → 위젯 연결 만들기** 를 누른 다음 **TrioWidget 에 연결** 을 누르면 바로 연결돼요.")
                    .font(.callout)
                Text("버튼이 안 되면 '연결 주소 복사'를 눌러 아래에 붙여 넣어요.").font(.caption).foregroundStyle(.secondary)
                TextField("triowidget://connect?…", text: $link).textFieldStyle(.roundedBorder)
                Button("연결") {
                    if let u = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines)), Trio.connect(u) {
                        connected = true; link = ""; try? SMAppService.mainApp.register(); atLogin = true; live.reload(); Task { await loadMe() }
                    } else { error = "연결 주소가 올바르지 않아요." }
                }.keyboardShortcut(.defaultAction)
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red) }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(width: 420, height: 460)
        .task { await loadMe() }
        // 웹의 '연결' 링크로 연결되면(창이 이미 떠 있어도) 화면을 바꿔요
        .onChange(of: live.status) { _, _ in
            if connected != Trio.connected { Task { await loadMe() } }
        }
    }

    func loadMe() async {
        connected = Trio.connected
        guard connected else { return }
        do { me = try await API.me(); error = nil } catch { self.error = error.localizedDescription }
    }
}

struct EditView: View {
    let target: EditTarget
    let done: () -> Void
    @State private var text = ""
    @State private var date = Date.now
    @State private var timed = true
    @State private var time = Date.now
    @State private var mins = 30
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Bool

    var body: some View {
        Form {
            TextField("할 일", text: $text).focused($focus)
            DatePicker("날짜", selection: $date, displayedComponents: .date)
            Toggle("시간 정하기", isOn: $timed)
            if timed {
                DatePicker("시작", selection: $time, displayedComponents: .hourAndMinute)
                Stepper("걸리는 시간 \(mins)분", value: $mins, in: 5...720, step: 5)
            }
            if let error { Text(error).foregroundStyle(.red).font(.caption) }
            HStack {
                if case .edit(let id, _) = target {
                    Button("지우기", role: .destructive) { run { try await API.delete(id) } }
                }
                Spacer()
                Button("취소", action: done).keyboardShortcut(.cancelAction)
                Button(target.isAdd ? "추가" : "저장") { save() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || busy)
            }
        }
        .formStyle(.grouped)
        .frame(width: 360)
        .task { await load() }
    }

    func load() async {
        switch target {
        case .add(let day, let start):
            date = Day.date(day) ?? .now
            time = start.flatMap(parse) ?? roundedNow()
        case .edit(let id, let day):
            date = Day.date(day) ?? .now
            do {
                let ps = try await API.plans(day: day).plans
                guard let p = ps.first(where: { $0.id == id }) else { error = "계획을 찾지 못했어요."; return }
                text = p.text
                timed = p.start != nil
                time = p.start.flatMap(parse) ?? roundedNow()
                mins = p.mins ?? 30
            } catch { self.error = error.localizedDescription }
        }
        focus = true
    }

    func save() {
        let day = Day.str(date)
        let start = timed ? Day.hhmm(Day.minuteOfDay(time)) : nil
        let m = timed ? mins : nil
        let t = text.trimmingCharacters(in: .whitespaces)
        run {
            switch target {
            case .add: _ = try await API.add(day: day, text: t, start: start, mins: m)
            case .edit(let id, _): try await API.update(id, day: day, text: t, start: start, mins: m)
            }
        }
    }

    func run(_ f: @escaping () async throws -> Void) {
        busy = true
        Task {
            do { try await f(); WidgetCenter.shared.reloadAllTimelines(); done() }
            catch { self.error = error.localizedDescription }
            busy = false
        }
    }

    func parse(_ s: String) -> Date? {
        let p = s.split(separator: ":").compactMap { Int($0) }
        guard p.count == 2 else { return nil }
        return Calendar.current.date(bySettingHour: p[0], minute: p[1], second: 0, of: date)
    }
    func roundedNow() -> Date {
        let m = (Day.minuteOfDay(.now) + 4) / 5 * 5
        return Calendar.current.date(bySettingHour: min(m / 60, 23), minute: m % 60, second: 0, of: date) ?? .now
    }
}
