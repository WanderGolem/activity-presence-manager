const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  shell
} = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store").default;
const { autoUpdater } = require("electron-updater");
const { PresenceService } = require("./presence");

const packageJson = require("./package.json");

const APP_DISPLAY_NAME =
  packageJson.productName ||
  packageJson.build?.productName ||
  packageJson.name ||
  "Activity Presence Manager";
const APM_FILE_EXTENSION = "apm";
const APM_FORMAT_ID = "activity-presence-manager";
const APM_FORMAT_VERSION = 1;

const DEFAULT_LANGUAGE = "en";
const DEFAULT_THEME = "dark";
const DEFAULT_ACCENT_COLOR = "#5865f2";
const DEFAULT_UI_ZOOM = 100;
const DEFAULT_TWITCH_API_MODE = "managed";
const DEFAULT_AUTO_CHECK_FOR_UPDATES = true;

const PRESET_FIELDS = [
  "activitySource",
  "twitchApiMode",
  "twitchClientId",
  "twitchClientSecret",
  "streamerLogin",
  "youtubeApiKey",
  "youtubeChannel",
  "customDisplayName",
  "customTitle",
  "customGame",
  "customStreamUrl",
  "customActivityType",
  "customTimestampMode",
  "customTimestampStart",
  "customTimestampEnd",
  "customButtonOneLabel",
  "customButtonTwoLabel",
  "customButtonTwoUrl",
  "customLargeImageKey",
  "customLargeImageUrl",
  "customSmallImageKey",
  "customSmallImageUrl",
  "customLargeText",
  "customSmallText",
  "discordAppClientId",
  "discordInviteUrl",
  "largeImageKey",
  "largeImageUrl",
  "smallImageLiveKey",
  "smallImageLiveUrl",
  "smallImageOfflineKey",
  "smallImageOfflineUrl"
];

const store = new Store({
  name: "config",
  defaults: {
    activitySource: "twitch",
    twitchApiMode: DEFAULT_TWITCH_API_MODE,
    twitchClientId: "",
    twitchClientSecret: "",
    streamerLogin: "",
    youtubeApiKey: "",
    youtubeChannel: "",
    customDisplayName: "",
    customTitle: "",
    customGame: "",
    customStreamUrl: "",
    customActivityType: "playing",
    customTimestampMode: "none",
    customTimestampStart: "",
    customTimestampEnd: "",
    customButtonOneLabel: "",
    customButtonTwoLabel: "",
    customButtonTwoUrl: "",
    customLargeImageKey: "",
    customLargeImageUrl: "",
    customSmallImageKey: "",
    customSmallImageUrl: "",
    customLargeText: "",
    customSmallText: "",
    discordAppClientId: "",
    discordInviteUrl: "",
    largeImageKey: "",
    largeImageUrl: "",
    smallImageLiveKey: "",
    smallImageLiveUrl: "",
    smallImageOfflineKey: "",
    smallImageOfflineUrl: "",
    checkIntervalSec: 30,

    launchOnStartup: false,
    minimizeToTray: true,
    startMinimized: false,
    autoStartPresence: false,
    autoCheckForUpdates: DEFAULT_AUTO_CHECK_FOR_UPDATES,
    showPreview: true,
    useDefaultStreamStatusImage: true,

    language: DEFAULT_LANGUAGE,
    activityLanguage: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    accentColor: DEFAULT_ACCENT_COLOR,
    uiZoom: DEFAULT_UI_ZOOM,

    presets: {}
  }
});

let mainWindow = null;
let tray = null;
let service = null;
let previewResolver = null;
let presenceStartedAt = null;
let isQuitting = false;
let updaterInitialized = false;
let updaterState = {
  status: "idle",
  version: packageJson.version,
  packaged: app.isPackaged,
  info: null,
  progress: null,
  error: ""
};
let pendingAppDataImport = null;

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function getBuiltInLanguagesDir() {
  const devPath = path.join(__dirname, "languages");
  const prodPath = path.join(process.resourcesPath, "languages");
  return fs.existsSync(prodPath) ? prodPath : devPath;
}

function getLanguageFilePath(lang) {
  const safeLang = String(lang || "").trim().toLowerCase() || DEFAULT_LANGUAGE;
  return path.join(getBuiltInLanguagesDir(), `${safeLang}.json`);
}

function loadLocaleFile(lang) {
  const base = readJsonSafe(getLanguageFilePath(DEFAULT_LANGUAGE)) || {};
  const selected = readJsonSafe(getLanguageFilePath(lang)) || {};
  return { ...base, ...selected };
}

