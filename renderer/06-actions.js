// App actions and initialization helpers.
// Split from the former renderer.js monolith.
async function loadActivityTranslations(langSetting = getSelectedActivityLanguageSetting()) {
  currentActivityLanguageSetting = String(langSetting || "en").trim().toLowerCase() || "en";
  currentActivityLanguageCode = getResolvedActivityLanguageCode(currentActivityLanguageSetting);

  if (currentActivityLanguageCode === currentLanguage) {
    activityTranslations = { ...translations };
    return activityTranslations;
  }

  activityTranslations = await window.appApi.getTranslationsForLanguage(currentActivityLanguageCode);
  return activityTranslations;
}

function setButtonContent(id, label, iconPath = "") {
  const node = el(id);
  if (!node) return;

  node.textContent = "";

  if (iconPath) {
    const icon = document.createElement("img");
    icon.className = "action-icon";
    icon.src = iconPath;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    node.appendChild(icon);
  }

  const text = document.createElement("span");
  text.textContent = label;
  node.appendChild(text);
}

function formatText(template, replacements = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => {
    const value = replacements[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUpdaterStatus(state = currentUpdaterState) {
  const status = state?.status || "idle";
  const version = state?.version || "";
  const updateVersion = state?.info?.version || "";
  const percent = Math.round(Number(state?.progress?.percent || 0));

  const replacements = { version, updateVersion, percent };
  const messages = {
    idle: ["update.status.idle", "Current version: {version}"],
    checking: ["update.status.checking", "Checking for updates ..."],
    available: ["update.status.available", "Update {updateVersion} is available."],
    "not-available": ["update.status.notAvailable", "Current version {version} is up to date."],
    downloading: ["update.status.downloading", "Downloading update ... {percent}%"],
    downloaded: ["update.status.downloaded", "Update {updateVersion} is ready to install."],
    installing: ["update.status.installing", "Installing update ..."],
    error: ["update.status.error", "Update error: {error}"],
    "unavailable-dev": ["update.status.unavailableDev", "Updates are only available in the installed app."]
  };

  const [key, fallback] = messages[status] || messages.idle;
  return formatText(t(key, fallback), { ...replacements, error: state?.error || "unknown_error" });
}

function updateUpdaterUi(state = {}) {
  currentUpdaterState = {
    ...currentUpdaterState,
    ...state
  };

  const statusText = el("updateStatusText");
  if (statusText) statusText.textContent = formatUpdaterStatus(currentUpdaterState);

  const checkBtn = el("checkUpdatesBtn");
  const installBtn = el("installUpdateBtn");
  const titlebarUpdateBtn = el("titlebarUpdateBtn");
  const updateActionVisible = ["available", "downloading", "downloaded", "installing"].includes(currentUpdaterState.status);
  const canInstall = ["available", "downloaded"].includes(currentUpdaterState.status);
  const isBusy = ["checking", "downloading", "installing"].includes(currentUpdaterState.status);

  if (checkBtn) checkBtn.disabled = isBusy;

  if (installBtn) {
    installBtn.hidden = false;
    installBtn.disabled = !canInstall || isBusy;
  }

  if (titlebarUpdateBtn) {
    titlebarUpdateBtn.hidden = !updateActionVisible;
    titlebarUpdateBtn.disabled = !canInstall || isBusy;
  }
}

async function checkUpdates() {
  updateUpdaterUi({ status: "checking", progress: null, error: "" });
  const result = await window.appApi.checkForUpdates({ silent: false });
  if (!result.ok && result.state) {
    updateUpdaterUi(result.state);
  } else if (!result.ok) {
    updateUpdaterUi({ status: "error", error: result.error || "update_check_failed" });
  }
}

async function installAvailableUpdate() {
  if (currentUpdaterState.status === "available") {
    updateUpdaterUi({ status: "downloading", progress: { percent: 0 }, error: "" });
    const downloadResult = await window.appApi.downloadUpdate();
    if (!downloadResult.ok) {
      updateUpdaterUi(downloadResult.state || { status: "error", error: downloadResult.error || "update_download_failed" });
      return;
    }

    const start = Date.now();
    while (Date.now() - start < 30000) {
      const state = await window.appApi.getUpdaterState();
      updateUpdaterUi(state);
      if (state.status === "downloaded") break;
      if (state.status === "error") return;
      await wait(500);
    }
  }

  if (currentUpdaterState.status !== "downloaded") return;

  const installResult = await window.appApi.installUpdate();
  if (!installResult.ok) {
    updateUpdaterUi(installResult.state || { status: "error", error: installResult.error || "update_install_failed" });
  }
}

async function applyLanguage(lang, activityLanguageSetting = null) {
  const currentZoomValue = Number(el("uiZoom")?.value || pendingZoomValue || 100);
  const selectedActivityLanguage =
    activityLanguageSetting ||
    el("activityLanguage")?.value ||
    currentActivityLanguageSetting ||
    lang ||
    "en";

  currentLanguage = lang;
  await window.appApi.setLanguage(lang);
  translations = await window.appApi.getTranslations();
  await populateLanguages(lang);
  await populateActivityLanguages(selectedActivityLanguage);
  await loadActivityTranslations(selectedActivityLanguage);

  document.documentElement.lang = lang;
  applyAppTitle(appTitleFromMain);

  el("menuDashboardBtn").querySelector(".nav-text").textContent = t("menu.dashboard", "Dashboard");
  el("menuSettingsBtn").querySelector(".nav-text").textContent = t("menu.settings", "Settings");
  el("menuPresetsBtn").querySelector(".nav-text").textContent = t("menu.newPreset", "New Preset");
  el("menuHelpBtn").querySelector(".nav-text").textContent = t("menu.help", "Help");

  el("sidebarPresetsTitle").textContent = t("sidebar.savedPresets", "Saved Presets");
  el("previewSectionTitle").textContent = t("preview.sectionTitle", "Preview");
  el("previewSubtitle").textContent = "";
  el("previewOfflineLabel").textContent = t("preview.offlineState", "Offline");
  el("previewLiveLabel").textContent = t("preview.liveSwitch", "Live");

  el("settingsMainTitle").textContent = t("menu.settings", "Settings");
  el("settingsMainSubtitle").textContent = t("settings.subtitle", "Adjust appearance, behavior, and app startup options.");

  el("label_presetEditorSource").textContent = t("section.source", "Source");
  el("sectionTwitch").textContent = t("section.twitch");
  el("sectionYouTube").textContent = t("section.youtube", "YouTube");
  el("sectionCustomActivity").textContent = t("section.customActivity", "Custom Activity");
  el("sectionDiscord").textContent = t("section.discord");
  el("sectionImages").textContent = t("section.images");
  updatePresetEditorUi();
  updateStreamInfoLabels(getActivitySource());
  el("sectionImageKeys").textContent = t("section.imageKeys", "Keys");
  el("sectionImageUrls").textContent = t("section.imageUrls", "URLs");
  el("sectionControl").textContent = t("section.control");
  el("sectionAppearance").textContent = t("section.appearance");
  el("sectionPresencePreview").textContent = t("section.presencePreview", "Presence & Preview");
  el("sectionAppBehavior").textContent = t("section.appBehavior", "App behavior");
  el("sectionUpdatesData").textContent = t("section.updatesData", "Updates & data");
  el("sectionPresets").textContent = t("section.newPreset", "New Preset");
  el("newPresetSubtitle").textContent = t("newPreset.subtitle", "Create a new preset and then fill in Twitch, Discord, and Images in the next step.");
  el("sectionHelp").textContent = t("section.help");
  renderHelpContent();

  el("label_presetSelect").textContent = t("field.presetSelect");
  el("label_presetName").textContent = t("field.presetName");
  el("label_presetEditorName").textContent = t("field.presetName");

  el("sourceModeTitleTwitch").textContent = t("source.optionTwitch", "Twitch stream");
  el("sourceModeTitleYouTube").textContent = t("source.optionYouTube", "YouTube stream");
  el("sourceModeTitleCustom").textContent = t("source.optionCustom", "Custom Activity");
  el("sourceModeDescTwitch").textContent = t("source.cardTwitchDesc", "Automatic stream monitoring through the Twitch API.");
  el("sourceModeDescYouTube").textContent = t("source.cardYouTubeDesc", "Automatic live detection through the YouTube Data API.");
  el("sourceModeDescCustom").textContent = t("source.cardCustomDesc", "Free Discord Rich Presence with activity type, timestamps, images, and buttons.");
  el("label_twitchApiMode").textContent = t("field.twitchApiMode", "Twitch API mode");
  el("twitchApiModeManagedTitle").textContent = t("twitchApiMode.managedTitle", "Managed API");
  el("twitchApiModeManagedDesc").textContent = t("twitchApiMode.managedDesc", "Uses the built-in Twitch status API. No Twitch app setup needed.");
  el("twitchApiModeOfficialTitle").textContent = t("twitchApiMode.officialTitle", "Own Twitch app");
  el("twitchApiModeOfficialDesc").textContent = t("twitchApiMode.officialDesc", "Use your own Twitch Client ID and Client Secret.");
  el("twitchApiModeHint").textContent = t("hint.twitchApiMode", "Managed API is recommended unless you want to use your own Twitch developer app.");
  el("label_twitchClientId").textContent = t("field.twitchClientId");
  el("label_twitchClientSecret").textContent = t("field.twitchClientSecret");
  el("label_streamerLogin").textContent = t("field.streamerLogin");
  el("label_youtubeApiKey").textContent = t("field.youtubeApiKey", "YouTube API Key *");
  el("label_youtubeChannel").textContent = t("field.youtubeChannel", "YouTube Channel / Handle *");
  el("label_customDisplayName").textContent = t("field.customDisplayName", "Display Name *");
  el("label_customActivityType").textContent = t("field.customActivityType", "Activity type");
  el("option_customActivityType_playing").textContent = t("custom.activityType.playing", "Playing");
  el("option_customActivityType_listening").textContent = t("custom.activityType.listening", "Listening");
  el("option_customActivityType_watching").textContent = t("custom.activityType.watching", "Watching");
  el("option_customActivityType_competing").textContent = t("custom.activityType.competing", "Competing");
  el("option_customActivityType_playing").dataset.icon = "./assets/icons/playing.svg";
  el("option_customActivityType_listening").dataset.icon = "./assets/icons/listening.svg";
  el("option_customActivityType_watching").dataset.icon = "./assets/icons/watching.svg";
  el("option_customActivityType_competing").dataset.icon = "./assets/icons/competing.svg";
  el("label_customTitle").textContent = t("field.customTitle", "Details");
  el("label_customGame").textContent = t("field.customGame", "State");
  el("label_customTimestampMode").textContent = t("field.customTimestampMode", "Timestamp mode");
  el("option_customTimestampMode_none").textContent = t("custom.timestamp.none", "No timestamp");
  el("option_customTimestampMode_start").textContent = t("custom.timestamp.start", "Elapsed");
  el("option_customTimestampMode_end").textContent = t("custom.timestamp.end", "Countdown");
  el("option_customTimestampMode_startEnd").textContent = t("custom.timestamp.startEnd", "Start + End");
  el("option_customTimestampMode_clock").textContent = t("custom.timestamp.clock", "Current time");
  el("option_customTimestampMode_none").dataset.icon = "./assets/icons/no_timestamp.svg";
  el("option_customTimestampMode_start").dataset.icon = "./assets/icons/elapsed.svg";
  el("option_customTimestampMode_end").dataset.icon = "./assets/icons/countdown.svg";
  el("option_customTimestampMode_startEnd").dataset.icon = "./assets/icons/start_end.svg";
  el("option_customTimestampMode_clock").dataset.icon = "./assets/icons/current_time.svg";
  el("label_customTimestampStart").textContent = t("field.customTimestampStart", "Start time");
  el("label_customTimestampEnd").textContent = t("field.customTimestampEnd", "End time");
  el("sectionCustomImages").textContent = t("section.customImages", "Discord images");
  el("sectionCustomImageKeys").textContent = t("section.imageKeys", "Keys");
  el("sectionCustomImageUrls").textContent = t("section.imageUrls", "URLs");
  el("label_customLargeImageKey").textContent = t("field.customLargeImageKey", "Large Image Key");
  el("label_customLargeImageUrl").textContent = t("field.customLargeImageUrl", "Large Image URL");
  el("label_customSmallImageKey").textContent = t("field.customSmallImageKey", "Small Image Key");
  el("label_customSmallImageUrl").textContent = t("field.customSmallImageUrl", "Small Image URL");
  el("label_customLargeText").textContent = t("field.customLargeText", "Large image tooltip");
  el("label_customSmallText").textContent = t("field.customSmallText", "Small image tooltip");
  el("label_customButtonOneLabel").textContent = t("field.customButtonOneLabel", "Button 1 label");
  el("label_customStreamUrl").textContent = t("field.customStreamUrl", "Button 1 URL");
  el("label_customButtonTwoLabel").textContent = t("field.customButtonTwoLabel", "Button 2 label");
  el("label_customButtonTwoUrl").textContent = t("field.customButtonTwoUrl", "Button 2 URL");
  el("label_discordAppClientId").textContent = t("field.discordAppClientId");
  el("label_discordInviteUrl").textContent = t("field.discordInviteUrl");
  el("label_largeImageKey").textContent = t("field.largeImageKey");
  el("label_largeImageUrl").textContent = t("field.largeImageUrl");
  el("label_smallImageLiveKey").textContent = t("field.smallImageLiveKey");
  el("label_smallImageLiveUrl").textContent = t("field.smallImageLiveUrl");
  el("label_smallImageOfflineKey").textContent = t("field.smallImageOfflineKey");
  el("label_smallImageOfflineUrl").textContent = t("field.smallImageOfflineUrl");

  updateDashboardSectionEditButtons();
  renderCustomActivityTypeSelect();
  renderCustomTimestampModeSelect();

  el("label_theme").textContent = t("field.theme");
  el("desc_theme").textContent = t("desc.theme");
  el("themeDarkLabel").textContent = t("theme.dark");
  el("themeLightLabel").textContent = t("theme.light");
  el("themeSystemLabel").textContent = t("theme.system");

  el("label_language").textContent = t("field.language");
  el("desc_language").textContent = t("desc.language");

  el("label_activityLanguage").textContent = t("field.activityLanguage");
  el("desc_activityLanguage").textContent = t("desc.activityLanguage");

  el("label_appDataTransfer").textContent = t("field.appDataTransfer", "App data");
  el("desc_appDataTransfer").textContent = t("desc.appDataTransfer", "Import or export all settings and saved presets as an APM file.");

  el("label_accentColor").textContent = t("field.accentColor", "Accent color");
  el("desc_accentColor").textContent = t("desc.accentColor", "Choose the primary color for buttons, active elements, and the preview.");
  el("accentColorPickerLabel").textContent = t("field.accentColor", "Accent color");
  el("resetAccentColorBtn").setAttribute("aria-label", t("button.resetAccentColor", "Reset to blue"));
  setTooltip(el("accentColorPicker"), t("tooltip.pickAccentColor", "Choose accent color"));
  setTooltip(el("resetAccentColorBtn"), t("button.resetAccentColor", "Reset to blue"));

  el("label_uiZoom").textContent = t("field.uiZoom");
  el("desc_uiZoom").textContent = t("desc.uiZoom");
  el("zoomNote").textContent = t("zoom.note");

  el("label_checkIntervalSec").textContent = t("field.checkIntervalSec");
  el("desc_checkIntervalSec").textContent = t("desc.checkIntervalSec");
  el("intervalSuffix").textContent = t("field.secondsShort", "Sec");

  el("toggleSecretBtn").textContent =
    el("twitchClientSecret").type === "password" ? t("button.show") : t("button.hide");

  setButtonContent("saveBtn", t("button.save"), "./assets/icons/save.svg");
  setButtonContent("testBtn", t("button.test"), "./assets/icons/testing.svg");
  setButtonContent("startBtn", t("button.start"), "./assets/icons/start.svg");
  setButtonContent("stopBtn", t("button.stop"), "./assets/icons/stop.svg");
  setButtonContent("exportBtn", t("button.exportPreset", "Export preset"), "./assets/icons/export.svg");
  setButtonContent("importBtn", t("button.importPreset", "Import preset"), "./assets/icons/import.svg");
  setButtonContent("settingsImportBtn", t("button.importAll", "Import all"), "./assets/icons/import.svg");
  setButtonContent("settingsExportBtn", t("button.exportAll", "Export all"), "./assets/icons/export.svg");
  setButtonContent("checkUpdatesBtn", t("button.checkUpdates", "Check for updates"), "./assets/icons/update.svg");
  setButtonContent("installUpdateBtn", t("button.installUpdate", "Install update"), "./assets/icons/update.svg");
  setButtonContent("createPresetBtn", t("button.createPreset", "Start new preset"), "./assets/icons/new_preset.svg");
  setButtonContent("loadPresetBtn", t("button.loadPreset"));
  setButtonContent("deletePresetBtn", t("button.deletePreset"), "./assets/icons/delete.svg");
  setButtonContent("saveEditedPresetBtn", t("button.savePreset"), "./assets/icons/save.svg");
  setButtonContent("presetImportBtn", t("button.importPreset", "Import preset"), "./assets/icons/import.svg");
  setButtonContent("presetExportBtn", t("button.exportPreset", "Export preset"), "./assets/icons/export.svg");
  setButtonContent("deleteEditedPresetBtn", t("button.deletePreset"), "./assets/icons/delete.svg");
  setButtonContent("closePresetEditBtn", t("button.closePresetEdit", "Close editing"), "./assets/icons/cancel.svg");

  [
    ["menuDashboardBtn", t("menu.dashboard", "Dashboard")],
    ["menuSettingsBtn", t("menu.settings", "Settings")],
    ["menuPresetsBtn", t("menu.newPreset", "New Preset")],
    ["menuHelpBtn", t("menu.help", "Help")],
    ["saveBtn", t("button.save", "Save")],
    ["testBtn", t("button.test", "Test connection")],
    ["startBtn", t("button.start", "Start")],
    ["stopBtn", t("button.stop", "Stop")],
    ["importBtn", t("button.importPreset", "Import preset")],
    ["exportBtn", t("button.exportPreset", "Export preset")],
    ["settingsImportBtn", t("button.importAll", "Import all")],
    ["settingsExportBtn", t("button.exportAll", "Export all")],
    ["checkUpdatesBtn", t("button.checkUpdates", "Check for updates")],
    ["installUpdateBtn", t("button.installUpdate", "Install update")],
    ["titlebarUpdateBtn", t("button.installUpdate", "Install update")],
    ["createPresetBtn", t("button.createPreset", "Start new preset")],
    ["loadPresetBtn", t("button.loadPreset", "Load preset")],
    ["deletePresetBtn", t("button.deletePreset", "Delete preset")],
    ["saveEditedPresetBtn", t("button.savePreset", "Save preset")],
    ["closePresetEditBtn", t("button.closePresetEdit", "Close editing")],
    ["presetImportBtn", t("button.importPreset", "Import preset")],
    ["presetExportBtn", t("button.exportPreset", "Export preset")],
    ["deleteEditedPresetBtn", t("button.deletePreset", "Delete preset")],
    ["toggleSecretBtn", el("toggleSecretBtn").textContent || t("button.show", "Show")]
  ].forEach(([id, label]) => {
    const node = el(id);
    if (!node) return;
    setTooltip(node, label);
    node.setAttribute("aria-label", label);
  });

  el("option_showPreview").textContent = t("option.showPreview");
  el("desc_showPreview").textContent = t("desc.showPreview");
  el("option_useDefaultStreamStatusImage").textContent = t("option.useDefaultStreamStatusImage", "Use default live/offline small image");
  el("desc_useDefaultStreamStatusImage").textContent = t("desc.useDefaultStreamStatusImage", "Shows a red small image while live and a gray one while offline when no stream small image is set.");

  el("option_launchOnStartup").textContent = t("option.launchOnStartup");
  el("desc_launchOnStartup").textContent = t("desc.launchOnStartup");

  el("option_minimizeToTray").textContent = t("option.minimizeToTray");
  el("desc_minimizeToTray").textContent = t("desc.minimizeToTray");

  el("option_startMinimized").textContent = t("option.startMinimized");
  el("desc_startMinimized").textContent = t("desc.startMinimized");

  el("option_autoStartPresence").textContent = t("option.autoStartPresence");
  el("desc_autoStartPresence").textContent = t("desc.autoStartPresence");
  el("info_autoStartPresence").textContent = t("info.autoStartPresence");

  el("option_autoCheckForUpdates").textContent = t("option.autoCheckForUpdates", "Check for updates automatically");
  el("desc_autoCheckForUpdates").textContent = t("desc.autoCheckForUpdates", "Checks for app updates when the installed app starts.");
  el("label_updates").textContent = t("field.updates", "Updates");
  el("desc_updates").textContent = t("desc.updates", "Installers are delivered through GitHub Releases.");
  updateUpdaterUi(currentUpdaterState);

  el("hintDiscordRequired").textContent = t("hint.discordRequired");
  el("youtubeQuotaHint").textContent = t("hint.youtubeQuota", "YouTube live checks are throttled while offline to protect your API quota.");
  el("hintPresets").textContent = t("hint.newPreset", "Choose Twitch, YouTube, or Custom Activity and then fill in only the matching blocks.");
  el("statusLabel").textContent = t("status.label");

  pendingZoomValue = currentZoomValue;
  el("uiZoom").value = String(currentZoomValue);
  updateAccentColorDisplay(el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
  updateThemeOptionVisuals();
  updateZoomLabel(currentZoomValue);
  updateWindowButtonTitles();
  updateActivitySourceUi();

  renderPresets();
  renderLanguageCustomSelect();
  setActivePanel(activePanelName);
  renderPreview(
    previewLiveData
      ? { ...previewLiveData, live: previewAutoMode ? previewLiveData.live : (previewMode === "live") }
      : getPreviewFallbackData()
  );
  renderStreamInfo(currentStreamInfoData || getStreamInfoFallbackData());
}

async function saveSettings() {
  const data = getFormData();
  applyThemeMode(data.themeMode);

  const result = await window.appApi.saveSettings(data);
  if (result.ok) {
    showValidation(result.validation?.errors || {});
    addLog(t("log.saved"));
    setStatus(t("status.saved"));
    schedulePreviewRefresh();
  } else if (result.validation) {
    showValidation(result.validation.errors || {});
    addLog(t("log.validationFailed"));
    setStatus(t("status.error"));
  } else {
    addLog(`${t("log.testFailed", "Test failed:")} ${result.error || "settings_save_failed"}`);
    setStatus(t("status.error"));
  }
}

async function testSettings() {
  const data = getFormData();
  applyThemeMode(data.themeMode);

  const validation = await validateAndRender();
  if (!validation.ok) {
    addLog(t("log.validationFailed"));
    setStatus(t("status.error"));
    return;
  }

  await window.appApi.saveSettings(data);
  addLog(t("log.testing"));
  setStatus(t("status.testing"));

  const result = await window.appApi.testSettings(data);

  if (result.ok) {
    addLog(`${t("log.testSuccess")} ${result.result.streamerDisplayName}`);
    setStatus(t("status.testSuccess"));
    schedulePreviewRefresh();
  } else if (result.validation) {
    showValidation(result.validation.errors || {});
    addLog(t("log.validationFailed"));
    setStatus(t("status.error"));
  } else {
    addLog(`${t("log.testFailed")} ${result.error}`);
    setStatus(t("status.testFailed"));
  }
}

async function startPresence() {
  const data = getFormData();
  applyThemeMode(data.themeMode);

  const validation = await validateAndRender();
  if (!validation.ok) {
    addLog(t("log.validationFailed"));
    setStatus(t("status.error"));
    return;
  }

  await window.appApi.saveSettings(data);
  const result = await window.appApi.startPresence(data);

  if (result.ok) {
    setPreviewPresenceStartedAt(result.startedAt || new Date().toISOString());
    addLog(t("log.started"));
    setStatus(t("status.running"));
    setPreviewAutoMode(true);
    await refreshPreview();
  } else if (result.validation) {
    showValidation(result.validation.errors || {});
    addLog(t("log.validationFailed"));
    setStatus(t("status.error"));
  } else {
    addLog(`${t("log.testFailed")} ${result.error}`);
    setStatus(t("status.error"));
  }
}

async function stopPresence() {
  const result = await window.appApi.stopPresence();

  if (result.ok) {
    setPreviewPresenceStartedAt(null);
    addLog(t("log.stopped"));
    setStatus(t("status.stopped"));
    setPreviewAutoMode(false);
    previewMode = "offline";
    el("previewLiveSwitch").checked = false;
    await refreshPreview();
  } else {
    addLog(`${t("log.testFailed")} ${result.error}`);
    setStatus(t("status.error"));
  }
}

async function exportAppData() {
  const result = await window.appApi.exportAppData();
  if (result.ok) {
    addLog(`${t("log.appDataExported", "App data exported:")} ${result.filePath}`);
  } else if (!result.canceled) {
    addLog(`${t("log.appDataExportFailed", "App data export failed:")} ${result.error || "app_data_export_failed"}`);
    setStatus(t("status.error"));
  }
}

async function importAppData() {
  let result;
  try {
    result = await window.appApi.importAppData();
  } catch (err) {
    result = { ok: false, error: err?.message || "app_data_import_failed" };
  }

  if (result.ok) {
    setFormData(result.data);
    applyThemeMode(result.data.themeMode || result.data.theme || "dark");

    const zoom = Number(result.data.uiZoom || 100);
    pendingZoomValue = zoom;
    el("uiZoom").value = String(zoom);
    updateZoomLabel(zoom);
    applyZoom(zoom);

    await refreshPresets();
    await applyLanguage(result.data.language || "en", result.data.activityLanguage || "en");
    applyPreviewVisibility(typeof result.data.showPreview === "undefined" ? true : !!result.data.showPreview);
    setPresetEditMode(false);

    clearValidation();
    addLog(`${t("log.appDataImported", "App data imported:")} ${result.data.language || ""}`);
    schedulePreviewRefresh();
  } else if (!result.canceled) {
    addLog(`${t("log.appDataImportFailed", "App data import failed:")} ${result.error || "app_data_import_failed"}`);
    setStatus(t("status.error"));
  }
}

async function init() {
  const settings = await window.appApi.getSettings();
  const lang = settings.language || (await window.appApi.getLanguage()) || "en";
  const maxInfo = await window.appApi.isWindowMaximized();
  const running = await window.appApi.isRunning();

  isMaximized = !!maxInfo.maximized;
  updateMaximizeButton();

  setFormData(settings);
  applyThemeMode(settings.themeMode || settings.theme || "dark");

  const zoom = Number(settings.uiZoom || 100);
  pendingZoomValue = zoom;
  el("uiZoom").value = String(zoom);
  updateZoomLabel(zoom);
  applyZoom(zoom);

  await refreshPresets();
  await applyLanguage(lang, settings.activityLanguage || "en");
  applyPreviewVisibility(typeof settings.showPreview === "undefined" ? true : !!settings.showPreview);
  updateUpdaterUi(await window.appApi.getUpdaterState());

  setActivePanel("dashboard");
  updateCollapseButton();
  setPresetEditMode(false);
  setPreviewPresenceStartedAt(running.running ? running.startedAt : null);

  setStatus(running.running ? t("status.running") : t("status.ready"));
  await validateAndRender();

  if (running.running) {
    setPreviewAutoMode(true);
  } else {
    setPreviewAutoMode(false);
    previewMode = "offline";
    el("previewLiveSwitch").checked = false;
  }

  await refreshPreview();
}

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (getSelectedThemeMode() === "system") {
    applyThemeMode("system");
  }
});

window.appApi.onLog((msg) => addLog(msg));
window.appApi.onStatus((status) => {
  const normalized = String(status || "").toLowerCase();

  if (normalized.includes("live")) {
    if (!previewPresenceStartedAt) setPreviewPresenceStartedAt(new Date().toISOString());
    setPreviewAutoMode(true);
    setStatus(t("streamInfo.live", "Live"));
    previewMode = "live";
    el("previewLiveSwitch").checked = true;
    refreshPreview().catch(() => {});
    return;
  }

  if (normalized.includes("offline")) {
    if (!previewPresenceStartedAt) setPreviewPresenceStartedAt(new Date().toISOString());
    setPreviewAutoMode(true);
    setStatus(t("streamInfo.offline", "Offline"));
    previewMode = "offline";
    el("previewLiveSwitch").checked = false;
    refreshPreview().catch(() => {});
    return;
  }

  if (normalized.includes("error") || normalized.includes("fehler")) return setStatus(t("status.error"));
  if (normalized.includes("connected")) return setStatus(t("status.connected"));
  if (normalized.includes("running") || normalized.includes("monitoring") || normalized.includes("überwachung")) {
    if (!previewPresenceStartedAt) setPreviewPresenceStartedAt(new Date().toISOString());
    setPreviewAutoMode(true);
    return setStatus(t("status.monitoring"));
  }
  if (normalized.includes("stopped") || normalized.includes("gestoppt")) {
    setPreviewPresenceStartedAt(null);
    setPreviewAutoMode(false);
    previewMode = "offline";
    el("previewLiveSwitch").checked = false;
    refreshPreview().catch(() => {});
    return setStatus(t("status.stopped"));
  }

  setStatus(status);
});
window.appApi.onUpdaterStatus((state) => updateUpdaterUi(state));

window.appApi.onWindowMaximized((value) => {
  isMaximized = !!value;
  updateMaximizeButton();
});

window.appApi.onAppTitle((title) => {
  applyAppTitle(title);
});

document.addEventListener("click", (event) => {
  const wrap1 = el("languageSelect");
  const wrap2 = el("activityLanguageSelect");
  const wrap3 = el("accentColorControl");
  const wrap4 = el("customTimestampModeSelect");
  const wrap5 = el("customActivityTypeSelect");

  if (wrap1 && !wrap1.contains(event.target)) {
    closeLanguageSelect();
  }

  if (wrap2 && !wrap2.contains(event.target)) {
    closeActivityLanguageSelect();
  }

  if (wrap3 && !wrap3.contains(event.target)) {
    closeAccentColorPicker();
  }

  if (wrap4 && !wrap4.contains(event.target)) {
    closeCustomTimestampModeSelect();
  }

  if (wrap5 && !wrap5.contains(event.target)) {
    closeCustomActivityTypeSelect();
  }
});

document.addEventListener("pointerover", (event) => {
  const target = event.target?.closest?.("[data-tooltip]");
  if (target) showTooltip(target);
});

document.addEventListener("pointermove", () => {
  if (activeTooltipTarget) positionTooltip(activeTooltipTarget);
});

document.addEventListener("pointerout", (event) => {
  const target = event.target?.closest?.("[data-tooltip]");
  const related = event.relatedTarget?.closest?.("[data-tooltip]");
  if (target && target === activeTooltipTarget && target !== related) {
    hideTooltip();
  }
});

document.addEventListener("focusin", (event) => {
  const target = event.target?.closest?.("[data-tooltip]");
  if (target) showTooltip(target);
});

document.addEventListener("focusout", (event) => {
  const related = event.relatedTarget?.closest?.("[data-tooltip]");
  if (activeTooltipTarget && activeTooltipTarget !== related) {
    hideTooltip();
  }
});

window.addEventListener("scroll", () => {
  if (activeTooltipTarget) positionTooltip(activeTooltipTarget);
}, true);

window.addEventListener("resize", () => {
  if (activeTooltipTarget) positionTooltip(activeTooltipTarget);
});
