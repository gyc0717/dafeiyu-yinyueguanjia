const { contextBridge, ipcRenderer } = require("electron");

// 只给页面暴露窗口级能力；页面仍然通过 HTTP 调后端。
contextBridge.exposeInMainWorld("mhDesktop", {
  isDesktop: true,
  setMaterial: (material) => ipcRenderer.send("mh:material", material === "acrylic" ? "acrylic" : "none"),
  windowAction: (action) => ipcRenderer.send("mh:window", action),
  setFullscreen: (on) => ipcRenderer.send("mh:fullscreen", on),
  isMaximized: () => ipcRenderer.invoke("mh:is-maximized"),
  isFullscreen: () => ipcRenderer.invoke("mh:is-fullscreen"),
  bounds: () => ipcRenderer.invoke("mh:bounds"),
  moveWindowTo: (x, y) => ipcRenderer.send("mh:move-to", { x, y }),
  beginWindowDrag: () => ipcRenderer.send("mh:drag-start"),
  endWindowDrag: () => ipcRenderer.send("mh:drag-end"),
  onFullscreenChange: (callback) => {
    ipcRenderer.on("mh:fullscreen-changed", (_event, on) => callback(Boolean(on)));
  },
});