function getAvailableLanguages() {
  const dir = getBuiltInLanguagesDir();
  if (!fs.existsSync(dir)) return [];

  const found = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".json")) continue;

    const langCode = path.basename(file.name, ".json").toLowerCase();
    const fullPath = path.join(dir, file.name);
    const json = readJsonSafe(fullPath);
    if (!json) continue;

    found.push({
      code: langCode,
      name: json["meta.languageName"] || langCode,
      nativeName: json["meta.nativeName"] || json["meta.languageName"] || langCode
    });
  }

  return found.sort((a, b) => a.nativeName.localeCompare(b.nativeName));
}

function normalizeLanguageCode(lang, fallback = DEFAULT_LANGUAGE) {
  return String(lang || fallback).trim().toLowerCase() || DEFAULT_LANGUAGE;
}

function normalizeActivityLanguageSetting(lang, fallback = DEFAULT_LANGUAGE) {
  const safeLang = String(lang || fallback).trim().toLowerCase() || DEFAULT_LANGUAGE;
  return safeLang === "app" ? "app" : normalizeLanguageCode(safeLang, fallback);
}

function normalizeActivitySource(source, fallback = "twitch") {
  const safeSource = String(source || fallback).trim().toLowerCase();
  return ["twitch", "youtube", "custom"].includes(safeSource) ? safeSource : fallback;
}

function normalizeTwitchApiMode(mode, fallback = DEFAULT_TWITCH_API_MODE) {
  const safeMode = String(mode || fallback).trim().toLowerCase();
  return safeMode === "official" ? "official" : DEFAULT_TWITCH_API_MODE;
}

function normalizeCustomStatus(status, fallback = "offline") {
  const safeStatus = String(status || fallback).trim().toLowerCase();
  return safeStatus === "live" ? "live" : "offline";
}

function getTranslations(lang = store.get("language", DEFAULT_LANGUAGE)) {
  return loadLocaleFile(normalizeLanguageCode(lang));
}

function buildPresenceConfig(config = {}) {
  const uiLanguage = normalizeLanguageCode(
    config.language,
    store.get("language", DEFAULT_LANGUAGE)
  );
  const activityLanguageSetting = normalizeActivityLanguageSetting(
    config.activityLanguage,
    store.get("activityLanguage", DEFAULT_LANGUAGE)
  );
  const activityLanguage = activityLanguageSetting === "app"
    ? uiLanguage
    : normalizeLanguageCode(activityLanguageSetting, uiLanguage);

  return {
    ...config,
    activitySource: normalizeActivitySource(config.activitySource, store.get("activitySource", "twitch")),
    twitchApiMode: normalizeTwitchApiMode(config.twitchApiMode, store.get("twitchApiMode", DEFAULT_TWITCH_API_MODE)),
    customStatus: normalizeCustomStatus(config.customStatus, store.get("customStatus", "offline")),
    language: uiLanguage,
    i18n: getTranslations(uiLanguage),
    activityLanguage,
    activityLanguageSetting,
    activityI18n: getTranslations(activityLanguage)
  };
}

function t(key, fallback = key) {
  const tr = getTranslations();
  return tr[key] || fallback;
}

function getAssetPath(filename) {
  return path.join(__dirname, "assets", filename);
}

function getMainIconPath() {
  return getAssetPath("icon.ico");
}

function getTrayIconPath(state = "idle") {
  const map = {
    idle: "tray-idle.ico",
    live: "tray-live.ico",
    offline: "tray-offline.ico",
    error: "tray-error.ico"
  };
  return getAssetPath(map[state] || map.idle);
}

function rebuildTrayMenu() {
  if (!tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label: t("tray.showWindow", "Show window"),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: t("tray.reloadApp", "Reload app"),
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }
    },
    {
      label: t("tray.checkForUpdates", "Check for updates"),
      click: async () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        await checkForUpdates({ silent: false });
      }
    },
    {
      label: t("tray.startPresence", "Start Presence"),
      click: async () => {
        try {
          if (service) {
            sendLog(t("log.alreadyRunning", "Presence is already running."));
            return;
          }
          await startPresenceInternal(store.store);
          sendLog(t("log.startedFromTray", "Presence started from tray."));
        } catch (err) {
          sendLog(`${t("log.trayStartError", "Tray start error")}: ${err.message}`);
        }
      }
    },
    {
      label: t("tray.stopPresence", "Stop Presence"),
      click: async () => {
        try {
          await stopPresenceInternal();
          sendLog(t("log.stoppedFromTray", "Presence stopped from tray."));
        } catch (err) {
          sendLog(`${t("log.trayStopError", "Tray stop error")}: ${err.message}`);
        }
      }
    },
    { type: "separator" },
    {
      label: t("tray.quit", "Quit"),
      click: async () => {
        isQuitting = true;
        if (service) {
          await service.stop().catch(() => {});
          service = null;
        }
        app.exit(0);
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function setTrayState(state = "idle") {
  if (!tray) return;

  try {
    tray.setImage(nativeImage.createFromPath(getTrayIconPath(state)));
    tray.setToolTip(`${APP_DISPLAY_NAME} - ${t(`tray.state.${state}`, state)}`);
    rebuildTrayMenu();
  } catch (err) {
    console.error("Tray icon update failed:", err);
  }
}

function sendLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("presence:log", message);
  }
}

function sendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("presence:status", status);
  }

  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("live")) return setTrayState("live");
  if (normalized.includes("offline")) return setTrayState("offline");
  if (normalized.includes("error") || normalized.includes("fehler")) return setTrayState("error");
  setTrayState("idle");
}

function normalizeUpdateInfo(info) {
  if (!info) return null;

  return {
    version: info.version || "",
    releaseName: info.releaseName || "",
    releaseDate: info.releaseDate || "",
    releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
    stagingPercentage: info.stagingPercentage || null
  };
}

function normalizeUpdateProgress(progress) {
  if (!progress) return null;

  return {
    percent: Number(progress.percent || 0),
    bytesPerSecond: Number(progress.bytesPerSecond || 0),
    transferred: Number(progress.transferred || 0),
    total: Number(progress.total || 0)
  };
}

function getUpdateErrorMessage(err) {
  const raw = String(err?.message || err || "update_error");

  if (/latest\.ya?ml/i.test(raw) && /404|Cannot find/i.test(raw)) {
    return t("log.updateMetadataMissing", "No update metadata found in the latest GitHub release.");
  }

  if (/Unable to find latest version|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|406/.test(raw)) {
    return t("log.updateReleaseMissing", "No readable production release was found on GitHub.");
  }

  return raw.split(/\r?\n/)[0].slice(0, 240);
}

function emitUpdaterState(status, data = {}) {
  updaterState = {
    ...updaterState,
    ...data,
    status,
    version: packageJson.version,
    packaged: app.isPackaged
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", updaterState);
  }

  return updaterState;
}

function setupAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    emitUpdaterState("checking", { error: "", progress: null });
  });

  autoUpdater.on("update-available", (info) => {
    emitUpdaterState("available", {
      info: normalizeUpdateInfo(info),
      progress: null,
      error: ""
    });
    sendLog(t("log.updateAvailable", "Update available."));
  });

  autoUpdater.on("update-not-available", (info) => {
    emitUpdaterState("not-available", {
      info: normalizeUpdateInfo(info),
      progress: null,
      error: ""
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitUpdaterState("downloading", {
      progress: normalizeUpdateProgress(progress),
      error: ""
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    emitUpdaterState("downloaded", {
      info: normalizeUpdateInfo(info),
      progress: null,
      error: ""
    });
    sendLog(t("log.updateDownloaded", "Update downloaded. Restart to install."));
  });

  autoUpdater.on("error", (err) => {
    const message = getUpdateErrorMessage(err);
    emitUpdaterState("error", { error: message, progress: null });
    sendLog(`${t("log.updateError", "Update error")}: ${message}`);
  });
}

async function checkForUpdates(options = {}) {
  const silent = !!options.silent;
  setupAutoUpdater();

  if (!app.isPackaged) {
    const state = emitUpdaterState("unavailable-dev", {
      info: null,
      progress: null,
      error: "updates_unavailable_in_dev"
    });
    if (!silent) sendLog(t("log.updateUnavailableDev", "Updates are only available in the installed app."));
    return { ok: false, error: "updates_unavailable_in_dev", state };
  }

  try {
    if (!silent) sendLog(t("log.updateChecking", "Checking for updates ..."));
    const result = await autoUpdater.checkForUpdates();
    return {
      ok: true,
      state: updaterState,
      info: normalizeUpdateInfo(result?.updateInfo)
    };
  } catch (err) {
    const message = getUpdateErrorMessage(err);
    const state = emitUpdaterState("error", { error: message, progress: null });
    return { ok: false, error: message, state };
  }
}

async function downloadUpdate() {
  setupAutoUpdater();

  if (!app.isPackaged) {
    const state = emitUpdaterState("unavailable-dev", {
      info: null,
      progress: null,
      error: "updates_unavailable_in_dev"
    });
    return { ok: false, error: "updates_unavailable_in_dev", state };
  }

  if (updaterState.status !== "available") {
    return { ok: false, error: "no_update_available", state: updaterState };
  }

  try {
    sendLog(t("log.updateDownloading", "Downloading update ..."));
    const paths = await autoUpdater.downloadUpdate();
    return { ok: true, paths, state: updaterState };
  } catch (err) {
    const message = getUpdateErrorMessage(err);
    const state = emitUpdaterState("error", { error: message, progress: null });
    return { ok: false, error: message, state };
  }
}

function installDownloadedUpdate() {
  setupAutoUpdater();

  if (!app.isPackaged) {
    const state = emitUpdaterState("unavailable-dev", {
      info: null,
      progress: null,
      error: "updates_unavailable_in_dev"
    });
    return { ok: false, error: "updates_unavailable_in_dev", state };
  }

  if (updaterState.status !== "downloaded") {
    return { ok: false, error: "update_not_downloaded", state: updaterState };
  }

  emitUpdaterState("installing", { error: "", progress: null });
  isQuitting = true;
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true, state: updaterState };
}

function sendWindowState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("window:maximized", mainWindow.isMaximized());
  }
}

