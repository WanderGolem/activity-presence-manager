// Event bindings and startup.
el("menuDashboardBtn").addEventListener("click", () => {
  navigateToPanel("dashboard").catch(() => {});
});
el("menuSettingsBtn").addEventListener("click", () => {
  navigateToPanel("settings").catch(() => {});
});
el("menuPresetsBtn").addEventListener("click", () => {
  startNewPresetCreation().catch(() => {});
});
el("menuHelpBtn").addEventListener("click", () => {
  navigateToPanel("help").catch(() => {});
});

el("appConfirmCancelBtn").addEventListener("click", () => {
  closeConfirmModal(false);
});

el("appConfirmAcceptBtn").addEventListener("click", () => {
  closeConfirmModal(true);
});

el("appConfirmModal").addEventListener("click", (event) => {
  if (event.target === el("appConfirmModal")) {
    closeConfirmModal(false);
  }
});

el("collapseSidebarBtn").addEventListener("click", () => {
  toggleSidebarCollapse();
});
el("editTwitchBtn").addEventListener("click", () => {
  toggleDashboardSectionEditable("twitch");
});

el("editYoutubeBtn").addEventListener("click", () => {
  toggleDashboardSectionEditable("youtube");
});

el("editCustomBtn").addEventListener("click", () => {
  toggleDashboardSectionEditable("custom");
});

el("editDiscordBtn").addEventListener("click", () => {
  toggleDashboardSectionEditable("discord");
});

el("editImagesBtn").addEventListener("click", () => {
  toggleDashboardSectionEditable("images");
});

const sourceModeButtonMap = {
  sourceModeTwitch: "twitch",
  sourceModeYouTube: "youtube",
  sourceModeCustom: "custom"
};

Object.entries(sourceModeButtonMap).forEach(([id, source]) => {
  el(id).addEventListener("click", () => {
    if (el(id).disabled) return;
    el("activitySource").value = source;
    updateActivitySourceUi();
    validateAndRender().catch(() => {});
    schedulePreviewRefresh();
  });
});

const twitchApiModeButtonMap = {
  twitchApiModeManaged: "managed",
  twitchApiModeOfficial: "official"
};

Object.entries(twitchApiModeButtonMap).forEach(([id, mode]) => {
  el(id).addEventListener("click", () => {
    if (el(id).disabled) return;
    el("twitchApiMode").value = mode;
    updateTwitchApiModeUi();
    validateAndRender().catch(() => {});
    schedulePreviewRefresh();
  });
});

el("activitySource").addEventListener("change", () => {
  updateActivitySourceUi();
  validateAndRender().catch(() => {});
  schedulePreviewRefresh();
});

el("customActivityType").addEventListener("change", () => {
  renderCustomActivityTypeSelect();
  validateAndRender().catch(() => {});
  schedulePreviewRefresh();
});

el("customTimestampMode").addEventListener("change", () => {
  renderCustomTimestampModeSelect();
  updateCustomTimestampModeFieldVisibility();
  validateAndRender().catch(() => {});
  schedulePreviewRefresh();
});

el("previewLiveSwitch").addEventListener("change", async (e) => {
  if (previewAutoMode) {
    e.target.checked = previewMode === "live";
    return;
  }

  previewMode = e.target.checked ? "live" : "offline";

  if (previewLiveData) {
    renderPreview({ ...previewLiveData, live: previewMode === "live" });
  } else {
    renderPreview(getPreviewFallbackData());
  }

  await refreshPreview();
});

el("previewStreamBtn").addEventListener("click", async () => {
  const url = el("previewStreamBtn").dataset.url || "";
  if (!isHttpUrl(url)) return;
  await window.appApi.openExternalUrl(url);
});
el("previewCommunityBtn").addEventListener("click", async () => {
  const url = el("previewCommunityBtn").dataset.url || "";
  if (!isHttpUrl(url)) return;
  await window.appApi.openExternalUrl(url);
});

el("languageSelectTrigger").addEventListener("click", () => {
  toggleLanguageSelect();
});

el("activityLanguageSelectTrigger").addEventListener("click", () => {
  toggleActivityLanguageSelect();
});

el("customTimestampModeSelectTrigger").addEventListener("click", () => {
  toggleCustomTimestampModeSelect();
});

el("customActivityTypeSelectTrigger").addEventListener("click", () => {
  toggleCustomActivityTypeSelect();
});

el("themeDark").addEventListener("change", async () => {
  setSelectedThemeMode("dark");
  applyThemeMode("dark");
  await saveSettings();
});

el("themeLight").addEventListener("change", async () => {
  setSelectedThemeMode("light");
  applyThemeMode("light");
  await saveSettings();
});

el("themeSystem").addEventListener("change", async () => {
  setSelectedThemeMode("system");
  applyThemeMode("system");
  await saveSettings();
});

el("reloadBtn").addEventListener("click", async () => {
  await window.appApi.reloadWindow();
});

el("minimizeBtn").addEventListener("click", async () => {
  await window.appApi.minimizeWindow();
});

el("maximizeBtn").addEventListener("click", async () => {
  const result = await window.appApi.toggleMaximizeWindow();
  isMaximized = !!result.maximized;
  updateMaximizeButton();
});

el("closeBtn").addEventListener("click", async () => {
  await window.appApi.closeWindow();
});

el("toggleSecretBtn").addEventListener("click", toggleSecretVisibility);

