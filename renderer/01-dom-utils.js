// Split from the former renderer.js monolith.
function el(id) {
  return document.getElementById(id);
}

function t(key, fallback = key) {
  return translations[key] || fallback;
}

function activityT(key, fallback = key) {
  return activityTranslations[key] || translations[key] || fallback;
}

let activeTooltipTarget = null;
let confirmModalResolver = null;
let confirmModalPreviousFocus = null;

function getUiZoomScale() {
  const zoomValue = Number(String(document.body.style.zoom || "100%").replace("%", ""));
  return Number.isFinite(zoomValue) && zoomValue > 0 ? (zoomValue / 100) : 1;
}

function setTooltip(node, text) {
  if (!node) return;

  const safeText = String(text || "").trim();
  node.removeAttribute("title");

  if (!safeText) {
    node.removeAttribute("data-tooltip");
    if (activeTooltipTarget === node) hideTooltip();
    return;
  }

  node.setAttribute("data-tooltip", safeText);
  if (activeTooltipTarget === node) showTooltip(node);
}

function positionTooltip(target) {
  const tooltip = el("appTooltip");
  if (!tooltip || !target) return;

  const rect = target.getBoundingClientRect();
  const spacing = 12;
  const tooltipRect = tooltip.getBoundingClientRect();
  const zoomScale = getUiZoomScale();

  let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
  left = Math.max(8, Math.min(left, window.innerWidth - tooltipRect.width - 8));

  let top = rect.top - tooltipRect.height - spacing;
  let placement = "top";
  if (top < 8) {
    top = rect.bottom + spacing;
    placement = "bottom";
  }

  tooltip.dataset.placement = placement;
  tooltip.style.left = `${left / zoomScale}px`;
  tooltip.style.top = `${top / zoomScale}px`;

  const arrowLeft = Math.max(14, Math.min(rect.left + (rect.width / 2) - left, tooltipRect.width - 14));
  tooltip.style.setProperty("--tooltip-arrow-left", `${arrowLeft / zoomScale}px`);
}

function showTooltip(target) {
  const tooltip = el("appTooltip");
  const label = el("appTooltipLabel");
  const safeText = String(target?.getAttribute("data-tooltip") || "").trim();
  if (!tooltip || !label || !safeText) return;

  activeTooltipTarget = target;
  label.textContent = safeText;
  tooltip.hidden = false;
  tooltip.classList.add("show");
  positionTooltip(target);
}

function hideTooltip() {
  const tooltip = el("appTooltip");
  if (!tooltip) return;

  tooltip.classList.remove("show");
  tooltip.hidden = true;
  activeTooltipTarget = null;
}

function isConfirmModalOpen() {
  return !el("appConfirmModal")?.hidden;
}

function showConfirmModal(options = {}) {
  const modal = el("appConfirmModal");
  const title = el("appConfirmTitle");
  const message = el("appConfirmMessage");
  const cancelBtn = el("appConfirmCancelBtn");
  const acceptBtn = el("appConfirmAcceptBtn");
  const badge = el("appConfirmBadge");

  if (!modal || !title || !message || !cancelBtn || !acceptBtn || !badge) {
    return Promise.resolve(false);
  }

  if (confirmModalResolver) {
    confirmModalResolver(false);
    confirmModalResolver = null;
  }

  const safeTitle = String(options.title || t("confirm.defaultTitle", "Please confirm"));
  const safeMessage = String(options.message || t("confirm.defaultMessage", "Are you sure you want to continue?"));
  const acceptLabel = String(options.acceptLabel || t("button.confirm", "Confirm"));
  const cancelLabel = String(options.cancelLabel || t("button.cancel", "Cancel"));
  const intent = String(options.intent || "warning").trim().toLowerCase();
  const hasCustomMessage = typeof options.renderMessage === "function";
  const showCancel = options.showCancel !== false;

  title.textContent = safeTitle;
  message.replaceChildren();
  message.classList.toggle("app-confirm-message-rich", hasCustomMessage);
  if (hasCustomMessage) {
    options.renderMessage(message);
  } else {
    message.textContent = safeMessage;
  }
  acceptBtn.textContent = acceptLabel;
  cancelBtn.textContent = cancelLabel;
  cancelBtn.hidden = !showCancel;
  badge.textContent = intent === "danger" ? "!" : intent === "info" ? "i" : "?";
  badge.classList.toggle("is-info", intent === "info");
  badge.classList.toggle("is-danger", intent === "danger");
  acceptBtn.classList.toggle("btn-stop", intent === "danger");
  acceptBtn.classList.toggle("btn-save", intent !== "danger");

  confirmModalPreviousFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    setTimeout(() => {
      acceptBtn.focus();
    }, 0);
  });
}