function createWindow() {
  const settings = store.store;

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 1080,
    minHeight: 760,
    show: !settings.startMinimized,
    icon: getMainIconPath(),
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: settings.theme === "light" ? "#f2f3f5" : "#2b2d31",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
  Menu.setApplicationMenu(null);

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("app:title", APP_DISPLAY_NAME);
    mainWindow.webContents.send("updater:status", updaterState);
    sendWindowState();
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;

    if (store.get("minimizeToTray")) {
      event.preventDefault();
      mainWindow.hide();
      sendLog(t("log.minimizedToTray", "Window minimized to tray."));
    }
  });

  mainWindow.on("maximize", sendWindowState);
  mainWindow.on("unmaximize", sendWindowState);

  if (settings.startMinimized) {
    mainWindow.hide();
  }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(getTrayIconPath("idle")));

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  rebuildTrayMenu();
  setTrayState("idle");
}

function applyAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: !!enabled,
    path: process.execPath
  });
}

function collectValidationErrors(config, options = {}) {
  const errors = {};
  const sourceType = normalizeActivitySource(config.activitySource, store.get("activitySource", "twitch"));
  const includeInterval = options.includeInterval !== false;

  if (!String(config.discordAppClientId || "").trim()) errors.discordAppClientId = "required";

  if (sourceType === "youtube") {
    if (!String(config.youtubeApiKey || "").trim()) errors.youtubeApiKey = "required";
    if (!String(config.youtubeChannel || "").trim()) errors.youtubeChannel = "required";
  } else if (sourceType === "custom") {
    if (!String(config.customDisplayName || "").trim()) errors.customDisplayName = "required";
  } else {
    if (!String(config.streamerLogin || "").trim()) errors.streamerLogin = "required";

    if (normalizeTwitchApiMode(config.twitchApiMode, store.get("twitchApiMode", DEFAULT_TWITCH_API_MODE)) === "official") {
      if (!String(config.twitchClientId || "").trim()) errors.twitchClientId = "required";
      if (!String(config.twitchClientSecret || "").trim()) errors.twitchClientSecret = "required";
    }
  }

  if (includeInterval) {
    const interval = Number(config.checkIntervalSec);
    if (!Number.isFinite(interval) || interval < 5) errors.checkIntervalSec = "min5";
  }

  const urlFields = [
    "discordInviteUrl",
    "largeImageUrl",
    "smallImageLiveUrl",
    "smallImageOfflineUrl",
    "customStreamUrl",
    "customLargeImageUrl",
    "customSmallImageUrl",
    "customButtonTwoUrl"
  ];

  for (const field of urlFields) {
    if (config[field] && !/^https?:\/\//i.test(String(config[field]).trim())) {
      errors[field] = "url";
    }
  }

  const dateFields = ["customTimestampStart", "customTimestampEnd"];
  for (const field of dateFields) {
    if (config[field] && !Number.isFinite(Date.parse(String(config[field]).trim()))) {
      errors[field] = "datetime";
    }
  }

  return errors;
}

function validateConfig(config) {
  const errors = collectValidationErrors(config, { includeInterval: true });
  return { ok: Object.keys(errors).length === 0, errors };
}

function validatePresetPayload(payload) {
  const errors = collectValidationErrors(payload, { includeInterval: false });
  return { ok: Object.keys(errors).length === 0, errors };
}

function getPresetPayload(input) {
  const payload = {};
  for (const field of PRESET_FIELDS) {
    payload[field] = typeof input[field] === "undefined" ? store.get(field) : input[field];
  }
  return payload;
}

function getPresets() {
  return store.get("presets", {});
}

