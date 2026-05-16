const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (data) => ipcRenderer.invoke("settings:save", data),
  validateSettings: (data) => ipcRenderer.invoke("settings:validate", data),
  testSettings: (data) => ipcRenderer.invoke("settings:test", data),
  exportSettings: () => ipcRenderer.invoke("settings:export"),
  importSettings: () => ipcRenderer.invoke("settings:importPreview"),
  exportAppData: () => ipcRenderer.invoke("settings:export"),
  prepareAppDataImport: () => ipcRenderer.invoke("settings:importPreview"),
  applyAppDataImport: (token) => ipcRenderer.invoke("settings:importApply", token),
  cancelAppDataImport: (token) => ipcRenderer.invoke("settings:importCancel", token),
  importAppData: () => ipcRenderer.invoke("settings:importPreview"),

  getPresets: () => ipcRenderer.invoke("presets:get"),
  validatePreset: (data) => ipcRenderer.invoke("presets:validate", data),
  savePreset: (name, data, previousName = "") => ipcRenderer.invoke("presets:save", name, data, previousName),
  loadPreset: (name) => ipcRenderer.invoke("presets:load", name),
  deletePreset: (name) => ipcRenderer.invoke("presets:delete", name),
  exportPreset: (name, data) => ipcRenderer.invoke("presets:export", name, data),
  importPreset: () => ipcRenderer.invoke("presets:import"),
  reorderPresets: (names) => ipcRenderer.invoke("presets:reorder", names),

  getPreviewData: (data) => ipcRenderer.invoke("preview:resolve", data),

  startPresence: (data) => ipcRenderer.invoke("presence:start", data),
  stopPresence: () => ipcRenderer.invoke("presence:stop"),
  isRunning: () => ipcRenderer.invoke("presence:isRunning"),

  getUpdaterState: () => ipcRenderer.invoke("updater:getState"),
  checkForUpdates: (options) => ipcRenderer.invoke("updater:check", options),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),

  getLanguage: () => ipcRenderer.invoke("i18n:getLanguage"),
  setLanguage: (lang) => ipcRenderer.invoke("i18n:setLanguage", lang),
  getTranslations: () => ipcRenderer.invoke("i18n:getTranslations"),
  getTranslationsForLanguage: (lang) => ipcRenderer.invoke("i18n:getTranslationsFor", lang),
  getLanguages: () => ipcRenderer.invoke("i18n:getLanguages"),

  reloadWindow: () => ipcRenderer.invoke("window:reload"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  openExternalUrl: (url) => ipcRenderer.invoke("shell:openExternal", url),

  onLog: (callback) => ipcRenderer.on("presence:log", (_, msg) => callback(msg)),
  onStatus: (callback) => ipcRenderer.on("presence:status", (_, status) => callback(status)),
  onUpdaterStatus: (callback) => ipcRenderer.on("updater:status", (_, status) => callback(status)),
  onWindowMaximized: (callback) => ipcRenderer.on("window:maximized", (_, value) => callback(value)),
  onAppTitle: (callback) => ipcRenderer.on("app:title", (_, value) => callback(value))
});
