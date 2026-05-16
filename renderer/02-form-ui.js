// Split from the former renderer.js monolith.
function getFormData() {
  const data = {};

  for (const id of configFields) {
    const node = el(id);
    data[id] = node ? String(node.value || "").trim() : "";
  }

  for (const id of boolFields) {
    data[id] = !!el(id).checked;
  }

  data.checkIntervalSec = Number(el("checkIntervalSec").value || 30);
  data.uiZoom = Number(el("uiZoom").value || pendingZoomValue || 100);

  const themeMode = getSelectedThemeMode();
  data.themeMode = themeMode;
  data.theme = resolveThemeMode(themeMode);

  return data;
}

function getPresetData() {
  const all = getFormData();
  const preset = {};
  for (const field of presetFields) {
    preset[field] = all[field];
  }
  return preset;
}

function setPresetData(data) {
  for (const id of presetFields) {
    const node = el(id);
    if (!node) continue;
    if (typeof data[id] !== "undefined") {
      node.value = data[id];
    } else {
      node.value = typeof PRESET_FIELD_DEFAULTS[id] === "undefined" ? "" : PRESET_FIELD_DEFAULTS[id];
    }
  }

  updateActivitySourceUi();
}

function setFormData(data) {
  for (const id of configFields) {
    const node = el(id);
    if (!node) continue;
    if (typeof data[id] !== "undefined") {
      node.value = data[id];
    } else {
      node.value = typeof PRESET_FIELD_DEFAULTS[id] === "undefined" ? "" : PRESET_FIELD_DEFAULTS[id];
    }
  }

  for (const id of boolFields) {
    const node = el(id);
    if (!node) continue;
    if (typeof data[id] !== "undefined") {
      node.checked = !!data[id];
    } else {
      node.checked = !!BOOL_FIELD_DEFAULTS[id];
    }
  }

  if (typeof data.uiZoom !== "undefined") {
    const zoom = Number(data.uiZoom || 100);
    pendingZoomValue = zoom;
    el("uiZoom").value = String(zoom);
    updateZoomLabel(zoom);
  }

  updateAccentColorDisplay(typeof data.accentColor !== "undefined" ? data.accentColor : DEFAULT_ACCENT_COLOR);
  setSelectedThemeMode(data.themeMode || data.theme || "dark");
  applyPreviewVisibility(typeof data.showPreview === "undefined" ? true : !!data.showPreview);
  updateActivitySourceUi();
}

function normalizeAccentColor(value) {
  const raw = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : DEFAULT_ACCENT_COLOR;
}

let accentPickerState = { h: 235, s: 0.64, v: 0.95 };
let accentColorPickerOpen = false;
let accentColorSurfaceDragging = false;

function hexToRgbParts(hex) {
  const safeHex = normalizeAccentColor(hex).slice(1);
  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16)
  };
}

function toHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function rgbToHsv(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = ((blue - red) / delta) + 2;
    } else {
      hue = ((red - green) / delta) + 4;
    }
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
}

function hexToHsv(hex) {
  const rgb = hexToRgbParts(hex);
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

function hsvToRgbParts(h, s, v) {
  const hue = ((Number(h) % 360) + 360) % 360;
  const saturation = Math.max(0, Math.min(1, Number(s)));
  const value = Math.max(0, Math.min(1, Number(v)));
  const chroma = value * saturation;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (segment >= 0 && segment < 1) {
    red = chroma;
    green = x;
  } else if (segment < 2) {
    red = x;
    green = chroma;
  } else if (segment < 3) {
    green = chroma;
    blue = x;
  } else if (segment < 4) {
    green = x;
    blue = chroma;
  } else if (segment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255
  };
}

function hsvToHex(h, s, v) {
  const rgb = hsvToRgbParts(h, s, v);
  return "#" + toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b);
}