function savePreset(name, data, previousName = "") {
  const cleanName = String(name || "").trim();
  const cleanPreviousName = String(previousName || "").trim();
  if (!cleanName) throw new Error("preset_name_required");

  const payload = getPresetPayload(data);
  const validation = validatePresetPayload(payload);
  if (!validation.ok) {
    const error = new Error("preset_validation_failed");
    error.validation = validation;
    throw error;
  }

  const presets = getPresets();

  if (
    cleanPreviousName &&
    cleanPreviousName !== cleanName &&
    Object.prototype.hasOwnProperty.call(presets, cleanName)
  ) {
    throw new Error("preset_name_exists");
  }

  if (cleanPreviousName && Object.prototype.hasOwnProperty.call(presets, cleanPreviousName)) {
    const updatedPresets = {};
    let replaced = false;

    for (const [presetName, presetData] of Object.entries(presets)) {
      if (presetName === cleanPreviousName) {
        updatedPresets[cleanName] = payload;
        replaced = true;
      } else {
        updatedPresets[presetName] = presetData;
      }
    }

    if (!replaced) {
      updatedPresets[cleanName] = payload;
    }

    store.set("presets", updatedPresets);
    return updatedPresets[cleanName];
  }

  presets[cleanName] = payload;
  store.set("presets", presets);
  return presets[cleanName];
}

function loadPreset(name) {
  const presets = getPresets();
  const preset = presets[name];
  if (!preset) throw new Error("preset_not_found");
  return preset;
}

function deletePreset(name) {
  const presets = getPresets();
  if (!presets[name]) throw new Error("preset_not_found");
  delete presets[name];
  store.set("presets", presets);
}

function sanitizeFileName(value, fallback = "activity-presence-manager") {
  const safeValue = String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return safeValue || fallback;
}

function createApmPayload(kind, data, name = "") {
  const payload = {
    format: APM_FORMAT_ID,
    version: APM_FORMAT_VERSION,
    kind,
    app: APP_DISPLAY_NAME,
    exportedAt: new Date().toISOString(),
    data
  };

  if (name) payload.name = String(name).trim();
  return payload;
}

function parseApmPayload(raw) {
  const parsed = JSON.parse(String(raw || ""));

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    parsed.format === APM_FORMAT_ID &&
    typeof parsed.kind === "string" &&
    parsed.data &&
    typeof parsed.data === "object" &&
    !Array.isArray(parsed.data)
  ) {
    return parsed;
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      format: APM_FORMAT_ID,
      version: APM_FORMAT_VERSION,
      kind: parsed.presets ? "app" : "preset",
      app: APP_DISPLAY_NAME,
      exportedAt: new Date().toISOString(),
      name: parsed.name || "",
      data: parsed
    };
  }

  throw new Error("invalid_apm_file");
}

function normalizeImportedAppData(data) {
  const merged = {
    ...store.store,
    ...data
  };
  const presetMerge = mergeImportedPresets(data?.presets, getPresets());

  merged.presets = presetMerge.presets;

  return {
    data: merged,
    importedPresetCount: presetMerge.importedPresetCount,
    renamedPresets: presetMerge.renamedPresets,
    importedPresetNames: presetMerge.importedPresetNames
  };
}