el("saveBtn").addEventListener("click", saveSettings);
el("testBtn").addEventListener("click", testSettings);
el("startBtn").addEventListener("click", startPresence);
el("stopBtn").addEventListener("click", stopPresence);
el("exportBtn").addEventListener("click", exportCurrentPreset);
el("importBtn").addEventListener("click", importPresetData);
el("settingsExportBtn").addEventListener("click", exportAppData);
el("settingsImportBtn").addEventListener("click", importAppData);
el("checkUpdatesBtn").addEventListener("click", checkUpdates);
el("downloadUpdateBtn").addEventListener("click", downloadAvailableUpdate);
el("installUpdateBtn").addEventListener("click", installAvailableUpdate);

el("createPresetBtn").addEventListener("click", () => {
  startNewPresetCreation().catch(() => {});
});
el("loadPresetBtn").addEventListener("click", loadPreset);
el("deletePresetBtn").addEventListener("click", deletePreset);
el("saveEditedPresetBtn").addEventListener("click", saveEditedPreset);
el("presetImportBtn").addEventListener("click", importPresetData);
el("presetExportBtn").addEventListener("click", exportCurrentPreset);
el("deleteEditedPresetBtn").addEventListener("click", deleteEditedPreset);
el("closePresetEditBtn").addEventListener("click", () => {
  closePresetEditMode().catch(() => {});
});

el("presetSelect").addEventListener("change", () => {
  const value = el("presetSelect").value || "";
  syncPresetNameInputs(value);
  setActiveSidebarPreset(value);
});

el("presetName").addEventListener("input", () => {
  if (!presetEditMode) {
    syncPresetNameInputs(el("presetName").value);
  }
});

el("presetEditorName").addEventListener("input", () => {
  syncPresetNameInputs(el("presetEditorName").value);
});

el("accentColorPicker").addEventListener("click", (event) => {
  event.stopPropagation();
  toggleAccentColorPicker();
});

el("resetAccentColorBtn").addEventListener("click", async () => {
  setAccentColorValue(DEFAULT_ACCENT_COLOR);
  await persistAccentColor();
});

el("accentColorSurface").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  accentColorSurfaceDragging = true;
  updateAccentColorFromSurfacePointer(event.clientX, event.clientY);
});

document.addEventListener("pointermove", (event) => {
  if (!accentColorSurfaceDragging) return;
  updateAccentColorFromSurfacePointer(event.clientX, event.clientY);
});

document.addEventListener("pointerup", async () => {
  if (!accentColorSurfaceDragging) return;
  accentColorSurfaceDragging = false;
  await persistAccentColor();
});

el("accentHue").addEventListener("input", () => {
  setAccentHueValue(el("accentHue").value || 0);
});

el("accentHue").addEventListener("change", async () => {
  setAccentHueValue(el("accentHue").value || 0);
  await persistAccentColor();
});

document.querySelectorAll(".accent-color-swatch").forEach((button) => {
  button.addEventListener("click", async () => {
    setAccentColorValue(button.dataset.color || DEFAULT_ACCENT_COLOR);
    await persistAccentColor();
  });
});

el("accentColorHex").addEventListener("input", () => {
  const raw = String(el("accentColorHex").value || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    setAccentColorValue(normalized);
  }
});

el("accentColorHex").addEventListener("change", async () => {
  const raw = String(el("accentColorHex").value || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    setAccentColorValue(normalized);
    await persistAccentColor();
    return;
  }

  updateAccentColorDisplay(el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
});

el("accentColorHex").addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const raw = String(el("accentColorHex").value || "").trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    setAccentColorValue(normalized);
    await persistAccentColor();
    closeAccentColorPicker();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isConfirmModalOpen()) {
    closeConfirmModal(false);
    return;
  }

  if (event.key === "Escape" && accentColorPickerOpen) {
    closeAccentColorPicker();
  }
});

el("uiZoom").addEventListener("input", () => {
  pendingZoomValue = Number(el("uiZoom").value || 100);
  updateZoomLabel(pendingZoomValue);
});

el("uiZoom").addEventListener("change", async () => {
  const finalZoom = Number(el("uiZoom").value || 100);
  pendingZoomValue = finalZoom;
  updateZoomLabel(finalZoom);
  applyZoom(finalZoom);
  await saveSettings();
});

el("uiZoom").addEventListener("mouseup", async () => {
  const finalZoom = Number(el("uiZoom").value || 100);
  const currentAppliedZoom = Number((document.body.style.zoom || "100%").replace("%", ""));
  if (currentAppliedZoom !== finalZoom) {
    pendingZoomValue = finalZoom;
    updateZoomLabel(finalZoom);
    applyZoom(finalZoom);
    await saveSettings();
  }
});

[
  "twitchApiMode",
  "twitchClientId",
  "twitchClientSecret",
  "streamerLogin",
  "youtubeApiKey",
  "youtubeChannel",
  "customDisplayName",
  "customTitle",
  "customGame",
  "customActivityType",
  "customTimestampMode",
  "customTimestampStart",
  "customTimestampEnd",
  "customButtonOneLabel",
  "customStreamUrl",
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
  "largeImageUrl",
  "smallImageLiveUrl",
  "smallImageOfflineUrl",
  "checkIntervalSec"
].forEach((id) => {
  el(id).addEventListener("input", () => {
    validateAndRender().catch(() => {});
    schedulePreviewRefresh();
  });
});

[
  "launchOnStartup",
  "minimizeToTray",
  "startMinimized",
  "autoStartPresence",
  "autoCheckForUpdates",
  "showPreview",
  "useDefaultStreamStatusImage"
].forEach((id) => {
  const node = el(id);
  node.addEventListener("change", async () => {
    if (id === "showPreview") {
      applyPreviewVisibility(node.checked);
    }
    await saveSettings();
  });
});

setInterval(() => {
  refreshStreamInfoDuration();
  refreshPreviewDuration();
}, 1000);

init().catch((err) => {
  addLog(`Init error: ${err.message}`);
  setStatus("Error");
});
