// Split from the former renderer.js monolith.
function updateWindowButtonTitles() {
  const reloadLabel = t("window.reload", "Reload app");
  const minimizeLabel = t("window.minimize", "Minimize");
  const maximizeLabel = isMaximized
    ? t("window.restore", "Restore")
    : t("window.maximize", "Maximize");
  const closeLabel = t("window.close", "Close");

  if (el("reloadBtn")) {
    setTooltip(el("reloadBtn"), reloadLabel);
    el("reloadBtn").setAttribute("aria-label", reloadLabel);
  }

  setTooltip(el("minimizeBtn"), minimizeLabel);
  el("minimizeBtn").setAttribute("aria-label", minimizeLabel);
  setTooltip(el("maximizeBtn"), maximizeLabel);
  el("maximizeBtn").setAttribute("aria-label", maximizeLabel);
  setTooltip(el("closeBtn"), closeLabel);
  el("closeBtn").setAttribute("aria-label", closeLabel);
}

function updateMaximizeButton() {
  el("maximizeBtn").innerHTML = isMaximized ? WINDOW_RESTORE_ICON : WINDOW_MAXIMIZE_ICON;
  updateWindowButtonTitles();
}

function updateCollapseButton() {
  const sidebar = el("sidebar");
  const btn = el("collapseSidebarBtn");
  const isCollapsed = sidebar.classList.contains("collapsed");
  const label = isCollapsed
    ? t("sidebar.expand", "Expand sidebar")
    : t("sidebar.collapse", "Collapse sidebar");
  btn.innerHTML = isCollapsed
    ? '<img src="./assets/icons/sidbar_expand.svg" alt="" aria-hidden="true" />'
    : '<img src="./assets/icons/sidebar_collapse.svg" alt="" aria-hidden="true" />';
  setTooltip(btn, label);
  btn.setAttribute("aria-label", label);
}

function toggleSidebarCollapse() {
  const sidebar = el("sidebar");
  sidebar.classList.toggle("collapsed");
  updateCollapseButton();
}

function getPreviewFallbackData() {
  return buildFallbackActivityData(true);
}

function getStreamInfoFallbackData() {
  return buildFallbackActivityData(false);
}

function resolvePreviewImages(data) {
  const form = getFormData();
  if (data.sourceType === "custom") {
    return {
      large: (isHttpUrl(form.customLargeImageUrl) ? form.customLargeImageUrl : "") || data.previewLargeImageUrl || data.avatarUrl || "./assets/icon.ico",
      small: isHttpUrl(form.customSmallImageUrl) ? form.customSmallImageUrl : ""
    };
  }

  const hasLiveSmallImage = !!String(form.smallImageLiveUrl || form.smallImageLiveKey || "").trim();
  const hasOfflineSmallImage = !!String(form.smallImageOfflineUrl || form.smallImageOfflineKey || "").trim();
  const shouldUseFallbackSmallImage =
    form.useDefaultStreamStatusImage &&
    data.sourceType !== "custom" &&
    !((data.live && hasLiveSmallImage) || (!data.live && hasOfflineSmallImage));

  const large = data.previewLargeImageUrl || data.avatarUrl || "./assets/icon.ico";
  let small = data.live
    ? (form.smallImageLiveUrl || "")
    : (form.smallImageOfflineUrl || "");

  if (!small && shouldUseFallbackSmallImage) {
    small = buildDefaultStreamStatusImageDataUri(!!data.live);
  }

  return { large, small };
}

function getPreviewPossessiveName(name) {
  const safeName = String(name || "").trim() || "Streamer";
  return /s$/i.test(safeName) ? `${safeName}'` : `${safeName}s`;
}