function serializeForCompare(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createAppDataImportToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getImportedSettingKeys(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.keys(data).filter((key) => key !== "presets");
}

function createAppDataImportPreview(filePath, rawData, imported, validation) {
  const importedSettingKeys = getImportedSettingKeys(rawData);
  const changedSettingKeys = importedSettingKeys.filter(
    (key) => serializeForCompare(store.get(key)) !== serializeForCompare(rawData[key])
  );
  const existingPresetCount = Object.keys(getPresets()).length;
  const finalPresetCount = Object.keys(imported.data.presets || {}).length;
  const validationErrors = validation?.errors || {};

  return {
    fileName: path.basename(filePath),
    settingsImportedCount: importedSettingKeys.length,
    settingsChangedCount: changedSettingKeys.length,
    settingsUnchangedCount: Math.max(0, importedSettingKeys.length - changedSettingKeys.length),
    importedPresetCount: imported.importedPresetCount,
    importedPresetNames: imported.importedPresetNames,
    renamedPresetCount: imported.renamedPresets.length,
    renamedPresets: imported.renamedPresets,
    existingPresetCount,
    finalPresetCount,
    validationOk: validation.ok,
    validationErrorCount: Object.keys(validationErrors).length
  };
}

function resolveUniquePresetName(baseName, presets = getPresets()) {
  const safeBase = sanitizeFileName(
    baseName,
    t("preset.importedFallbackName", "Imported preset")
  );

  if (!Object.prototype.hasOwnProperty.call(presets, safeBase)) {
    return safeBase;
  }

  let index = 2;
  let candidate = `${safeBase} (${index})`;

  while (Object.prototype.hasOwnProperty.call(presets, candidate)) {
    index += 1;
    candidate = `${safeBase} (${index})`;
  }

  return candidate;
}

function resolveImportedPresetName(baseName) {
  return resolveUniquePresetName(baseName, getPresets());
}

function mergeImportedPresets(importedPresets, existingPresets = getPresets()) {
  const mergedPresets = { ...existingPresets };
  const renamedPresets = [];
  const importedPresetNames = [];
  let importedPresetCount = 0;

  if (!importedPresets || typeof importedPresets !== "object" || Array.isArray(importedPresets)) {
    return { presets: mergedPresets, importedPresetCount, renamedPresets, importedPresetNames };
  }

  for (const [importedName, importedPreset] of Object.entries(importedPresets)) {
    if (!importedPreset || typeof importedPreset !== "object" || Array.isArray(importedPreset)) continue;

    const safeName = sanitizeFileName(
      importedName,
      t("preset.importedFallbackName", "Imported preset")
    );
    const finalName = resolveUniquePresetName(safeName, mergedPresets);

    mergedPresets[finalName] = importedPreset;
    importedPresetCount += 1;
    importedPresetNames.push(finalName);

    if (finalName !== safeName) {
      renamedPresets.push({ from: safeName, to: finalName });
    }
  }

  return { presets: mergedPresets, importedPresetCount, renamedPresets, importedPresetNames };
}

function reorderPresets(names) {
  const presets = getPresets();
  const requestedNames = Array.isArray(names) ? names : [];
  const reordered = {};
  const seen = new Set();

  for (const name of requestedNames) {
    if (!Object.prototype.hasOwnProperty.call(presets, name) || seen.has(name)) continue;
    reordered[name] = presets[name];
    seen.add(name);
  }

  for (const [name, preset] of Object.entries(presets)) {
    if (seen.has(name)) continue;
    reordered[name] = preset;
  }

  store.set("presets", reordered);
  return reordered;
}

function getPreviewResolver(config) {
  const nextConfig = buildPresenceConfig(config);

  if (!previewResolver) {
    previewResolver = new PresenceService({
      config: nextConfig,
      onLog: () => {},
      onStatus: () => {}
    });
  } else {
    previewResolver.applyConfig(nextConfig);
  }

  return previewResolver;
}

async function resolvePreviewData(config) {
  return getPreviewResolver({
    ...config,
    activityStartedAt: presenceStartedAt
  }).resolvePreviewData();
}

async function startPresenceInternal(config) {
  const validation = validateConfig(config);
  if (!validation.ok) {
    const err = new Error("validation_failed");
    err.validation = validation;
    throw err;
  }

  if (service) {
    await service.stop();
    service = null;
    presenceStartedAt = null;
  }

  service = new PresenceService({
    config: buildPresenceConfig(config),
    onLog: sendLog,
    onStatus: sendStatus
  });

  try {
    await service.start();
    presenceStartedAt = new Date().toISOString();
    return presenceStartedAt;
  } catch (err) {
    service = null;
    presenceStartedAt = null;
    throw err;
  }
}

async function stopPresenceInternal() {
  if (service) {
    await service.stop();
    service = null;
  }
  presenceStartedAt = null;
  sendStatus(t("status.stopped", "Stopped"));
}

async function exportAppDataToFile() {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t("dialog.exportAllTitle", "Export settings and presets"),
    defaultPath: `activity-presence-manager.${APM_FILE_EXTENSION}`,
    filters: [{ name: "APM", extensions: [APM_FILE_EXTENSION] }]
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  const payload = createApmPayload("app", store.store);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return { ok: true, filePath };
}

async function prepareAppDataImportFromFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: t("dialog.importAllTitle", "Import settings and presets"),
    properties: ["openFile"],
    filters: [{ name: "APM", extensions: [APM_FILE_EXTENSION] }]
  });

  if (canceled || !filePaths?.length) return { ok: false, canceled: true };

  const raw = fs.readFileSync(filePaths[0], "utf8");
  const payload = parseApmPayload(raw);
  if (payload.kind !== "app") {
    throw new Error("invalid_apm_app_file");
  }

  const imported = normalizeImportedAppData(payload.data);
  const data = imported.data;
  const validation = validateConfig(data);
  const token = createAppDataImportToken();
  const preview = createAppDataImportPreview(filePaths[0], payload.data, imported, validation);

  pendingAppDataImport = {
    token,
    imported,
    validation,
    preview
  };

  return {
    ok: true,
    token,
    preview
  };
}

