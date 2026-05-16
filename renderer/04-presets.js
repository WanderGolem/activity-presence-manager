// Split from the former renderer.js monolith.
function setActiveSidebarPreset(name) {
  activeSidebarPreset = name || "";
  document.querySelectorAll(".preset-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.presetName === activeSidebarPreset);
  });
}

function getOrderedPresetNames() {
  return Object.keys(presetsCache);
}

function getPresetInitial(name) {
  const trimmedName = String(name || "").trim();
  return trimmedName ? trimmedName.charAt(0).toUpperCase() : "?";
}

function flagPresetDragCompleted() {
  presetDragJustCompleted = true;
  setTimeout(() => {
    presetDragJustCompleted = false;
  }, 150);
}

function clearPresetDropIndicators() {
  presetDropTargetName = "";
  presetDropPosition = "before";
  document.querySelectorAll(".preset-item").forEach((item) => {
    item.classList.remove("drag-over-before", "drag-over-after");
  });
}

function clearPresetDragState() {
  draggedPresetName = "";
  clearPresetDropIndicators();
  document.querySelectorAll(".preset-item").forEach((item) => {
    item.classList.remove("dragging");
  });
}

function setPresetDropIndicator(name, position) {
  presetDropTargetName = name || "";
  presetDropPosition = position === "after" ? "after" : "before";

  document.querySelectorAll(".preset-item").forEach((item) => {
    const isTarget = !!presetDropTargetName && item.dataset.presetName === presetDropTargetName;
    item.classList.toggle("drag-over-before", isTarget && presetDropPosition === "before");
    item.classList.toggle("drag-over-after", isTarget && presetDropPosition === "after");
  });
}

function getPresetDropPosition(event, item) {
  const rect = item.getBoundingClientRect();
  return event.clientY >= rect.top + (rect.height / 2) ? "after" : "before";
}

function buildReorderedPresetNames(draggedName, targetName, position) {
  const names = getOrderedPresetNames();
  const draggedIndex = names.indexOf(draggedName);
  const targetIndex = names.indexOf(targetName);

  if (draggedIndex === -1 || targetIndex === -1) return null;
  if (draggedName === targetName) return names;

  const reorderedNames = names.filter((name) => name !== draggedName);
  let insertIndex = reorderedNames.indexOf(targetName);
  if (insertIndex === -1) return names;
  if (position === "after") insertIndex += 1;

  reorderedNames.splice(insertIndex, 0, draggedName);
  return reorderedNames;
}

async function persistPresetOrder(names) {
  const result = await window.appApi.reorderPresets(names);
  if (!result.ok) {
    addLog(result.error || "Preset reorder failed.");
    return false;
  }

  presetsCache = result.presets;
  renderPresets();
  return true;
}

async function loadPresetByName(name, options = {}) {
  const presetName = String(name || "").trim();
  if (!presetName) return false;

  const canLeave = await confirmLeavingPresetEditor();
  if (!canLeave) return false;

  const result = await window.appApi.loadPreset(presetName);
  if (!result.ok) return false;

  setPresetData(result.preset);
  el("presetSelect").value = presetName;
  syncPresetNameInputs(presetName);
  setActiveSidebarPreset(presetName);

  setPresetEditMode(!!options.enableEditing, presetName, "edit");

  await validateAndRender();
  schedulePreviewRefresh();

  if (options.switchToDashboard) {
    setActivePanel("dashboard");
  }

  const logKey = options.enableEditing ? "log.presetEditing" : "log.presetLoaded";
  const fallback = options.enableEditing ? "Editing preset" : "Preset loaded";
  addLog(t(logKey, fallback) + ": " + presetName);
  return true;
}

async function activatePresetFromSidebar(name) {
  if (presetDragJustCompleted) return;
  await loadPresetByName(name, { switchToDashboard: true, enableEditing: false });
}

async function editPresetFromSidebar(name) {
  await loadPresetByName(name, { switchToDashboard: true, enableEditing: true });
}

