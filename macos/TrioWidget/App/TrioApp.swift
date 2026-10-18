// TrioWidget 앱: 메뉴 막대에 사는 작은 도우미.
// - 연결: 웹(프로필 → MCP 연결 → Mac 위젯)의 triowidget://connect 주소로
// - 실시간: 몇 초마다 서버에 '바뀐 게 있나'(/widget/stamp)를 묻고, 바뀌면 위젯을 바로 다시 그려요 (웹 · 폰 · 친구가 고쳐도)
// - 추가 · 수정: 위젯의 ＋ / 줄을 누르면 triowidget://add · edit 로 작은 창이 열려요 (위젯은 글자 입력이 안 돼서)
import SwiftUI
import AppKit
import WidgetKit
import ServiceManagement

@main
struct TrioApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene {
        MenuBarExtra("Trio", systemImage: "checklist") {
            MenuContent(live: delegate.live, open: delegate.openMain, add: { delegate.openEditor(.add(day: Day.str(.now), start: nil)) })
        }
    }
}

struct MenuContent: View {
    @ObservedObject var live: Live
    let open: () -> Void
    let add: () -> Void
    var body: some View {
        if Trio.connected {
            Button("계획 추가…", action: add)
            Button("새로 고침") { live.reload() }
        }
        Button(Trio.connected ? "설정…" : "연결하기…", action: open)
        Divider()
        Text(live.status)
        Button("끝내기") { NSApp.terminate(nil) }
    }
}

enum EditTarget: Equatable {
    case add(day: String, start: String?)
    case edit(id: String, day: String)
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let live = Live()
    private var mainWin: NSWindow?
    private var editWin: NSWindow?

    func applicationDidFinishLaunching(_ n: Notification) {
        live.start()
        if !Trio.connected { openMain() }
    }

    func application(_ app: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "triowidget" {
            let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            let v = { (k: String) in q.first { $0.name == k }?.value }
            switch url.host {
            case "connect":
                if Trio.connect(url) { live.reload(); enableLoginItem(); openMain() }
            case "add":
                openEditor(.add(day: v("day") ?? Day.str(.now), start: v("start")))
            case "edit":
                if let id = v("id") { openEditor(.edit(id: id, day: v("day") ?? Day.str(.now))) }
            default:
                openMain()
            }
        }
    }

    func enableLoginItem() {
        try? SMAppService.mainApp.register()
    }

    func openMain() {
        let w = mainWin ?? makeWindow("TrioWidget", MainView(live: live, close: { [weak self] in self?.mainWin?.close() }), size: .init(width: 420, height: 460))
        mainWin = w
        show(w)
    }

    func openEditor(_ t: EditTarget) {
        editWin?.close()
        let w = makeWindow(t.isAdd ? "계획 추가" : "계획 수정", EditView(target: t, done: { [weak self] in
            self?.live.reload()
            self?.editWin?.close()
        }), size: .init(width: 360, height: 300))
        editWin = w
        show(w)
    }

    private func makeWindow<V: View>(_ title: String, _ view: V, size: NSSize) -> NSWindow {
        let w = NSWindow(contentRect: .init(origin: .zero, size: size), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = title
        w.isReleasedWhenClosed = false
        w.contentView = NSHostingView(rootView: view)
        w.center()
        return w
    }
    private func show(_ w: NSWindow) {
        NSApp.activate(ignoringOtherApps: true)
        w.makeKeyAndOrderFront(nil)
    }
}

extension EditTarget { var isAdd: Bool { if case .add = self { return true } else { return false } } }

// MARK: - 실시간: 바뀜 확인

@MainActor
final class Live: ObservableObject {
    @Published var status = "연결 전"
    private var last: String?
    private var timer: Timer?
    private let every: TimeInterval = 5

    nonisolated init() {}

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: every, repeats: true) { [weak self] _ in Task { @MainActor in await self?.tick() } }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.reload() }
        }
        Task { await tick() }
    }

    func reload() {
        last = nil
        WidgetCenter.shared.reloadAllTimelines()
        Task { await tick() }
    }

    func tick() async {
        guard Trio.connected else { status = "연결 전"; return }
        let now = Date.now
        do {
            // 이번 주(위젯 '이번 주')부터 내일까지 넉넉히
            let s = try await API.stamp(from: Day.str(Day.add(now, -7)), to: Day.str(Day.add(now, 7)))
            if let last, last != s { WidgetCenter.shared.reloadAllTimelines() }
            last = s
            let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
            status = "실시간 연결됨 · \(f.string(from: now))"
        } catch {
            status = "연결 문제: \(error.localizedDescription)"
        }
    }
}