async function applyPreparedAppDataImport(token) {
  if (!pendingAppDataImport || pendingAppDataImport.token !== token) {
    throw new Error("app_data_import_not_prepared");
  }

  const { imported, validation } = pendingAppDataImport;
  const data = imported.data;
  store.set(data);
  applyAutostart(!!data.launchOnStartup);
  rebuildTrayMenu();
  pendingAppDataImport = null;

  if (service && validation.ok) {
    service.applyConfig(buildPresenceConfig(data));

    try {
      await service.refreshActivity();
    } catch (err) {
      sendLog(`Presence refresh error: ${err.message}`);
    }
  }

  return {
    ok: true,
    data: store.store,
    validation,
    importedPresetCount: imported.importedPresetCount,
    renamedPresets: imported.renamedPresets,
    importedPresetNames: imported.importedPresetNames
  };
}

function cancelPreparedAppDataImport(token) {
  if (!token || pendingAppDataImport?.token === token) {
    pendingAppDataImport = null;
  }
  return { ok: true };
}

async function exportPresetToFile(name, data) {
  const presetName = String(name || "").trim() || "preset";
  const payload = getPresetPayload(data || {});
  const validation = validatePresetPayload(payload);

  if (!validation.ok) {
    const error = new Error("preset_validation_failed");
    error.validation = validation;
    throw error;
  }

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: t("dialog.exportPresetTitle", "Export preset"),
    defaultPath: `${sanitizeFileName(presetName, "preset")}.${APM_FILE_EXTENSION}`,
    filters: [{ name: "APM", extensions: [APM_FILE_EXTENSION] }]
  });

  if (canceled || !filePath) return { ok: false, canceled: true };

  const filePayload = createApmPayload("preset", payload, presetName);
  fs.writeFileSync(filePath, JSON.stringify(filePayload, null, 2), "utf8");
  return { ok: true, filePath, name: presetName };
}