function renderPresets() {
  const select = el("presetSelect");
  const list = el("presetList");
  const names = getOrderedPresetNames();
  const selectedName = activeSidebarPreset || el("presetSelect").value || "";

  select.innerHTML = "";
  list.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = t("preset.none", "No preset selected");
  select.appendChild(empty);

  if (names.length === 0) {
    const emptyInfo = document.createElement("div");
    emptyInfo.className = "preset-empty";
    emptyInfo.textContent = t("preset.sidebarEmpty", "No presets saved yet.");
    list.appendChild(emptyInfo);
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);

    const item = document.createElement("div");
    item.className = "preset-item";
    item.dataset.presetName = name;
    item.draggable = true;
    setTooltip(item, name);
    item.setAttribute("aria-label", name);

    const sourceType = normalizeActivitySource(presetsCache?.[name]?.activitySource || "twitch");

    const icon = document.createElement("span");
    icon.className = "preset-item-icon is-" + sourceType;
    icon.innerHTML = getActivitySourceIcon(sourceType);
    setTooltip(icon, getActivitySourceLabel(sourceType));
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "preset-item-label";
    label.textContent = name;

    const shortLabel = document.createElement("span");
    shortLabel.className = "preset-item-short";
    shortLabel.textContent = getPresetInitial(name);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "preset-item-edit";
    editBtn.draggable = false;
    editBtn.innerHTML = EDIT_ICON_SVG;
    setTooltip(editBtn, t("button.editPreset", "Edit preset") + ": " + name);
    editBtn.setAttribute("aria-label", t("button.editPreset", "Edit preset") + ": " + name);

    editBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await editPresetFromSidebar(name);
    });

    editBtn.addEventListener("dragstart", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(shortLabel);
    item.appendChild(editBtn);

    item.addEventListener("click", async () => {
      await activatePresetFromSidebar(name);
    });

    item.addEventListener("dragstart", (event) => {
      draggedPresetName = name;
      item.classList.add("dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", name);
      }
    });

    item.addEventListener("dragover", (event) => {
      if (!draggedPresetName || draggedPresetName === name) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setPresetDropIndicator(name, getPresetDropPosition(event, item));
    });

    item.addEventListener("dragleave", (event) => {
      if (item.contains(event.relatedTarget)) return;
      if (presetDropTargetName === name) clearPresetDropIndicators();
    });

    item.addEventListener("drop", async (event) => {
      if (!draggedPresetName) return;
      event.preventDefault();

      const position = getPresetDropPosition(event, item);
      const reorderedNames = buildReorderedPresetNames(draggedPresetName, name, position);
      const shouldPersist = Array.isArray(reorderedNames) && reorderedNames.join("|") !== getOrderedPresetNames().join("|");

      clearPresetDragState();
      flagPresetDragCompleted();

      if (!shouldPersist) return;
      await persistPresetOrder(reorderedNames);
    });

    item.addEventListener("dragend", () => {
      clearPresetDragState();
    });

    list.appendChild(item);
  }

  if (selectedName && names.includes(selectedName)) {
    select.value = selectedName;
  } else {
    select.value = "";
  }

  setActiveSidebarPreset(select.value || "");
}

async function refreshPresets() {
  presetsCache = await window.appApi.getPresets();
  renderPresets();
}

function getCurrentPresetTransferState() {
  const selectedName = String(
    presetEditMode
      ? (el("presetEditorName")?.value || editingPresetOriginalName || activeSidebarPreset || el("presetSelect")?.value || "")
      : (activeSidebarPreset || el("presetSelect")?.value || "")
  ).trim();

  return {
    name: selectedName,
    data: getPresetData()
  };
}

async function exportCurrentPreset() {
  const currentPreset = getCurrentPresetTransferState();

  if (!currentPreset.name && !presetEditMode) {
    addLog(t("log.noPresetSelected", "No preset selected."));
    setStatus(t("status.error"));
    return;
  }

  const result = await window.appApi.exportPreset(
    currentPreset.name || t("preset.exportFallbackName", "preset"),
    currentPreset.data
  );

  if (result.ok) {
    addLog(`${t("log.presetExported", "Preset exported:")} ${result.filePath}`);
  } else if (result.validation) {
    showValidation(result.validation.errors || {});
    addLog(t("log.presetValidationFailed", "Please complete the required preset fields and fix the marked entries."));
    setStatus(t("status.error"));
  } else if (!result.canceled) {
    addLog(`${t("log.presetExportFailed", "Preset export failed:")} ${result.error || "preset_export_failed"}`);
    setStatus(t("status.error"));
  }
}

async function importPresetData() {
  const reopenInEditor = presetEditMode;
  const canLeave = await confirmLeavingPresetEditor();
  if (!canLeave) return;

  const result = await window.appApi.importPreset();

  if (result.ok) {
    presetsCache = result.presets || presetsCache;
    setPresetData(result.preset);
    el("presetSelect").value = result.name;
    syncPresetNameInputs(result.name);
    setActiveSidebarPreset(result.name);
    setPresetEditMode(reopenInEditor, result.name, "edit");
    renderPresets();
    await validateAndRender();
    schedulePreviewRefresh();
    addLog(`${t("log.presetImported", "Preset imported:")} ${result.name}`);
    setStatus(t("status.saved"));
  } else if (result.validation) {
    showValidation(result.validation.errors || {});
    addLog(t("log.presetValidationFailed", "Please complete the required preset fields and fix the marked entries."));
    setStatus(t("status.error"));
  } else if (!result.canceled) {
    addLog(`${t("log.presetImportFailed", "Preset import failed:")} ${result.error || "preset_import_failed"}`);
    setStatus(t("status.error"));
  }
}