function formatPreviewActivityText(text, replacements = {}) {
  return String(text || "").replace(/\{(\w+)\}/g, (match, key) => {
    const value = replacements[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function normalizePreviewButtonLabel(label, fallback) {
  const resolved = String(label || "").replace(/\r|\n/g, " ").trim() || fallback;
  return String(resolved || "").slice(0, 32);
}

function resolvePreviewButtons(preview, form, displayName) {
  if (Array.isArray(preview.buttons) && preview.buttons.length) {
    return preview.buttons.slice(0, 2);
  }

  if (preview.sourceType === "custom") {
    return buildCustomPreviewButtons(form, displayName);
  }

  const buttons = [];
  const safeDisplayName = String(displayName || "").trim() || "Streamer";
  if (isHttpUrl(preview.streamUrl)) {
    const streamLabel = activityT("presence.button.openStream", "Join Stream");
    buttons.push({
      label: normalizePreviewButtonLabel(streamLabel, "Join Stream"),
      url: preview.streamUrl
    });
  }

  if (isHttpUrl(form.discordInviteUrl)) {
    const communityFallback = `${getPreviewPossessiveName(safeDisplayName)} Discord Server`;
    const communityTemplate = activityT("presence.button.community", communityFallback);
    buttons.push({
      label: normalizePreviewButtonLabel(
        formatPreviewActivityText(communityTemplate, { name: safeDisplayName }),
        communityFallback
      ),
      url: form.discordInviteUrl
    });
  }

  return buttons.slice(0, 2);
}

function renderPreview(data) {
  const preview = data || getPreviewFallbackData();
  const form = getFormData();
  const images = resolvePreviewImages(preview);

  const isLive = !!preview.live;
  const isCustomSource = preview.sourceType === "custom";
  const badgeLabel = isCustomSource
    ? (preview.badgeLabel || getCustomActivityTypeLabel(preview.customActivityType))
    : (isLive ? activityT("streamInfo.live", "Live") : activityT("streamInfo.offline", "Offline"));
  const largeImageNode = el("previewLargeImage");
  const smallImageNode = el("previewSmallImage");
  const buttonBox = el("previewButtons");
  const buttons = resolvePreviewButtons(preview, form, preview.streamerDisplayName || form.streamerLogin || "Streamer");

  el("previewCard").classList.toggle("live-animated", isLive);
  el("previewBadge").textContent = String(badgeLabel || "").toUpperCase();
  el("previewBadge").classList.toggle("offline", !isLive && !isCustomSource);

  const displayName = preview.streamerDisplayName || form.streamerLogin || "Streamer";
  updatePreviewAppLabel(preview, displayName);
  const viewersText = `${formatNumber(preview.viewers || 0, currentActivityLanguageCode)} ${activityT("preview.viewers", "viewers")}`;
  const customTimestampMode = normalizeCustomTimestampMode(preview.timestampMode || "none");
  const activityDuration = isCustomSource
    ? (customTimestampMode === "none" ? "" : getCustomStreamInfoTimestampValue(preview))
    : (isLive ? formatLiveDuration(preview.startedAt) : getPreviewPresenceDuration());

  let title = "";
  let subtitle = "";
  let details = "";
  let state = activityDuration;

  if (isCustomSource) {
    title = String(preview.title || "").trim() || activityT("preview.customNoDetails", "No details set");
    subtitle = String(preview.game || "").trim() || displayName;
    details = String(preview.largeText || "").trim();
    if (details === displayName) details = "";
  } else {
    title = isLive
      ? (preview.title || activityT("preview.defaultLiveTitle", "Live now"))
      : activityT("preview.defaultOfflineTitle", "Waiting for streamer");
    subtitle = isLive
      ? displayName
      : (String(preview.title || "").trim() || activityT("preview.noStreamTitle", "No stream title set"));
    details = isLive
      ? joinPreviewParts([preview.game || activityT("preview.defaultGame", "Streaming"), viewersText])
      : "";
  }

  largeImageNode.src = images.large;
  largeImageNode.alt = displayName;
  setTooltip(largeImageNode, preview.largeText || displayName);

  if (images.small) {
    smallImageNode.src = images.small;
    smallImageNode.alt = preview.smallText || badgeLabel;
    setTooltip(smallImageNode, preview.smallText || badgeLabel);
    smallImageNode.classList.remove("hidden");
  } else {
    smallImageNode.removeAttribute("src");
    smallImageNode.alt = "";
    setTooltip(smallImageNode, "");
    smallImageNode.classList.add("hidden");
  }

  el("previewTitle").textContent = title;
  el("previewUser").textContent = subtitle;
  el("previewDetails").textContent = details;
  el("previewState").textContent = state;
  el("previewState").style.display = state ? "block" : "none";

  const buttonNodes = [el("previewStreamBtn"), el("previewCommunityBtn")];
  buttonNodes.forEach((node, index) => {
    const button = buttons[index];
    if (!node) return;
    if (!button || !isHttpUrl(button.url)) {
      node.style.display = "none";
      node.dataset.url = "";
      node.textContent = "";
      setTooltip(node, "");
      return;
    }

    node.style.display = "inline-flex";
    node.dataset.url = button.url;
    node.textContent = button.label || activityT("presence.button.openLink", "Open Link");
    setTooltip(node, node.textContent);
    node.setAttribute("aria-label", node.textContent);
  });

  if (buttonBox) {
    buttonBox.style.display = buttons.length ? "grid" : "none";
  }

  updatePreviewSwitchAvailability();
}

function refreshPreviewDuration() {
  const preview = getCurrentPreviewSnapshot();
  if (!preview) return;

  const customTimestampMode = normalizeCustomTimestampMode(preview.timestampMode || "none");
  const duration = preview.sourceType === "custom"
    ? (customTimestampMode === "none" ? "" : getCustomStreamInfoTimestampValue(preview))
    : (preview.live ? formatLiveDuration(preview.startedAt) : getPreviewPresenceDuration());

  el("previewState").textContent = duration;
  el("previewState").style.display = duration ? "block" : "none";
}
async function refreshPreview() {
  if (el("showPreview") && !el("showPreview").checked) {
    return;
  }

  const form = getFormData();

  try {
    const result = await window.appApi.getPreviewData(form);

    if (result.ok && result.preview) {
      previewLiveData = result.preview;

      if (previewAutoMode) {
        previewMode = result.preview.live ? "live" : "offline";
        el("previewLiveSwitch").checked = result.preview.live;
      }

      const manualData = previewAutoMode
        ? result.preview
        : { ...result.preview, live: previewMode === "live" };

      renderPreview(manualData);
      renderStreamInfo(result.preview);
      return;
    }
  } catch {
    // ignore
  }

  previewLiveData = null;
  renderPreview(getPreviewFallbackData());
  renderStreamInfo(getStreamInfoFallbackData());
}

function schedulePreviewRefresh() {
  if (el("showPreview") && !el("showPreview").checked) {
    return;
  }

  if (previewFetchTimer) clearTimeout(previewFetchTimer);
  previewFetchTimer = setTimeout(() => {
    refreshPreview().catch(() => {});
  }, 400);
}

function setPreviewAutoMode(enabled) {
  previewAutoMode = !!enabled;
  updatePreviewSwitchAvailability();
}