function mixHexColors(primary, secondary, primaryRatio) {
  const a = hexToRgbParts(primary);
  const b = hexToRgbParts(secondary);
  const ratio = Math.max(0, Math.min(1, Number(primaryRatio)));
  const inverse = 1 - ratio;
  return "#" + toHex(a.r * ratio + b.r * inverse) + toHex(a.g * ratio + b.g * inverse) + toHex(a.b * ratio + b.b * inverse);
}

function updateAccentColorSwatches(color) {
  document.querySelectorAll(".accent-color-swatch").forEach((button) => {
    const swatchColor = normalizeAccentColor(button.dataset.color || "");
    button.classList.toggle("active", swatchColor === color);
    button.setAttribute("aria-label", swatchColor.toUpperCase());
  });
}

function updateAccentColorPickerUi(color) {
  const safeColor = normalizeAccentColor(color || el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
  accentPickerState = hexToHsv(safeColor);

  const hueColor = hsvToHex(accentPickerState.h, 1, 1);
  if (el("accentColorSurface")) {
    el("accentColorSurface").style.setProperty("--accent-picker-hue", hueColor);
  }

  if (el("accentColorSurfaceThumb")) {
    el("accentColorSurfaceThumb").style.left = `${accentPickerState.s * 100}%`;
    el("accentColorSurfaceThumb").style.top = `${(1 - accentPickerState.v) * 100}%`;
  }

  if (el("accentHue") && document.activeElement !== el("accentHue")) {
    el("accentHue").value = String(Math.round(accentPickerState.h));
  }

  if (el("accentColorHex") && document.activeElement !== el("accentColorHex")) {
    el("accentColorHex").value = safeColor.toUpperCase();
  }

  if (el("accentColorControl")) {
    el("accentColorControl").classList.toggle("open", accentColorPickerOpen);
  }

  if (el("accentColorPopover")) {
    el("accentColorPopover").hidden = !accentColorPickerOpen;
  }

  if (el("accentColorPicker")) {
    el("accentColorPicker").setAttribute("aria-expanded", accentColorPickerOpen ? "true" : "false");
  }

  if (el("resetAccentColorBtn")) {
    el("resetAccentColorBtn").classList.toggle("is-default", safeColor === DEFAULT_ACCENT_COLOR);
  }

  updateAccentColorSwatches(safeColor);
}

function updateAccentColorDisplay(value) {
  const color = normalizeAccentColor(value);
  if (el("accentColor")) el("accentColor").value = color;
  if (el("accentColorValueText")) el("accentColorValueText").textContent = color.toUpperCase();
  if (el("accentColorPreview")) el("accentColorPreview").style.background = color;
  updateAccentColorPickerUi(color);
}

function setAccentColorValue(value) {
  const color = normalizeAccentColor(value);
  if (el("accentColor")) el("accentColor").value = color;
  applyAccentColor(color);
}

async function persistAccentColor() {
  await saveSettings();
}

function openAccentColorPicker() {
  accentColorPickerOpen = true;
  updateAccentColorPickerUi(el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
}

function closeAccentColorPicker() {
  accentColorPickerOpen = false;
  updateAccentColorPickerUi(el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
}

function toggleAccentColorPicker() {
  if (accentColorPickerOpen) {
    closeAccentColorPicker();
  } else {
    openAccentColorPicker();
  }
}

function setAccentHueValue(hue) {
  accentPickerState.h = Math.max(0, Math.min(360, Number(hue)));
  setAccentColorValue(hsvToHex(accentPickerState.h, accentPickerState.s, accentPickerState.v));
}

function updateAccentColorFromSurfacePointer(clientX, clientY) {
  const surface = el("accentColorSurface");
  if (!surface) return;

  const rect = surface.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

  accentPickerState.s = rect.width ? (x / rect.width) : 0;
  accentPickerState.v = rect.height ? (1 - (y / rect.height)) : 0;

  setAccentColorValue(hsvToHex(accentPickerState.h, accentPickerState.s, accentPickerState.v));
}

function applyAccentColor(value) {
  const color = normalizeAccentColor(value);
  const resolvedTheme = document.body.getAttribute("data-theme") || resolveThemeMode(getSelectedThemeMode());
  const backgroundBase = resolvedTheme === "light" ? "#f2f3f5" : "#313338";
  const hoverColor = mixHexColors(color, "#000000", resolvedTheme === "light" ? 0.82 : 0.78);
  const accentSurface = mixHexColors(color, backgroundBase, resolvedTheme === "light" ? 0.14 : 0.18);
  const accentSurfaceStrong = mixHexColors(color, backgroundBase, resolvedTheme === "light" ? 0.20 : 0.28);
  const accentRgb = hexToRgbParts(color);

  document.body.style.setProperty("--preview-button", color);
  document.body.style.setProperty("--preview-button-hover", hoverColor);
  document.body.style.setProperty("--accent", accentSurface);
  document.body.style.setProperty("--accent-strong", accentSurfaceStrong);
  document.body.style.setProperty("--accent-rgb", accentRgb.r + ", " + accentRgb.g + ", " + accentRgb.b);

  updateAccentColorDisplay(color);
}

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme || "dark");
  applyAccentColor(el("accentColor")?.value || DEFAULT_ACCENT_COLOR);
}

function applyThemeMode(themeMode) {
  applyTheme(resolveThemeMode(themeMode));
  updateThemeOptionVisuals();
}

function updateDashboardSectionEditButton(section) {
  const config = DASHBOARD_EDITABLE_SECTIONS[section];
  const btn = config ? el(config.buttonId) : null;
  if (!btn) return;

  const isEditable = !!dashboardSectionEditState[section];
  btn.classList.toggle("active", isEditable);
  btn.setAttribute("aria-pressed", isEditable ? "true" : "false");

  const actionLabel = isEditable
    ? t("button.lockSection", "Lock section")
    : t("button.editSection", "Edit section");
  const fullLabel = actionLabel + ": " + t(config.labelKey, config.fallbackLabel);
  setTooltip(btn, fullLabel);
  btn.setAttribute("aria-label", fullLabel);
}

function updateDashboardSectionEditButtons() {
  Object.keys(DASHBOARD_EDITABLE_SECTIONS).forEach((section) => {
    updateDashboardSectionEditButton(section);
  });
}

function setDashboardSectionEditable(section, editable) {
  const config = DASHBOARD_EDITABLE_SECTIONS[section];
  if (!config) return;

  const isEditable = !!editable;
  dashboardSectionEditState[section] = isEditable;

  const card = el(config.cardId);
  card?.classList.toggle("section-locked", !isEditable);
  card?.classList.toggle("section-editing", isEditable);

  for (const id of config.fieldIds) {
    const node = el(id);
    if (node) node.disabled = !isEditable;
  }

  for (const id of config.controlIds || []) {
    const node = el(id);
    if (node) node.disabled = !isEditable;
  }

  updateDashboardSectionEditButton(section);
  updateActivitySourceUi();
}

function setAllDashboardSectionsEditable(editable) {
  Object.keys(DASHBOARD_EDITABLE_SECTIONS).forEach((section) => {
    setDashboardSectionEditable(section, editable);
  });
}

function toggleDashboardSectionEditable(section) {
  setDashboardSectionEditable(section, !dashboardSectionEditState[section]);
}

function syncPresetNameInputs(name) {
  const safeName = String(name || "");
  if (el("presetName")) el("presetName").value = safeName;
  if (el("presetEditorName")) el("presetEditorName").value = safeName;
}

function captureFormSnapshot() {
  return {
    formData: getFormData(),
    selectedPreset: el("presetSelect")?.value || "",
    activeSidebarPreset: activeSidebarPreset || ""
  };
}

function restoreFormSnapshot(snapshot) {
  if (!snapshot?.formData) return;

  setFormData(snapshot.formData);

  const selectedPreset = String(snapshot.selectedPreset || "");
  if (el("presetSelect")) {
    el("presetSelect").value = selectedPreset;
  }

  setActiveSidebarPreset(snapshot.activeSidebarPreset || selectedPreset);
  syncPresetNameInputs(selectedPreset);
}

function capturePresetEditorBaseline() {
  return {
    name: String(el("presetEditorName")?.value || "").trim(),
    data: getPresetData(),
    selectedPreset: el("presetSelect")?.value || "",
    activeSidebarPreset: activeSidebarPreset || ""
  };
}

function normalizePresetEditorBaseline(snapshot = {}) {
  const normalizedData = {};

  for (const field of presetFields) {
    normalizedData[field] = String(snapshot?.data?.[field] || "");
  }

  return {
    name: String(snapshot.name || "").trim(),
    data: normalizedData
  };
}

function restorePresetEditorBaseline() {
  if (!presetEditorBaseline) return;

  setPresetData(presetEditorBaseline.data || {});

  const selectedPreset = String(presetEditorBaseline.selectedPreset || "");
  if (el("presetSelect")) {
    el("presetSelect").value = selectedPreset;
  }

  setActiveSidebarPreset(presetEditorBaseline.activeSidebarPreset || selectedPreset);
  syncPresetNameInputs(presetEditorBaseline.name || selectedPreset);
}

function isPresetEditorDirty() {
  if (!presetEditMode || !presetEditorBaseline) return false;

  return JSON.stringify(normalizePresetEditorBaseline(capturePresetEditorBaseline()))
    !== JSON.stringify(normalizePresetEditorBaseline(presetEditorBaseline));
}

async function discardPresetEditChanges() {
  if (!presetEditMode) return;

  if (presetEditorMode === "create" && presetEditReturnSnapshot) {
    restoreFormSnapshot(presetEditReturnSnapshot);
  } else {
    restorePresetEditorBaseline();
  }

  setPresetEditMode(false);
  await validateAndRender();
  schedulePreviewRefresh();
}

async function confirmLeavingPresetEditor() {
  if (!presetEditMode) return true;

  if (isPresetEditorDirty()) {
    const confirmed = await showConfirmModal({
      title: t("confirm.leavePresetTitle", "Unsaved preset changes"),
      message: t(
        "confirm.leavePresetWithoutSaving",
        "Leave preset editing without saving your changes?"
      ),
      acceptLabel: t("button.leaveWithoutSaving", "Leave without saving"),
      cancelLabel: t("button.cancel", "Cancel"),
      intent: "warning"
    });

    if (!confirmed) return false;
  }

  await discardPresetEditChanges();
  return true;
}

function applyPresetEditModeState() {
  const panel = el("panel-dashboard");
  if (!panel) return;

  panel.classList.toggle("preset-edit-mode", presetEditMode);
  panel.classList.toggle("preset-create-mode", presetEditorMode === "create");
}

function updatePresetEditorUi() {
  const title = el("sectionPresetEditor");
  if (title) {
    title.textContent = presetEditorMode === "create"
      ? t("section.newPreset", "New Preset")
      : t("section.presetEditor", "Edit Preset");
  }

  const deleteButton = el("deleteEditedPresetBtn");
  if (deleteButton) {
    deleteButton.hidden = presetEditorMode !== "edit";
  }
}

function setPresetEditMode(enabled, presetName = "", mode = "edit") {
  presetEditMode = !!enabled;
  presetEditorMode = presetEditMode ? (mode === "create" ? "create" : "edit") : "idle";

  if (presetEditMode) {
    editingPresetOriginalName = presetEditorMode === "edit"
      ? String(presetName || activeSidebarPreset || "").trim()
      : "";
    setAllDashboardSectionsEditable(true);
    syncPresetNameInputs(
      presetEditorMode === "create"
        ? String(presetName || "").trim()
        : editingPresetOriginalName
    );
    presetEditorBaseline = capturePresetEditorBaseline();
    if (presetEditorMode !== "create") {
      presetEditReturnSnapshot = null;
    }
  } else {
    editingPresetOriginalName = "";
    setAllDashboardSectionsEditable(false);
    syncPresetNameInputs(activeSidebarPreset || el("presetSelect")?.value || "");
    presetEditorBaseline = null;
    presetEditReturnSnapshot = null;
  }

  updatePresetEditorUi();
  applyPresetEditModeState();
  setActivePanel(activePanelName);
}


async function startNewPresetCreation() {
  const canLeave = await confirmLeavingPresetEditor();
  if (!canLeave) return false;

  presetEditReturnSnapshot = captureFormSnapshot();
  setActiveSidebarPreset("");
  el("presetSelect").value = "";
  clearValidation();

  for (const field of presetFields) {
    const node = el(field);
    if (!node) continue;
    node.value = typeof PRESET_FIELD_DEFAULTS[field] === "undefined" ? "" : PRESET_FIELD_DEFAULTS[field];
  }

  updateActivitySourceUi();

  syncPresetNameInputs("");
  setPresetEditMode(true, "", "create");
  setActivePanel("dashboard");
  schedulePreviewRefresh();
  addLog(t("log.presetCreating", "New preset ready for editing."));
  return true;
}

function handlePresetSaveFailure(result, nameField) {
  const errors = { ...(result?.validation?.errors || {}) };

  if (result?.error === "preset_name_required") {
    errors[nameField] = "required";
    showValidation(errors);
    addLog(t("log.presetNameRequired", "Preset name is required."));
  } else if (result?.error === "preset_name_exists") {
    errors[nameField] = "validation.presetNameExists";
    showValidation(errors);
    addLog(t("log.presetNameExists", "A preset with this name already exists."));
  } else if (result?.error === "preset_validation_failed") {
    showValidation(errors);
    addLog(
      t(
        "log.presetValidationFailed",
        "Please complete the required preset fields and fix the marked entries."
      )
    );
  } else {
    if (Object.keys(errors).length > 0) {
      showValidation(errors);
    }
    addLog(`${t("log.testFailed", "Test failed:")} ${result?.error || "unknown_error"}`);
  }

  setStatus(t("status.error"));
}

function setStatus(text) {
  currentPresenceStatus = text || "";

  const statusNode = el("statusText");
  if (statusNode) statusNode.textContent = currentPresenceStatus;

  renderStreamInfo(currentStreamInfoData || getStreamInfoFallbackData());
}

function addLog(text) {
  const box = el("logBox");
  const now = new Date().toLocaleTimeString(currentLanguage === "de" ? "de-DE" : "en-GB");
  box.textContent += `[${now}] ${text}\n`;
  box.scrollTop = box.scrollHeight;
}

function clearValidation() {
  document.querySelectorAll(".field.invalid").forEach((node) => node.classList.remove("invalid"));
  el("field_checkIntervalSec")?.classList.remove("invalid");
  document.querySelectorAll(".field-error").forEach((node) => {
    node.textContent = "";
  });
}

function showValidation(errors = {}) {
  clearValidation();

  const keyMap = {
    required: "validation.required",
    min5: "validation.min5",
    url: "validation.url",
    number: "validation.number",
    datetime: "validation.datetime"
  };

  Object.entries(errors).forEach(([field, code]) => {
    const fieldNode = el(`field_${field}`);
    const errorNode = el(`error_${field}`);
    if (fieldNode) fieldNode.classList.add("invalid");
    if (errorNode) errorNode.textContent = t(keyMap[code] || code, code);
  });
}

async function validateAndRender() {
  const result = await window.appApi.validateSettings(getFormData());
  showValidation(result.errors || {});
  return result;
}

async function validatePresetAndRender() {
  const result = await window.appApi.validatePreset(getPresetData());
  showValidation(result.errors || {});
  return result;
}

function toggleSecretVisibility() {
  const input = el("twitchClientSecret");
  const btn = el("toggleSecretBtn");

  if (input.type === "password") {
    input.type = "text";
    btn.textContent = t("button.hide", "Hide");
  } else {
    input.type = "password";
    btn.textContent = t("button.show", "Show");
  }
}