function closeConfirmModal(confirmed = false) {
  const modal = el("appConfirmModal");
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("modal-open");

  const resolver = confirmModalResolver;
  confirmModalResolver = null;

  if (confirmModalPreviousFocus && typeof confirmModalPreviousFocus.focus === "function") {
    confirmModalPreviousFocus.focus();
  }
  confirmModalPreviousFocus = null;

  if (resolver) resolver(!!confirmed);
}

function formatNumber(value, languageCode = currentLanguage) {
  try {
    return new Intl.NumberFormat(languageCode || currentLanguage || "en").format(Number(value || 0));
  } catch {
    return new Intl.NumberFormat("en").format(Number(value || 0));
  }
}

function buildDefaultStreamStatusImageDataUri(isLive) {
  return isLive
    ? "https://www.dropbox.com/scl/fi/p51kr59v381326jj2cv1j/small_image_live.png?rlkey=g4id7mdqsxp2aj67lweyl06mp&st=7i8x1nxx&raw=1"
    : "https://www.dropbox.com/scl/fi/0r2wi0736avrhdw1n7ywq/small_image_offline.png?rlkey=svzpuijqh6f3y6bcxbaszxs74&st=93fuxo89&raw=1";
}

function formatLiveDuration(startedAt) {
  if (!startedAt) return "--";

  const startedMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedMs)) return "--";

  const totalSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return String(hours).padStart(2, "0") + ":"
    + String(minutes).padStart(2, "0") + ":"
    + String(seconds).padStart(2, "0");
}

function setPreviewPresenceStartedAt(startedAt) {
  if (!startedAt) {
    previewPresenceStartedAt = null;
    return;
  }

  const startedMs = new Date(startedAt).getTime();
  previewPresenceStartedAt = Number.isFinite(startedMs)
    ? new Date(startedMs).toISOString()
    : null;
}

function getPreviewPresenceDuration() {
  return previewPresenceStartedAt ? formatLiveDuration(previewPresenceStartedAt) : "--";
}

function joinPreviewParts(parts) {
  return parts.filter((part) => String(part || "").trim()).join(" - ");
}

function formatClockTime(value, language = currentActivityLanguageCode || currentLanguage || "en", includeSeconds = false) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat(language, {
      hour12: false,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {})
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      hour12: false,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {})
    }).format(date);
  }
}

function normalizeActivitySource(source) {
  const normalized = String(source || "twitch").trim().toLowerCase();
  return ["twitch", "youtube", "custom"].includes(normalized) ? normalized : "twitch";
}

function normalizeTwitchApiMode(mode) {
  return String(mode || "managed").trim().toLowerCase() === "official" ? "official" : "managed";
}

function getTwitchApiMode() {
  return normalizeTwitchApiMode(el("twitchApiMode")?.value || "managed");
}

function normalizeCustomStatus(status) {
  return String(status || "offline").trim().toLowerCase() === "live" ? "live" : "offline";
}

function normalizeCustomActivityType(type) {
  const normalized = String(type || "playing").trim().toLowerCase();
  return ["playing", "listening", "watching", "competing"].includes(normalized)
    ? normalized
    : "playing";
}

