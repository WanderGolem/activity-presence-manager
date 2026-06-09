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

function normalizeChangelogLines(value) {
  if (Array.isArray(value)) {
    return value.map((line) => String(line || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s*/, "").replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function normalizeChangelogData(changelog = {}, fallbackVersion = currentUpdaterState.version || "") {
  const version = String(changelog.version || fallbackVersion || "").trim();
  const languageKey = String(currentLanguage || "en").trim().toLowerCase();
  const languageBase = languageKey.split("-")[0];
  const localizedTitle =
    changelog.titleByLanguage?.[languageKey] ||
    changelog.titleByLanguage?.[languageBase] ||
    changelog.titleByLanguage?.en ||
    "";
  const title = String(localizedTitle || changelog.title || changelog.releaseName || "").trim();
  const date = String(changelog.date || changelog.releaseDate || "").trim();
  const localizedNotes =
    changelog.notesByLanguage?.[languageKey] ||
    changelog.notesByLanguage?.[languageBase] ||
    changelog.notesByLanguage?.en ||
    null;
  const notes = normalizeChangelogLines(localizedNotes?.length ? localizedNotes : (changelog.notes?.length ? changelog.notes : changelog.releaseNotes));

  return {
    version,
    title,
    date,
    notes
  };
}

function getUpdaterChangelog(state = currentUpdaterState) {
  const info = state?.info;
  if (!info?.version && !info?.releaseNotes && !info?.releaseName) return null;

  return normalizeChangelogData({
    version: info.version || state.version || "",
    title: info.releaseName || "",
    date: info.releaseDate || "",
    releaseNotes: info.releaseNotes || ""
  }, state.version || "");
}

function createChangelogNode(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderChangelogMessage(container, changelog = {}) {
  const data = normalizeChangelogData(changelog);
  const wrapper = createChangelogNode("div", "changelog-view");
  const meta = createChangelogNode("div", "changelog-meta");

  if (data.title) {
    meta.appendChild(createChangelogNode("span", "changelog-meta-pill", data.title));
  }

  if (data.date) {
    meta.appendChild(createChangelogNode("span", "changelog-meta-pill", data.date));
  }

  if (meta.childElementCount) wrapper.appendChild(meta);

  if (data.notes.length) {
    const list = createChangelogNode("ul", "changelog-list");
    data.notes.forEach((line) => {
      list.appendChild(createChangelogNode("li", "", line));
    });
    wrapper.appendChild(list);
  } else {
    wrapper.appendChild(createChangelogNode(
      "div",
      "changelog-empty",
      t("changelog.noNotes", "No changelog text is available for this version.")
    ));
  }

  container.appendChild(wrapper);
}

async function showChangelogModal(changelog = {}, options = {}) {
  const data = normalizeChangelogData(changelog);
  const version = data.version || currentUpdaterState.version || "";

  await showConfirmModal({
    title: formatText(t("changelog.title", "What's new in version {version}"), { version }),
    renderMessage: (container) => renderChangelogMessage(container, data),
    acceptLabel: t("button.close", "Close"),
    showCancel: false,
    intent: "info"
  });

  if (options.markSeen) {
    await window.appApi.markChangelogSeen(version);
  }
}

async function showPendingStartupChangelog() {
  if (!appInitComplete || startupChangelogShown || !pendingStartupChangelog?.shouldShow || !pendingStartupChangelog.changelog) {
    return;
  }

  const payload = pendingStartupChangelog;
  pendingStartupChangelog = null;
  startupChangelogShown = true;
  await showChangelogModal(payload.changelog, { markSeen: true });
}

function queueStartupChangelog(payload) {
  if (!payload?.shouldShow || !payload.changelog || startupChangelogShown) return;

  pendingStartupChangelog = payload;
  showPendingStartupChangelog().catch(() => {});
}

async function showUpdateChangelog() {
  const updateChangelog = getUpdaterChangelog(currentUpdaterState);
  if (updateChangelog?.notes?.length || updateChangelog?.title) {
    await showChangelogModal(updateChangelog);
    return;
  }

  const result = await window.appApi.getCurrentChangelog();
  await showChangelogModal(result?.changelog || { version: result?.version || currentUpdaterState.version || "" });
}

async function maybeShowStartupChangelog() {
  const result = await window.appApi.getStartupChangelog();
  if (!result?.ok) return;

  queueStartupChangelog(result);
  await showPendingStartupChangelog();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUpdaterProgressPercent(state = currentUpdaterState) {
  return Math.max(0, Math.min(100, Math.round(Number(state?.progress?.percent || 0))));
}

function formatUpdaterError(error) {
  const raw = String(error || "unknown_error");
  const messages = {
    updates_unavailable_in_dev: ["update.error.unavailableDev", "Updates are only available in the installed app."],
    no_update_available: ["update.error.noUpdateAvailable", "No update is available right now."],
    update_not_downloaded: ["update.error.notDownloaded", "The update has not been downloaded yet."],
    update_check_failed: ["update.error.checkFailed", "The update check failed."],
    update_download_failed: ["update.error.downloadFailed", "The update download failed."],
    update_install_failed: ["update.error.installFailed", "The update installation could not be started."],
    unknown_error: ["update.error.unknown", "Unknown update error."]
  };

  const [key, fallback] = messages[raw] || [];
  return key ? t(key, fallback) : raw;
}

function formatUpdaterStatus(state = currentUpdaterState) {
  const status = state?.status || "idle";
  const version = state?.version || "";
  const updateVersion = state?.info?.version || version || "";
  const percent = getUpdaterProgressPercent(state);

  const replacements = { version, updateVersion, percent };
  const messages = {
    idle: ["update.status.idle", "Installed version: {version}. Ready to check for updates."],
    checking: ["update.status.checking", "Checking GitHub Releases for a newer version ..."],
    available: ["update.status.available", "Version {updateVersion} is available. Install will download it and restart the app."],
    "not-available": ["update.status.notAvailable", "Everything is up to date. Installed version: {version}."],
    downloading: ["update.status.downloading", "Downloading version {updateVersion} ... {percent}%"],
    downloaded: ["update.status.downloaded", "Version {updateVersion} is downloaded. Install will restart the app."],
    installing: ["update.status.installing", "Starting installation. The app will restart in a moment ..."],
    error: ["update.status.error", "Update failed: {error}"],
    "unavailable-dev": ["update.status.unavailableDev", "Updater is disabled in development mode. Test updates in the installed app."]
  };

  const [key, fallback] = messages[status] || messages.idle;
  return formatText(t(key, fallback), { ...replacements, error: formatUpdaterError(state?.error) });
}

function getUpdaterInstallButtonLabel(status) {
  const labels = {
    checking: ["button.updateChecking", "Checking ..."],
    available: ["button.downloadAndInstallUpdate", "Download & install"],
    downloading: ["button.updateDownloading", "Downloading ..."],
    downloaded: ["button.installDownloadedUpdate", "Install now"],
    installing: ["button.updateInstalling", "Installing ..."],
    "not-available": ["button.noUpdateAvailable", "No update"],
    "unavailable-dev": ["button.noUpdateAvailable", "No update"],
    error: ["button.installUpdate", "Install update"],
    idle: ["button.installUpdate", "Install update"]
  };
  const [key, fallback] = labels[status] || labels.idle;
  return t(key, fallback);
}

function getUpdaterCheckButtonLabel(status) {
  if (status === "checking") return t("button.updateChecking", "Checking ...");
  if (["available", "downloaded", "not-available", "error", "unavailable-dev"].includes(status)) {
    return t("button.checkAgain", "Check again");
  }
  return t("button.checkUpdates", "Check updates");
}

function updateUpdaterUi(state = {}) {
  currentUpdaterState = {
    ...currentUpdaterState,
    ...state
  };

  const statusText = el("updateStatusText");
  if (statusText) statusText.textContent = formatUpdaterStatus(currentUpdaterState);

  const checkBtn = el("checkUpdatesBtn");
  const changelogBtn = el("showChangelogBtn");
  const installBtn = el("installUpdateBtn");
  const titlebarUpdateBtn = el("titlebarUpdateBtn");
  const progressWrap = el("updateProgress");
  const progressBar = el("updateProgressBar");
  const status = currentUpdaterState.status || "idle";
  const percent = getUpdaterProgressPercent(currentUpdaterState);
  const updateActionVisible = ["available", "downloading", "downloaded", "installing"].includes(currentUpdaterState.status);
  const canInstall = ["available", "downloaded"].includes(currentUpdaterState.status);
  const isBusy = ["checking", "downloading", "installing"].includes(currentUpdaterState.status);

  if (statusText) {
    statusText.dataset.updateStatus = status;
  }

  if (progressWrap && progressBar) {
    const showProgress = status === "downloading";
    progressWrap.hidden = !showProgress;
    progressWrap.setAttribute("aria-valuenow", String(percent));
    progressBar.style.width = `${percent}%`;
  }

  if (checkBtn) {
    checkBtn.disabled = isBusy;
    setButtonContent("checkUpdatesBtn", getUpdaterCheckButtonLabel(status), "./assets/icons/update.svg");
  }

  if (changelogBtn) {
    changelogBtn.disabled = isBusy;
    setButtonContent("showChangelogBtn", t("button.showChangelog", "Changelog"), "./assets/icons/help.svg");
  }

  if (installBtn) {
    installBtn.hidden = false;
    installBtn.disabled = !canInstall || isBusy;
    setButtonContent("installUpdateBtn", getUpdaterInstallButtonLabel(status), "./assets/icons/update.svg");
  }

  if (titlebarUpdateBtn) {
    titlebarUpdateBtn.hidden = !updateActionVisible;
    titlebarUpdateBtn.disabled = !canInstall || isBusy;
    titlebarUpdateBtn.title = getUpdaterInstallButtonLabel(status);
    titlebarUpdateBtn.setAttribute("aria-label", getUpdaterInstallButtonLabel(status));
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
    while (Date.now() - start < 120000) {
      const state = await window.appApi.getUpdaterState();
      updateUpdaterUi(state);
      if (state.status === "downloaded") break;
      if (state.status === "error") return;
      await wait(500);
    }

    if (currentUpdaterState.status !== "downloaded") {
      updateUpdaterUi({ status: "error", error: "update_download_failed", progress: null });
      return;
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
  setButtonContent("showChangelogBtn", t("button.showChangelog", "Changelog"), "./assets/icons/help.svg");
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
    ["showChangelogBtn", t("button.showChangelog", "Changelog")],
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
  el("label_changelog").textContent = t("field.changelog", "Changelog");
  el("desc_changelog").textContent = t("desc.changelog", "Shows what changed in the installed version or in a found update.");
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
    applyActivityPreviewData(null);
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

function createImportPreviewNode(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function appendImportPreviewMetric(container, label, value, hint) {
  const metric = createImportPreviewNode("div", "import-preview-metric");
  metric.append(
    createImportPreviewNode("span", "import-preview-metric-label", label),
    createImportPreviewNode("strong", "import-preview-metric-value", value),
    createImportPreviewNode("span", "import-preview-metric-hint", hint)
  );
  container.appendChild(metric);
}

function appendImportPreviewDetail(container, label, value, state = "") {
  const row = createImportPreviewNode("div", "import-preview-detail");
  const valueNode = createImportPreviewNode("span", "import-preview-detail-value", value);
  if (state) valueNode.classList.add(`is-${state}`);
  row.append(
    createImportPreviewNode("span", "import-preview-detail-label", label),
    valueNode
  );
  container.appendChild(row);
}

function renderImportPreviewMessage(container, preview = {}) {
  const wrapper = createImportPreviewNode("div", "import-preview");
  const fileRow = createImportPreviewNode("div", "import-preview-file");
  fileRow.append(
    createImportPreviewNode("span", "import-preview-file-label", t("importPreview.fileLabel", "File")),
    createImportPreviewNode("span", "import-preview-file-name", preview.fileName || "-")
  );

  const summary = createImportPreviewNode("div", "import-preview-summary");
  appendImportPreviewMetric(
    summary,
    t("importPreview.settingsChangedLabel", "Settings"),
    `${formatNumber(preview.settingsChangedCount || 0)} / ${formatNumber(preview.settingsImportedCount || 0)}`,
    t("importPreview.settingsChangedHint", "changed values")
  );
  appendImportPreviewMetric(
    summary,
    t("importPreview.presetsAddedLabel", "Presets"),
    formatNumber(preview.importedPresetCount || 0),
    t("importPreview.presetsAddedHint", "will be added")
  );
  appendImportPreviewMetric(
    summary,
    t("importPreview.presetsTotalLabel", "Afterwards"),
    formatNumber(preview.finalPresetCount || 0),
    t("importPreview.presetsTotalHint", "presets total")
  );

  const details = createImportPreviewNode("div", "import-preview-details");
  if (preview.renamedPresetCount > 0) {
    appendImportPreviewDetail(
      details,
      t("importPreview.renamedLabel", "Duplicate names"),
      formatText(t("importPreview.renamedValue", "{count} automatic rename(s)"), {
        count: formatNumber(preview.renamedPresetCount)
      }),
      "warning"
    );
  }

  appendImportPreviewDetail(
    details,
    t("importPreview.validationLabel", "Validation"),
    preview.validationOk
      ? t("importPreview.validationOk", "No issues found")
      : formatText(t("importPreview.validationIssues", "{count} issue(s) found"), {
          count: formatNumber(preview.validationErrorCount || 0)
        }),
    preview.validationOk ? "ok" : "warning"
  );

  const note = createImportPreviewNode("div", "import-preview-note", t("importPreview.settingsOverwrite", "Imported settings overwrite current settings; presets are merged."));

  wrapper.append(fileRow, summary, details, note);
  container.appendChild(wrapper);
}

async function applyImportedAppDataResult(result) {
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
  addLog(formatText(t("log.appDataImportedWithPreview", "App data imported. Presets added: {count}."), {
    count: result.importedPresetCount || 0
  }));
  schedulePreviewRefresh();
}

async function importAppData() {
  let previewResult;
  try {
    previewResult = await window.appApi.prepareAppDataImport();
  } catch (err) {
    previewResult = { ok: false, error: err?.message || "app_data_import_failed" };
  }

  if (!previewResult.ok) {
    if (!previewResult.canceled) {
      addLog(`${t("log.appDataImportFailed", "App data import failed:")} ${previewResult.error || "app_data_import_failed"}`);
      setStatus(t("status.error"));
    }
    return;
  }

  const confirmed = await showConfirmModal({
    title: t("confirm.importAppDataTitle", "Import preview"),
    renderMessage: (container) => renderImportPreviewMessage(container, previewResult.preview),
    acceptLabel: t("button.applyImport", "Import now"),
    cancelLabel: t("button.cancel", "Cancel"),
    intent: previewResult.preview?.validationOk === false ? "danger" : "warning"
  });

  if (!confirmed) {
    await window.appApi.cancelAppDataImport(previewResult.token);
    return;
  }

  const result = await window.appApi.applyAppDataImport(previewResult.token);
  if (result.ok) {
    await applyImportedAppDataResult(result);
  } else {
    addLog(`${t("log.appDataImportFailed", "App data import failed:")} ${result.error || "app_data_import_failed"}`);
    setStatus(t("status.error"));
  }
}

function applyActivityPreviewData(activity) {
  if (!activity) {
    previewLiveData = null;
    renderPreview(getPreviewFallbackData());
    renderStreamInfo(getStreamInfoFallbackData());
    return;
  }

  previewLiveData = activity;

  if (previewAutoMode) {
    previewMode = activity.live ? "live" : "offline";
    el("previewLiveSwitch").checked = activity.live;
  }

  const previewData = previewAutoMode
    ? activity
    : { ...activity, live: previewMode === "live" };

  renderPreview(previewData);
  renderStreamInfo(activity);
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

  if (running.running) {
    if (running.activity) {
      applyActivityPreviewData(running.activity);
    } else {
      await refreshPreview();
    }
  } else {
    applyActivityPreviewData(null);
  }
  appInitComplete = true;
  await maybeShowStartupChangelog();
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
    return;
  }

  if (normalized.includes("offline")) {
    if (!previewPresenceStartedAt) setPreviewPresenceStartedAt(new Date().toISOString());
    setPreviewAutoMode(true);
    setStatus(t("streamInfo.offline", "Offline"));
    previewMode = "offline";
    el("previewLiveSwitch").checked = false;
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
    applyActivityPreviewData(null);
    return setStatus(t("status.stopped"));
  }

  setStatus(status);
});
window.appApi.onActivity((activity) => applyActivityPreviewData(activity));
window.appApi.onStartupChangelog((payload) => queueStartupChangelog(payload));
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