async function savePreset() {
  const name = el("presetName").value.trim();
  if (!name) {
    showValidation({ presetName: "required" });
    addLog(t("log.presetNameRequired", "Preset name is required."));
    setStatus(t("status.error"));
    return;
  }

  const validation = await validatePresetAndRender();
  if (!validation.ok) {
    addLog(t("log.presetValidationFailed", "Please complete the required preset fields and fix the marked entries."));
    setStatus(t("status.error"));
    return;
  }

  const result = await window.appApi.savePreset(name, getPresetData());
  if (result.ok) {
    presetsCache = result.presets;
    el("presetSelect").value = name;
    syncPresetNameInputs(name);
    setActiveSidebarPreset(name);
    renderPresets();
    addLog(`${t("log.presetSaved", "Preset saved")}: ${name}`);
    setStatus(t("status.saved"));
    return;
  }

  handlePresetSaveFailure(result, "presetName");
}

async function loadPreset() {
  const name = el("presetSelect").value;
  if (!name) return;
  await loadPresetByName(name, { enableEditing: false });
}

async function deletePreset() {
  const name = el("presetSelect").value;
  if (!name) return;

  const confirmed = await showConfirmModal({
    title: t("confirm.deletePresetTitle", "Delete preset"),
    message: t("confirm.deletePresetMessage", "Do you really want to delete this preset? This cannot be undone.")
      .replace("{name}", name),
    acceptLabel: t("button.deletePreset", "Delete preset"),
    cancelLabel: t("button.cancel", "Cancel"),
    intent: "danger"
  });
  if (!confirmed) return;

  const result = await window.appApi.deletePreset(name);
  if (result.ok) {
    presetsCache = result.presets;
    el("presetName").value = "";
    el("presetSelect").value = "";
    setActiveSidebarPreset("");
    renderPresets();
    addLog(`${t("log.presetDeleted", "Preset deleted")}: ${name}`);
  }
}

async function saveEditedPreset() {
  const name = el("presetEditorName").value.trim();
  const isNewPreset = presetEditorMode === "create";
  const validation = await validatePresetAndRender();
  const errors = { ...(validation.errors || {}) };

  if (!name) {
    errors.presetEditorName = "required";
  }

  if (Object.keys(errors).length > 0) {
    showValidation(errors);
    addLog(
      t(
        "log.presetValidationFailed",
        "Please complete the required preset fields and fix the marked entries."
      )
    );
    setStatus(t("status.error"));
    return;
  }

  const result = await window.appApi.savePreset(name, getPresetData(), editingPresetOriginalName);
  if (result.ok) {
    presetsCache = result.presets;
    el("presetSelect").value = name;
    setActiveSidebarPreset(name);
    renderPresets();

    if (isNewPreset) {
      setPresetEditMode(false);
      await validateAndRender();
      schedulePreviewRefresh();
    } else {
      setPresetEditMode(true, name, "edit");
    }

    addLog(`${t("log.presetSaved", "Preset saved")}: ${name}`);
    setStatus(t("status.saved"));
    return;
  }

  handlePresetSaveFailure(result, "presetEditorName");
}

async function deleteEditedPreset() {
  const name = String(editingPresetOriginalName || activeSidebarPreset || el("presetSelect")?.value || "").trim();
  if (!name) return;

  const confirmed = await showConfirmModal({
    title: t("confirm.deletePresetTitle", "Delete preset"),
    message: t("confirm.deletePresetMessage", "Do you really want to delete this preset? This cannot be undone.")
      .replace("{name}", name),
    acceptLabel: t("button.deletePreset", "Delete preset"),
    cancelLabel: t("button.cancel", "Cancel"),
    intent: "danger"
  });
  if (!confirmed) return;

  const result = await window.appApi.deletePreset(name);
  if (!result.ok) {
    addLog(`${t("log.testFailed", "Test failed:")} ${result.error || "preset_delete_failed"}`);
    setStatus(t("status.error"));
    return;
  }

  presetsCache = result.presets;
  setActiveSidebarPreset("");
  el("presetSelect").value = "";
  syncPresetNameInputs("");
  setPresetEditMode(false);
  renderPresets();
  await validateAndRender();
  schedulePreviewRefresh();
  addLog(`${t("log.presetDeleted", "Preset deleted")}: ${name}`);
}

async function closePresetEditMode() {
  await confirmLeavingPresetEditor();
}
