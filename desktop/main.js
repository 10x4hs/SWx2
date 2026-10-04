// Dsm-mafia 데스크톱 — Electron. 창 하나: 왼쪽 사이드바 = 웹 앱(dsm-mafia), 오른쪽 = 브라우저 탭(진짜 Chromium → YouTube · 로그인 다 됨).
// 웹 앱 쪽 코드는 그대로예요. 웹 앱의 URL 페이지가 window.trioDesktop.openUrl(url) 을 부르면 오른쪽 탭으로 열려요 (preload-app.js).
const { app, BaseWindow, WebContentsView, ipcMain, shell, Menu, session } = require("electron");
const path = require("path");

const APP_URL = process.env.TRIO_URL || "https://dsm-mafia.dsm-mafia.workers.dev/";
const CHROME_H = 44;          // 탭 + 주소줄 높이
let SIDEBAR_W = 420;          // 왼쪽 앱 폭 (접으면 0)
const MIN_SIDEBAR = 320;

let win, sidebar, chrome, tabs = [], active = -1, sidebarOpen = true;

const layout = () => {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  const sw = sidebarOpen ? Math.min(SIDEBAR_W, Math.max(MIN_SIDEBAR, Math.floor(width * 0.42))) : 0;
  sidebar.setBounds({ x: 0, y: 0, width: sw, height });
  chrome.setBounds({ x: sw, y: 0, width: width - sw, height: CHROME_H });
  tabs.forEach((t, i) => t.view.setBounds(i === active ? { x: sw, y: CHROME_H, width: width - sw, height: height - CHROME_H } : { x: 0, y: 0, width: 0, height: 0 }));
};
const state = () => chrome?.webContents.send("tabs", { tabs: tabs.map((t) => ({ id: t.id, title: t.view.webContents.getTitle() || "새 탭", url: t.view.webContents.getURL(), loading: t.view.webContents.isLoading(), canBack: t.view.webContents.navigationHistory?.canGoBack?.() ?? t.view.webContents.canGoBack(), canFwd: t.view.webContents.navigationHistory?.canGoForward?.() ?? t.view.webContents.canGoForward() })), active, sidebarOpen });