async function importPresetFromFile() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: t("dialog.importPresetTitle", "Import preset"),
    properties: ["openFile"],
    filters: [{ name: "APM", extensions: [APM_FILE_EXTENSION] }]
  });

  if (canceled || !filePaths?.length) return { ok: false, canceled: true };

  const raw = fs.readFileSync(filePaths[0], "utf8");
  const payload = parseApmPayload(raw);
  if (payload.kind !== "preset") {
    throw new Error("invalid_apm_preset_file");
  }

  const importedPreset = getPresetPayload(payload.data || {});
  const validation = validatePresetPayload(importedPreset);
  if (!validation.ok) {
    const error = new Error("preset_validation_failed");
    error.validation = validation;
    throw error;
  }

  const importedName = resolveImportedPresetName(
    payload.name || path.basename(filePaths[0], path.extname(filePaths[0]))
  );
  const savedPreset = savePreset(importedName, importedPreset);
  return {
    ok: true,
    name: importedName,
    preset: savedPreset,
    presets: getPresets()
  };
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  applyAutostart(store.get("launchOnStartup"));
  rebuildTrayMenu();
  setupAutoUpdater();

  ipcMain.handle("settings:get", () => store.store);
  ipcMain.handle("settings:save", async (_, data) => {
    const validation = validateConfig(data);

    store.set(data);
    applyAutostart(!!data.launchOnStartup);

    if (service && validation.ok) {
      service.applyConfig(buildPresenceConfig(data));

      try {
        await service.refreshActivity();
      } catch (err) {
        sendLog(`Presence refresh error: ${err.message}`);
      }
    }

    return {
      ok: true,
      validation,
      presenceUpdated: !!service && validation.ok
    };
  });
  ipcMain.handle("settings:validate", (_, data) => validateConfig(data));

  ipcMain.handle("settings:test", async (_, inputConfig) => {
    try {
      const config = { ...store.store, ...inputConfig };
      const validation = validateConfig(config);

      if (!validation.ok) {
        return { ok: false, validation, error: "validation_failed" };
      }

      const tempService = new PresenceService({
        config: buildPresenceConfig(config),
        onLog: sendLog,
        onStatus: sendStatus
      });

      const result = await tempService.testConnections();
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  const handleAppDataImportPreview = async () => {
    try {
      return await prepareAppDataImportFromFile();
    } catch (err) {
      return {
        ok: false,
        error: err.message || "app_data_import_failed"
      };
    }
  };

  ipcMain.handle("settings:export", async () => exportAppDataToFile());
  ipcMain.handle("settings:import", handleAppDataImportPreview);
  ipcMain.handle("settings:importPreview", handleAppDataImportPreview);
  ipcMain.handle("settings:importApply", async (_, token) => {
    try {
      return await applyPreparedAppDataImport(token);
    } catch (err) {
      return {
        ok: false,
        error: err.message || "app_data_import_failed"
      };
    }
  });
  ipcMain.handle("settings:importCancel", (_, token) => cancelPreparedAppDataImport(token));

  ipcMain.handle("presets:get", () => getPresets());
  ipcMain.handle("presets:validate", (_, data) => validatePresetPayload(data));
  ipcMain.handle("presets:save", (_, name, data, previousName) => {
    try {
      const preset = savePreset(name, data, previousName);
      return { ok: true, preset, presets: getPresets() };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        validation: err.validation || null,
        presets: getPresets()
      };
    }
  });
  ipcMain.handle("presets:load", (_, name) => {
    return { ok: true, preset: loadPreset(name) };
  });
  ipcMain.handle("presets:delete", (_, name) => {
    deletePreset(name);
    return { ok: true, presets: getPresets() };
  });
  ipcMain.handle("presets:export", async (_, name, data) => {
    try {
      return await exportPresetToFile(name, data);
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        validation: err.validation || null
      };
    }
  });
  ipcMain.handle("presets:import", async () => {
    try {
      return await importPresetFromFile();
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        validation: err.validation || null
      };
    }
  });
  ipcMain.handle("presets:reorder", (_, names) => {
    return { ok: true, presets: reorderPresets(names) };
  });

  ipcMain.handle("i18n:getLanguage", () => store.get("language", DEFAULT_LANGUAGE));
  ipcMain.handle("i18n:setLanguage", (_, lang) => {
    store.set("language", lang);
    rebuildTrayMenu();
    return { ok: true };
  });
  ipcMain.handle("i18n:getTranslations", () => getTranslations());
  ipcMain.handle("i18n:getTranslationsFor", (_, lang) => {
    const resolvedLang = normalizeActivityLanguageSetting(
      lang,
      store.get("activityLanguage", store.get("language", DEFAULT_LANGUAGE))
    );
    return getTranslations(
      resolvedLang === "app"
        ? store.get("language", DEFAULT_LANGUAGE)
        : resolvedLang
    );
  });
  ipcMain.handle("i18n:getLanguages", () => getAvailableLanguages());

  ipcMain.handle("preview:resolve", async (_, inputConfig) => {
    try {
      const config = { ...store.store, ...inputConfig };
      return await resolvePreviewData(config);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("presence:start", async (_, inputConfig) => {
    try {
      const config = { ...store.store, ...inputConfig };
      const startedAt = await startPresenceInternal(config);
      return { ok: true, startedAt };
    } catch (err) {
      if (err.validation) {
        return { ok: false, error: err.message, validation: err.validation };
      }

      sendLog(`${t("log.startError", "Start error")}: ${err.message}`);
      sendStatus(t("status.error", "Error"));
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("presence:stop", async () => {
    try {
      await stopPresenceInternal();
      sendLog(t("log.presenceStopped", "Presence stopped."));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle("presence:isRunning", () => ({ running: !!service, startedAt: presenceStartedAt }));

  ipcMain.handle("updater:getState", () => updaterState);
  ipcMain.handle("updater:check", (_, options) => checkForUpdates(options || {}));
  ipcMain.handle("updater:download", () => downloadUpdate());
  ipcMain.handle("updater:install", () => installDownloadedUpdate());

  ipcMain.handle("window:reload", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  ipcMain.handle("window:minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.handle("window:toggleMaximize", () => {
    if (!mainWindow) return { maximized: false };
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
    return { maximized: mainWindow.isMaximized() };
  });

  ipcMain.handle("window:close", async () => {
    if (store.get("minimizeToTray") && mainWindow) {
      mainWindow.hide();
      sendLog(t("log.minimizedToTray", "Window minimized to tray."));
      return { minimizedToTray: true };
    }

    isQuitting = true;
    if (service) {
      await service.stop().catch(() => {});
      service = null;
    }
    app.exit(0);
    return { minimizedToTray: false };
  });

  ipcMain.handle("window:isMaximized", () => {
    return { maximized: !!mainWindow?.isMaximized() };
  });

  ipcMain.handle("shell:openExternal", async (_, url) => {
    const target = String(url || "").trim();
    if (!/^https?:\/\//i.test(target)) {
      return { ok: false, error: "invalid_url" };
    }

    await shell.openExternal(target);
    return { ok: true };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (store.get("autoStartPresence")) {
    try {
      await startPresenceInternal(store.store);
      sendLog(t("log.autoStarted", "Presence started automatically."));
    } catch (err) {
      sendLog(`${t("log.autoStartFailed", "Auto-start failed")}: ${err.message}`);
      sendStatus(t("status.error", "Error"));
    }
  }

  if (store.get("autoCheckForUpdates", DEFAULT_AUTO_CHECK_FOR_UPDATES)) {
    setTimeout(() => {
      checkForUpdates({ silent: true }).catch(() => {});
    }, 4000);
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Tray-App: nicht automatisch beenden
});
