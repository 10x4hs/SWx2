const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tabsApi", {
  send: (ch, ...a) => ipcRenderer.send(ch, ...a),
  onTabs: (fn) => ipcRenderer.on("tabs", (e, s) => fn(s)),
  onFocusAddress: (fn) => ipcRenderer.on("focus-address", fn),
});
