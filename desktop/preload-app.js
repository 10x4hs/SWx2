// 웹 앱(사이드바) 안에 window.trioDesktop 을 노출해요. 웹 앱은 이게 있으면 URL 페이지를 iframe 대신 오른쪽 탭으로 열어요.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("trioDesktop", {
  openUrl: (url) => ipcRenderer.invoke("app:openUrl", url),
  info: () => ipcRenderer.invoke("app:info"),
});