let seq = 0;
function newTab(url = "https://www.google.com/", { background = false } = {}) {
  const view = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true, partition: "persist:browser" } });
  const t = { id: ++seq, view };
  tabs.push(t); win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: u }) => { newTab(u, { background: true }); return { action: "deny" }; }); // 새 창은 새 탭으로
  for (const ev of ["page-title-updated", "did-navigate", "did-navigate-in-page", "did-start-loading", "did-stop-loading", "page-favicon-updated"]) wc.on(ev, state);
  wc.on("destroyed", () => { const i = tabs.indexOf(t); if (i >= 0) tabs.splice(i, 1); if (active >= tabs.length) active = tabs.length - 1; layout(); state(); });
  wc.loadURL(url).catch(() => {});
  if (!background || active < 0) active = tabs.length - 1;
  layout(); state();
  return t;
}
const cur = () => tabs[active]?.view.webContents;
function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id); if (i < 0) return;
  const [t] = tabs.splice(i, 1); win.contentView.removeChildView(t.view); t.view.webContents.close();
  if (!tabs.length) newTab(); else { if (active >= tabs.length) active = tabs.length - 1; else if (i < active) active--; }
  layout(); state();
}
const toUrl = (s) => { s = String(s || "").trim(); if (!s) return null; if (/^https?:\/\//i.test(s)) return s; if (/^[\w.-]+\.[a-z]{2,}(\/|$|\?)/i.test(s) || s === "localhost") return "https://" + s; return "https://www.google.com/search?q=" + encodeURIComponent(s); };

function create() {
  win = new BaseWindow({ width: 1480, height: 940, minWidth: 900, minHeight: 600, title: "Dsm-mafia", titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 }, backgroundColor: "#111214" });
  // 왼쪽: 웹 앱 (로그인 쿠키는 기본 세션에 남아요)
  sidebar = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload-app.js"), contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(sidebar);
  sidebar.webContents.loadURL(APP_URL);
  sidebar.webContents.setWindowOpenHandler(({ url }) => { newTab(url); return { action: "deny" }; }); // 앱의 '새 창으로' 도 오른쪽 탭으로
  // 오른쪽 위: 탭 + 주소줄 (로컬 HTML)
  chrome = new WebContentsView({ webPreferences: { preload: path.join(__dirname, "preload-chrome.js"), contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(chrome);
  chrome.webContents.loadFile(path.join(__dirname, "chrome.html"));
  chrome.webContents.on("did-finish-load", state);
  newTab("https://www.youtube.com/");
  win.on("resize", layout); layout();
  win.on("closed", () => { win = null; tabs = []; });
}

// ---- 탭/주소줄 → 메인 ----
ipcMain.on("tab:new", (e, url) => newTab(toUrl(url) || undefined));
ipcMain.on("tab:close", (e, id) => closeTab(id));
ipcMain.on("tab:activate", (e, id) => { const i = tabs.findIndex((t) => t.id === id); if (i >= 0) { active = i; layout(); state(); } });
ipcMain.on("tab:go", (e, s) => { const u = toUrl(s); if (u) cur()?.loadURL(u); });
ipcMain.on("tab:back", () => { const wc = cur(); (wc?.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc?.goBack()); });
ipcMain.on("tab:forward", () => { const wc = cur(); (wc?.navigationHistory?.goForward ? wc.navigationHistory.goForward() : wc?.goForward()); });
ipcMain.on("tab:reload", () => cur()?.reload());
ipcMain.on("tab:external", () => { const u = cur()?.getURL(); if (u) shell.openExternal(u); });
ipcMain.on("sidebar:toggle", () => { sidebarOpen = !sidebarOpen; layout(); state(); });
ipcMain.on("sidebar:width", (e, w) => { SIDEBAR_W = Math.max(MIN_SIDEBAR, Math.min(900, +w || SIDEBAR_W)); layout(); });
// ---- 웹 앱(사이드바) → 메인: URL 페이지를 오른쪽 탭으로 ----
ipcMain.handle("app:openUrl", (e, url) => { const u = toUrl(url); if (!u) return false; const t = tabs.find((x) => x.view.webContents.getURL().startsWith(u)); if (t) { active = tabs.indexOf(t); layout(); state(); } else newTab(u); return true; });
ipcMain.handle("app:info", () => ({ version: app.getVersion(), platform: process.platform }));

const menu = Menu.buildFromTemplate([
  { label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "hide" }, { role: "quit" }] },
  { label: "파일", submenu: [{ label: "새 탭", accelerator: "CmdOrCtrl+T", click: () => { newTab(); chrome.webContents.send("focus-address"); } }, { label: "탭 닫기", accelerator: "CmdOrCtrl+W", click: () => { const t = tabs[active]; if (t) closeTab(t.id); } }, { label: "주소줄", accelerator: "CmdOrCtrl+L", click: () => chrome.webContents.send("focus-address") }, { type: "separator" }, { label: "사이드바 접기/펴기", accelerator: "CmdOrCtrl+B", click: () => { sidebarOpen = !sidebarOpen; layout(); state(); } }] },
  { label: "편집", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
  { label: "보기", submenu: [{ label: "새로고침", accelerator: "CmdOrCtrl+R", click: () => cur()?.reload() }, { label: "뒤로", accelerator: "CmdOrCtrl+[", click: () => cur()?.goBack() }, { label: "앞으로", accelerator: "CmdOrCtrl+]", click: () => cur()?.goForward() }, { type: "separator" }, { label: "앱 새로고침", accelerator: "CmdOrCtrl+Shift+R", click: () => sidebar.webContents.reload() }, { role: "togglefullscreen" }, { label: "개발자 도구 (탭)", accelerator: "Alt+CmdOrCtrl+I", click: () => cur()?.openDevTools({ mode: "detach" }) }] },
  { role: "windowMenu" },
]);

app.whenReady().then(() => {
  Menu.setApplicationMenu(menu);
  // 브라우저 탭은 보통 Chrome 처럼 보이게 (일부 사이트가 Electron UA 를 막아요)
  const ua = session.fromPartition("persist:browser").getUserAgent().replace(/\sElectron\/\S+/, "").replace(/\sdsm-mafia-desktop\/\S+/i, "");
  session.fromPartition("persist:browser").setUserAgent(ua);
  create();
  app.on("activate", () => { if (!win) create(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