function normalizeCustomTimestampMode(mode) {
  const normalized = String(mode || "none").trim();
  return ["none", "start", "end", "startEnd", "clock"].includes(normalized)
    ? normalized
    : "none";
}

function isHttpUrl(value) {
  return /^https?:///i.test(String(value || "").trim());
}

function parseDateTimeValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function formatRemainingDuration(endAt) {
  if (!endAt) return "";

  const endMs = new Date(endAt).getTime();
  if (!Number.isFinite(endMs)) return "";

  const totalSeconds = Math.max(0, Math.floor((endMs - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return String(hours).padStart(2, "0") + ":"
    + String(minutes).padStart(2, "0") + ":"
    + String(seconds).padStart(2, "0");
}

function getActivitySource() {
  return normalizeActivitySource(el("activitySource")?.value || "twitch");
}

function getSelectedActivityLanguageSetting() {
  const selected = String(
    el("activityLanguage")?.value || currentActivityLanguageSetting || currentLanguage || "en"
  ).trim().toLowerCase();
  return selected === "app" ? "app" : (selected || currentLanguage || "en");
}

function getResolvedActivityLanguageCode(setting = getSelectedActivityLanguageSetting()) {
  const normalized = String(setting || "").trim().toLowerCase();
  return normalized === "app"
    ? (currentLanguage || "en")
    : (normalized || currentLanguage || "en");
}

function getActivitySourceLabel(source) {
  switch (normalizeActivitySource(source)) {
    case "youtube":
      return t("source.optionYouTube", "YouTube stream");
    case "custom":
      return t("source.optionCustom", "Custom Activity");
    default:
      return t("source.optionTwitch", "Twitch stream");
  }
}

function getActivitySourceIcon(source) {
  return PRESET_SOURCE_ICONS[normalizeActivitySource(source)] || PRESET_SOURCE_ICONS.twitch;
}

function getYoutubeFallbackLabel(input) {
  const raw = String(input || "").trim();
  if (!raw) return "YouTube";

  if (isHttpUrl(raw)) {
    try {
      const url = new URL(raw);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "channel" && parts[1]) return parts[1];
      if (parts[0] && parts[0].startsWith("@")) return parts[0].slice(1);
      if (parts[0] === "user" && parts[1]) return parts[1];
    } catch {
      // ignore parsing errors
    }
  }

  return raw.replace(/^@/, "");
}

function buildYoutubeFallbackUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (isHttpUrl(raw)) return raw;
  if (/^UC[w-]{20,}$/i.test(raw)) return "https://www.youtube.com/channel/" + raw;
  return "https://www.youtube.com/@" + raw.replace(/^@/, "");
}

function getCustomActivityTypeLabel(type) {
  const normalized = normalizeCustomActivityType(type);
  const keyMap = {
    playing: "custom.activityType.playing",
    listening: "custom.activityType.listening",
    watching: "custom.activityType.watching",
    competing: "custom.activityType.competing"
  };
  const fallbackMap = {
    playing: "Playing",
    listening: "Listening",
    watching: "Watching",
    competing: "Competing"
  };
  return activityT(keyMap[normalized], fallbackMap[normalized]);
}

function getCustomPreviewAppLabel(type, name) {
  const normalized = normalizeCustomActivityType(type);
  const templateMap = {
    playing: activityT("preview.customAppLabel.playing", "Playing {name}"),
    listening: activityT("preview.customAppLabel.listening", "Listening to {name}"),
    watching: activityT("preview.customAppLabel.watching", "Watching {name}"),
    competing: activityT("preview.customAppLabel.competing", "Competing in {name}")
  };
  return (templateMap[normalized] || templateMap.playing).replace("{name}", name);
}

function resolveCustomTimestampData(source) {
  const mode = normalizeCustomTimestampMode(source.customTimestampMode);
  const parsedStart = parseDateTimeValue(source.customTimestampStart);
  let parsedEnd = parseDateTimeValue(source.customTimestampEnd);
  let startIso = null;
  let endIso = null;

  if (mode === "start" || mode === "startEnd") {
    const startMs = Number.isFinite(parsedStart) ? parsedStart : Date.now();
    startIso = new Date(startMs).toISOString();
    if (Number.isFinite(parsedEnd) && parsedEnd <= startMs) {
      parsedEnd = startMs + 1000;
    }
  }

  if ((mode === "end" || mode === "startEnd") && Number.isFinite(parsedEnd)) {
    endIso = new Date(parsedEnd).toISOString();
  }

  return { mode, startIso, endIso };
}

function buildCustomPreviewButtons(form, displayName) {
  const buttons = [];
  if (isHttpUrl(form.customStreamUrl)) {
    buttons.push({
      label: String(form.customButtonOneLabel || activityT("presence.button.openLink", "Open Link")).trim() || activityT("presence.button.openLink", "Open Link"),
      url: form.customStreamUrl
    });
  }

  if (isHttpUrl(form.customButtonTwoUrl)) {
    buttons.push({
      label: String(form.customButtonTwoLabel || activityT("presence.button.openLink", "Open Link")).trim() || activityT("presence.button.openLink", "Open Link"),
      url: form.customButtonTwoUrl
    });
  }

  return buttons.slice(0, 2);
}

function buildFallbackActivityData(useManualPreviewState = true) {
  const form = getFormData();
  const sourceType = getActivitySource();
  const previewLargeImageUrl = isHttpUrl(form.largeImageUrl) ? form.largeImageUrl : "";

  if (sourceType === "youtube") {
    const displayName = getYoutubeFallbackLabel(form.youtubeChannel) || "YouTube";
    const live = useManualPreviewState ? previewMode === "live" : false;

    return {
      sourceType,
      streamerDisplayName: displayName,
      avatarUrl: "",
      previewLargeImageUrl,
      live,
      title: live ? activityT("preview.defaultLiveTitle", "Live now") : "",
      game: live ? activityT("preview.defaultGame", "Streaming") : "",
      viewers: 0,
      streamUrl: buildYoutubeFallbackUrl(form.youtubeChannel),
      startedAt: live ? previewPresenceStartedAt : null
    };
  }

  if (sourceType === "custom") {
    const displayName = String(form.customDisplayName || t("section.customActivity", "Custom Activity")).trim() || t("section.customActivity", "Custom Activity");
    const activityType = normalizeCustomActivityType(form.customActivityType);
    const timestamps = resolveCustomTimestampData(form);
    const customLargeImageUrl = isHttpUrl(form.customLargeImageUrl)
      ? form.customLargeImageUrl
      : (isHttpUrl(form.largeImageUrl) ? form.largeImageUrl : "");

    return {
      sourceType,
      streamerDisplayName: displayName,
      avatarUrl: customLargeImageUrl,
      previewLargeImageUrl: customLargeImageUrl,
      live: true,
      title: String(form.customTitle || "").trim(),
      game: String(form.customGame || "").trim(),
      viewers: 0,
      streamUrl: isHttpUrl(form.customStreamUrl) ? form.customStreamUrl : "",
      startedAt: timestamps.startIso,
      endedAt: timestamps.endIso,
      timestampMode: timestamps.mode,
      buttons: buildCustomPreviewButtons(form, displayName),
      largeText: String(form.customLargeText || displayName).trim() || displayName,
      smallText: String(form.customSmallText || getCustomActivityTypeLabel(activityType)).trim() || getCustomActivityTypeLabel(activityType),
      customActivityType: activityType,
      badgeLabel: getCustomActivityTypeLabel(activityType)
    };
  }

  const streamer = form.streamerLogin || "Streamer";
  const live = useManualPreviewState ? previewMode === "live" : false;

  return {
    sourceType: "twitch",
    streamerDisplayName: streamer,
    avatarUrl: "",
    previewLargeImageUrl,
    live,
    title: live ? activityT("preview.defaultLiveTitle", "Live now") : "",
    game: live ? activityT("preview.defaultGame", "Streaming") : "",
    viewers: 0,
    streamUrl: streamer ? "https://twitch.tv/" + streamer : "",
    startedAt: live ? previewPresenceStartedAt : null
  };
}

function updateSourceModeButtons() {
  const sourceType = getActivitySource();
  const map = {
    twitch: "sourceModeTwitch",
    youtube: "sourceModeYouTube",
    custom: "sourceModeCustom"
  };

  Object.entries(map).forEach(([source, id]) => {
    const node = el(id);
    if (!node) return;
    const active = source === sourceType;
    node.classList.toggle("active", active);
    node.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updatePreviewSwitchAvailability() {
  const switchNode = el("previewLiveSwitch");
  const switchWrap = switchNode?.closest(".preview-switch");
  const isCustomSource = getActivitySource() === "custom";
  if (!switchNode) return;

  if (isCustomSource) {
    previewMode = "live";
    switchNode.checked = true;
  }

  switchNode.disabled = previewAutoMode || isCustomSource;
  if (switchWrap) {
    switchWrap.style.display = isCustomSource ? "none" : "inline-flex";
  }
}

function updateTwitchApiModeUi() {
  const mode = getTwitchApiMode();
  const isOfficial = mode === "official";

  [
    ["twitchApiModeManaged", "managed"],
    ["twitchApiModeOfficial", "official"]
  ].forEach(([id, value]) => {
    const node = el(id);
    if (!node) return;
    const active = mode === value;
    node.classList.toggle("active", active);
    node.setAttribute("aria-pressed", active ? "true" : "false");
  });

  ["field_twitchClientId", "field_twitchClientSecret"].forEach((id) => {
    const field = el(id);
    if (field) field.hidden = !isOfficial;
  });
}

function updateActivitySourceUi() {
  const sourceType = getActivitySource();
  const sourceCards = {
    twitch: "twitchCard",
    youtube: "youtubeCard",
    custom: "customCard"
  };

  Object.entries(sourceCards).forEach(([source, cardId]) => {
    const card = el(cardId);
    if (!card) return;
    card.hidden = source !== sourceType;
  });

  const youtubeHint = el("youtubeQuotaHint");
  if (youtubeHint) {
    youtubeHint.hidden = sourceType !== "youtube";
  }

  updateTwitchApiModeUi();

  const discordInviteField = el("field_discordInviteUrl");
  if (discordInviteField) {
    const shouldHideInvite = sourceType === "custom";
    discordInviteField.hidden = shouldHideInvite;

    const discordInviteInput = el("discordInviteUrl");
    if (discordInviteInput) {
      discordInviteInput.disabled = shouldHideInvite || !dashboardSectionEditState.discord;
    }
  }

  const discordCard = el("discordCard");
  if (discordCard) {
    discordCard.classList.toggle("full", sourceType === "custom");
  }

  const imagesCard = el("imagesCard");
  if (imagesCard) {
    imagesCard.hidden = sourceType === "custom";
  }

  renderCustomActivityTypeSelect();
  renderCustomTimestampModeSelect();
  updateSourceModeButtons();
  updatePreviewSwitchAvailability();
}
function getCurrentPreviewSnapshot() {
  if (previewLiveData) {
    return previewAutoMode
      ? previewLiveData
      : { ...previewLiveData, live: previewMode === "live" };
  }

  return getPreviewFallbackData();
}

function setStreamInfoValue(id, value, tone = "") {
  const node = el(id);
  if (!node) return;

  node.textContent = String(value || "");
  node.classList.remove("live", "offline");
  if (tone) node.classList.add(tone);
}

function setStreamInfoExtraVisible(visible) {
  [
    "streamInfoBroadcasterTypeItem",
    "streamInfoLanguageItem",
    "streamInfoTagsItem",
    "streamInfoCreatedAtItem",
    "streamInfoDescriptionItem"
  ].forEach((id) => {
    const node = el(id);
    if (node) node.hidden = !visible;
  });
}

function updateStreamInfoLabels(source) {
  const sourceType = normalizeActivitySource(source || getActivitySource());
  const isCustomSource = sourceType === "custom";
  const isTwitchSource = sourceType === "twitch";

  setStreamInfoExtraVisible(isTwitchSource);

  el("sectionStreamInfo").textContent = isCustomSource
    ? t("section.activityInfo", "Activity Info")
    : t("section.streamInfo", "Stream Info");

  if (isCustomSource) {
    el("label_streamInfoPresenceStatus").textContent = t("streamInfo.customDisplayName", "Display Name");
    el("label_streamInfoPresetSource").textContent = t("section.source", "Source");
    el("label_streamInfoCurrentViewers").textContent = t("streamInfo.customActivityType", "Activity Type");
    el("label_streamInfoCurrentGame").textContent = t("streamInfo.customDetails", "Details");
    el("label_streamInfoStreamTitle").textContent = t("streamInfo.customState", "State");
    el("label_streamInfoLiveDuration").textContent = t("streamInfo.customTimestamp", "Timestamp");
    el("label_streamInfoStreamStatus").textContent = t("streamInfo.customButtons", "Buttons");
    return;
  }

  el("label_streamInfoPresenceStatus").textContent = t("streamInfo.streamerName", "Streamer Name");
  el("label_streamInfoPresetSource").textContent = t("section.source", "Source");
  el("label_streamInfoCurrentViewers").textContent = t("streamInfo.currentViewers", "Current Viewers");
  el("label_streamInfoCurrentGame").textContent = t("streamInfo.currentGame", "Current Game");
  el("label_streamInfoStreamTitle").textContent = t("streamInfo.streamTitle", "Stream Title");
  el("label_streamInfoLiveDuration").textContent = t("streamInfo.liveDuration", "Live Duration");
  el("label_streamInfoStreamStatus").textContent = t("streamInfo.streamStatus", "Stream Status");

  if (isTwitchSource) {
    el("label_streamInfoBroadcasterType").textContent = t("streamInfo.broadcasterType", "Broadcaster Type");
    el("label_streamInfoLanguage").textContent = t("streamInfo.language", "Language");
    el("label_streamInfoTags").textContent = t("streamInfo.tags", "Tags");
    el("label_streamInfoCreatedAt").textContent = t("streamInfo.createdAt", "Account Created");
    el("label_streamInfoBrandedContent").textContent = t("streamInfo.brandedContent", "Branded Content");
    el("label_streamInfoDescription").textContent = t("streamInfo.description", "Description");
  }
}

function formatStreamInfoDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  try {
    return new Intl.DateTimeFormat(currentLanguage || "en", {
      year: "numeric",
      month: "short",
      day: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function formatBroadcasterType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return t("streamInfo.regularBroadcaster", "Regular");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatBooleanInfo(value) {
  if (value === true) return t("streamInfo.yes", "Yes");
  if (value === false) return t("streamInfo.no", "No");
  return "-";
}

function formatStreamTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return "-";
  return tags.map((tag) => String(tag || "").trim()).filter(Boolean).join(" / ") || "-";
}

function getCustomStreamInfoTimestampValue(preview) {
  const mode = normalizeCustomTimestampMode(preview?.timestampMode || "none");
  const startClock = formatClockTime(preview?.startedAt);
  const endClock = formatClockTime(preview?.endedAt);

  if (mode === "none") {
    return t("custom.timestamp.none", "No timestamp");
  }

  if (mode === "clock") {
    return formatClockTime(new Date(), currentActivityLanguageCode || currentLanguage || "en", true);
  }

  if (mode === "startEnd") {
    const elapsed = preview?.startedAt ? formatLiveDuration(preview.startedAt) : "--";
    const remaining = preview?.endedAt ? formatRemainingDuration(preview.endedAt) : "--";
    const clockRange = [startClock, endClock].filter(Boolean).join(" / ");
    return joinPreviewParts([clockRange, `${elapsed} / ${remaining}`]);
  }

  if (mode === "end") {
    return joinPreviewParts([endClock, preview?.endedAt ? formatRemainingDuration(preview.endedAt) : "--"]);
  }

  return joinPreviewParts([startClock, preview?.startedAt ? formatLiveDuration(preview.startedAt) : "--"]);
}

function getCustomStreamInfoButtonsValue(preview) {
  const displayName = preview?.streamerDisplayName || String(getFormData().customDisplayName || t("section.customActivity", "Custom Activity")).trim() || t("section.customActivity", "Custom Activity");
  const buttons = Array.isArray(preview?.buttons) && preview.buttons.length
    ? preview.buttons
    : buildCustomPreviewButtons(getFormData(), displayName);

  if (!buttons.length) {
    return t("streamInfo.none", "None");
  }

  return buttons
    .map((button) => String(button?.label || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function renderStreamInfo(data) {
  const preview = data || getStreamInfoFallbackData();
  currentStreamInfoData = preview;

  const sourceType = normalizeActivitySource(preview?.sourceType || getActivitySource());
  const presetSource = getActivitySourceLabel(sourceType);
  updateStreamInfoLabels(sourceType);

  if (sourceType === "custom") {
    const displayName = preview.streamerDisplayName || String(getFormData().customDisplayName || t("section.customActivity", "Custom Activity")).trim() || t("section.customActivity", "Custom Activity");
    const activityType = preview.badgeLabel || getCustomActivityTypeLabel(preview.customActivityType);
    const details = preview.title || "-";
    const state = preview.game || "-";
    const timestampValue = getCustomStreamInfoTimestampValue(preview);
    const buttonsValue = getCustomStreamInfoButtonsValue(preview);

    setStreamInfoValue("streamInfoPresenceStatusValue", displayName);
    setStreamInfoValue("streamInfoPresetSourceValue", presetSource);
    setStreamInfoValue("streamInfoCurrentViewersValue", activityType);
    setStreamInfoValue("streamInfoCurrentGameValue", details);
    setStreamInfoValue("streamInfoStreamTitleValue", state);
    setStreamInfoValue("streamInfoLiveDurationValue", timestampValue);
    setStreamInfoValue("streamInfoStreamStatusValue", buttonsValue);
    return;
  }

  const isLive = !!preview?.live;
  const streamerName = preview.streamerDisplayName || getFormData().streamerLogin || "Streamer";
  const currentGame = isLive ? (preview.game || t("preview.defaultGame", "Streaming")) : "-";
  const streamTitle = isLive ? (preview.title || t("preview.defaultLiveTitle", "Live now")) : "-";
  const liveDuration = isLive ? formatLiveDuration(preview.startedAt) : "--";
  const streamStatus = isLive ? t("streamInfo.live", "Live") : t("streamInfo.offline", "Offline");

  setStreamInfoValue("streamInfoPresenceStatusValue", streamerName);
  setStreamInfoValue("streamInfoPresetSourceValue", presetSource);
  setStreamInfoValue("streamInfoCurrentViewersValue", isLive ? formatNumber(preview.viewers || 0) : "0");
  setStreamInfoValue("streamInfoCurrentGameValue", currentGame);
  setStreamInfoValue("streamInfoStreamTitleValue", streamTitle);
  setStreamInfoValue("streamInfoLiveDurationValue", liveDuration);
  setStreamInfoValue("streamInfoStreamStatusValue", streamStatus, isLive ? "live" : "offline");

  if (sourceType === "twitch") {
    setStreamInfoValue("streamInfoBroadcasterTypeValue", formatBroadcasterType(preview.broadcasterType));
    setStreamInfoValue("streamInfoLanguageValue", String(preview.channelLanguage || "-").toUpperCase());
    setStreamInfoValue("streamInfoTagsValue", formatStreamTags(preview.tags));
    setStreamInfoValue("streamInfoCreatedAtValue", formatStreamInfoDate(preview.createdAt));
    setStreamInfoValue("streamInfoBrandedContentValue", formatBooleanInfo(preview.isBrandedContent));
    setStreamInfoValue("streamInfoDescriptionValue", preview.channelDescription || "-");
  }
}

function refreshStreamInfoDuration() {
  const node = el("streamInfoLiveDurationValue");
  if (!node || !currentStreamInfoData) return;

  const sourceType = normalizeActivitySource(currentStreamInfoData.sourceType || getActivitySource());
  if (sourceType === "custom") {
    node.textContent = getCustomStreamInfoTimestampValue(currentStreamInfoData);
    return;
  }

  if (!currentStreamInfoData.live) return;
  node.textContent = formatLiveDuration(currentStreamInfoData.startedAt);
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeOptionVisuals() {
  el("themeOptionDark")?.classList.toggle("active", el("themeDark")?.checked);
  el("themeOptionLight")?.classList.toggle("active", el("themeLight")?.checked);
  el("themeOptionSystem")?.classList.toggle("active", el("themeSystem")?.checked);
}

function getSelectedThemeMode() {
  if (el("themeDark")?.checked) return "dark";
  if (el("themeLight")?.checked) return "light";
  return "system";
}

function setSelectedThemeMode(mode) {
  const safeMode = mode || "dark";
  el("themeDark").checked = safeMode === "dark";
  el("themeLight").checked = safeMode === "light";
  el("themeSystem").checked = safeMode === "system";
  updateThemeOptionVisuals();
}

function resolveThemeMode(mode) {
  return mode === "system" ? getSystemTheme() : mode;
}

function applyZoom(zoomValue) {
  const zoom = Number(zoomValue || 100);
  document.body.style.zoom = `${zoom}%`;
}

function updateZoomSliderVisuals(value) {
  const slider = el("uiZoom");
  if (!slider) return;

  const min = Number(slider.min || 50);
  const max = Number(slider.max || 200);
  const zoom = Number(value || slider.value || 100);
  const clampedZoom = Math.min(max, Math.max(min, zoom));
  const percent = max === min ? 0 : ((clampedZoom - min) / (max - min)) * 100;

  slider.style.setProperty("--zoom-progress", `${percent}%`);
}

function updateZoomLabel(value) {
  const zoom = Number(value || 100);
  el("zoomValueText").textContent = `${zoom}%`;
  updateZoomSliderVisuals(zoom);
}

function getPreviewAppLabel(preview, streamerName) {
  const name = String(streamerName || getFormData().streamerLogin || "Streamer").trim() || "Streamer";
  if (preview?.sourceType === "custom") {
    return getCustomPreviewAppLabel(preview.customActivityType, name);
  }

  const template = preview?.live
    ? activityT("preview.appLabelLive", "Watching {name}")
    : activityT("preview.appLabelOffline", "Listening to {name}");
  return template.replace("{name}", name);
}

function updatePreviewAppLabel(preview, streamerName) {
  const node = el("previewAppLabel");
  if (!node) return;
  node.textContent = getPreviewAppLabel(preview, streamerName);
}

function applyAppTitle(title) {
  const finalTitle = title || "Activity Presence Manager";
  appTitleFromMain = finalTitle;
  document.title = finalTitle;
  if (el("windowTitleText")) el("windowTitleText").textContent = finalTitle;
}

function applyPreviewVisibility(enabled) {
  const sidebar = el("sidebar");
  if (!sidebar) return;

  if (enabled) {
    sidebar.classList.remove("preview-hidden");
  } else {
    sidebar.classList.add("preview-hidden");
  }
}
