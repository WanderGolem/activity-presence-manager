const RPC = require("discord-rpc");
const fetch = require("node-fetch");

const YOUTUBE_OFFLINE_SEARCH_MIN_MS = 15 * 60 * 1000;
const CUSTOM_CLOCK_REFRESH_MS = 1000;
const DEFAULT_TWITCH_API_MODE = "managed";
const MANAGED_TWITCH_STATUS_API_URL = "https://api.activitypresencemanager.com/twitch/status";
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 600;
const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);

class PresenceService {
  constructor({ config, onLog, onStatus }) {
    this.config = {};
    this.onLog = onLog || (() => {});
    this.onStatus = onStatus || (() => {});
    this.rpc = null;
    this.interval = null;
    this.lastKey = null;
    this.running = false;
    this.tokenCache = { token: null, exp: 0 };
    this.activityStartedAtUnix = null;
    this.lastSourceWarningKey = "";
    this.resetSourceCache();

    this.uiFallbackI18n = {
      "presence.log.connected": "Connected to Discord RPC.",
      "presence.log.watching": "Monitoring {name} every {seconds}s.",
      "presence.log.liveDetected": "Live detected: {name} | {title}",
      "presence.log.offlineDetected": "Offline detected: {name}",
      "presence.log.tickError": "Tick error: {message}",
      "presence.log.intervalError": "Interval error: {message}",
      "presence.log.cleared": "Discord presence cleared.",
      "presence.log.usingCachedData": "{source} is temporarily unavailable. Keeping the last known status.",
      "presence.log.usingFallbackData": "{source} is temporarily unavailable. Showing a safe offline fallback.",
      "presence.log.usingOfficialTwitchFallback": "Managed Twitch API is unavailable. Falling back to your own Twitch app.",
      "presence.log.customReady": "Custom activity ready: {name}",
      "presence.log.customApplied": "Custom activity updated: {name}",
      "presence.error.streamerNotFound": "Streamer '{login}' not found",
      "presence.error.youtubeChannelNotFound": "YouTube channel '{channel}' not found",
      "presence.error.requestTimeout": "{service} did not respond in time. Please try again shortly.",
      "presence.error.network": "{service} is unreachable. Please check your connection.",
      "presence.error.rateLimited": "{service} received too many requests. Please wait a moment.",
      "presence.error.http": "{service} responded with HTTP {status}.",
      "presence.error.invalidApiResponse": "{service} returned an unexpected response.",
      "presence.error.managedApiMissingChannel": "Please enter a Twitch channel name.",
      "presence.error.managedApiChannelNotFound": "Twitch channel '{login}' was not found.",
      "presence.error.managedApiUnavailable": "The managed Twitch API is temporarily unavailable.",
      "presence.error.twitchCredentialsRejected": "Twitch rejected the Client ID or Client Secret.",
      "presence.error.twitchUnavailable": "Twitch is temporarily unavailable.",
      "presence.error.youtubeForbidden": "YouTube rejected the API key or channel request.",
      "presence.error.youtubeQuota": "The YouTube API quota is exhausted. Please try again later.",
      "presence.error.youtubeUnavailable": "YouTube is temporarily unavailable.",
      "presence.error.discordUnavailable": "Discord Desktop is not running or Rich Presence could not connect."
    };

    this.activityFallbackI18n = {
      "presence.button.openStream": "Join Stream",
      "presence.button.openLink": "Open Link",
      "presence.button.community": "{name}'s Discord Server",
      "presence.text.liveFallback": "Live",
      "presence.text.offlineDetails": "Waiting for {name}",
      "presence.text.offlineState": "Offline",
      "presence.text.largeText": "Stream",
      "presence.text.smallLive": "Live",
      "presence.text.smallOffline": "Offline",
      "presence.text.viewers": "viewers",
      "preview.defaultLiveTitle": "Live now",
      "preview.defaultOfflineTitle": "Waiting for streamer",
      "preview.defaultGame": "Streaming",
      "preview.noStreamTitle": "No stream title set",
      "source.youtubeLiveLabel": "YouTube Live"
    };

    this.uiI18n = this.uiFallbackI18n;
    this.activityI18n = this.activityFallbackI18n;
    this.nf = this.createNumberFormatter("en-US");
    this.applyConfig(config);
  }

  resetSourceCache() {
    this.sourceCache = {
      twitchUser: null,
      twitchActivityData: null,
      youtubeChannel: null,
      youtubeActivityData: null,
      youtubeLiveVideoId: "",
      youtubeNextOfflineCheckAt: 0
    };
  }

  log(msg) {
    this.onLog(msg);
  }

  status(msg) {
    this.onStatus(msg);
  }

  applyConfig(config = {}) {
    const previous = this.config || {};
    const nextConfig = {
      ...previous,
      ...config
    };

    const resetKeys = [
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
      "customViewers",
      "customStatus",
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
      "largeImageUrl",
      "largeImageKey",
      "smallImageLiveUrl",
      "smallImageLiveKey",
      "smallImageOfflineUrl",
      "smallImageOfflineKey"
    ];

    const shouldResetCache = resetKeys.some((key) => String(previous[key] || "") !== String(nextConfig[key] || ""));
    const shouldResetTokenCache = ["twitchApiMode", "twitchClientId", "twitchClientSecret"].some(
      (key) => String(previous[key] || "") !== String(nextConfig[key] || "")
    );

    this.config = nextConfig;

    this.uiI18n = {
      ...this.uiFallbackI18n,
      ...(this.config.i18n || {})
    };

    this.activityI18n = {
      ...this.activityFallbackI18n,
      ...(this.config.activityI18n || this.config.i18n || {})
    };

    this.nf = this.createNumberFormatter(this.config.activityLanguage || this.config.language);

    if (shouldResetCache) {
      this.resetSourceCache();
    }

    if (shouldResetTokenCache) {
      this.tokenCache = { token: null, exp: 0 };
    }

    if (this.running) {
      this.restartTickInterval();
    }
  }

  createNumberFormatter(language) {
    try {
      return new Intl.NumberFormat(language || "en-US");
    } catch {
      return new Intl.NumberFormat("en-US");
    }
  }

  translate(source, key, replacements = {}, fallback = null) {
    let text = source[key] || fallback || key;
    for (const [rk, rv] of Object.entries(replacements)) {
      text = text.replaceAll(`{${rk}}`, String(rv));
    }
    return text;
  }

  uiT(key, replacements = {}, fallback = null) {
    return this.translate(this.uiI18n, key, replacements, fallback);
  }

  activityT(key, replacements = {}, fallback = null) {
    return this.translate(this.activityI18n, key, replacements, fallback);
  }

  s(v, fb = "", max = 128) {
    let out = (v ?? "").toString().replace(/\r|\n/g, " ").trim();
    if (!out) out = fb;
    return out.slice(0, max);
  }

  isUrl(v) {
    return /^https?:\/\//i.test(v || "");
  }

  unixts(dateIso) {
    const ms = Date.parse(dateIso);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  }

  formatClockTime(value, includeSeconds = false) {
    if (!value) return "";

    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";

    try {
      return new Intl.DateTimeFormat(this.config.activityLanguage || this.config.language || "en-GB", {
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

  possessive(name) {
    const n = (name || "").trim();
    return /s$/i.test(n) ? `${n}'` : `${n}s`;
  }

  normalizeSource(source = this.config.activitySource) {
    const normalized = String(source || "twitch").trim().toLowerCase();
    return ["twitch", "youtube", "custom"].includes(normalized) ? normalized : "twitch";
  }

  normalizeTwitchApiMode(mode = this.config.twitchApiMode) {
    const normalized = String(mode || DEFAULT_TWITCH_API_MODE).trim().toLowerCase();
    return normalized === "official" ? "official" : DEFAULT_TWITCH_API_MODE;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  createPresenceError(code, message, details = {}) {
    const err = new Error(message);
    err.code = code;
    err.status = details.status;
    err.retryable = !!details.retryable;
    err.isPresenceError = true;
    return err;
  }

  isRetryableError(err) {
    if (!err) return false;
    if (typeof err.retryable === "boolean") return err.retryable;
    return RETRYABLE_HTTP_STATUS.has(Number(err.status || 0));
  }

  getServiceLabel(type, fallback = "API") {
    const labels = {
      managedTwitch: "Managed Twitch API",
      twitchAuth: "Twitch",
      twitch: "Twitch",
      youtube: "YouTube"
    };
    return labels[type] || fallback;
  }

  normalizeRequestError(err, context = {}) {
    if (err?.isPresenceError) return err;

    const service = context.service || this.getServiceLabel(context.type);
    const name = String(err?.name || "");
    const type = String(err?.type || err?.code || "");

    if (name === "AbortError" || type === "aborted") {
      return this.createPresenceError(
        "request_timeout",
        this.uiT("presence.error.requestTimeout", { service }, `${service} did not respond in time.`),
        { retryable: true }
      );
    }

    return this.createPresenceError(
      "network_error",
      this.uiT("presence.error.network", { service }, `${service} is unreachable.`),
      { retryable: true }
    );
  }

  async fetchWithTimeout(url, options = {}, context = {}) {
    const timeoutMs = Number(context.timeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async readJsonResponse(res, context = {}) {
    try {
      return await res.json();
    } catch {
      const service = context.service || this.getServiceLabel(context.type);
      throw this.createPresenceError(
        "invalid_api_response",
        this.uiT("presence.error.invalidApiResponse", { service }, `${service} returned an unexpected response.`),
        { status: res.status, retryable: res.status >= 500 }
      );
    }
  }

  getYouTubeErrorReason(json) {
    const reasons = json?.error?.errors || [];
    return String(reasons[0]?.reason || json?.error?.status || json?.error?.message || "").toLowerCase();
  }

  createManagedApiError(status, json, context = {}) {
    const code = String(json?.error?.code || "").toUpperCase();
    const service = context.service || this.getServiceLabel(context.type);
    const login = context.login || this.s(this.config.streamerLogin, "", 64);

    if (code === "MISSING_CHANNEL") {
      return this.createPresenceError(
        "managed_twitch_missing_channel",
        this.uiT("presence.error.managedApiMissingChannel", {}, "Please enter a Twitch channel name."),
        { status, retryable: false }
      );
    }

    if (code === "CHANNEL_NOT_FOUND") {
      return this.createPresenceError(
        "managed_twitch_channel_not_found",
        this.uiT("presence.error.managedApiChannelNotFound", { login }, `Twitch channel '${login}' was not found.`),
        { status, retryable: false }
      );
    }

    if (code === "RATE_LIMITED") {
      return this.createPresenceError(
        "rate_limited",
        this.uiT("presence.error.rateLimited", { service }, `${service} received too many requests.`),
        { status: status || 429, retryable: true }
      );
    }

    if (code.startsWith("TWITCH_")) {
      return this.createPresenceError(
        `managed_${code.toLowerCase()}`,
        this.uiT("presence.error.managedApiUnavailable", {}, "The managed Twitch API is temporarily unavailable."),
        { status, retryable: true }
      );
    }

    const message = json?.error?.message || this.uiT("presence.error.managedApiUnavailable", {}, "The managed Twitch API is temporarily unavailable.");
    return this.createPresenceError("managed_twitch_error", message, { status, retryable: status >= 500 });
  }

  createHttpError(status, json, context = {}) {
    const service = context.service || this.getServiceLabel(context.type);

    if (context.type === "managedTwitch" && json?.success === false) {
      return this.createManagedApiError(status, json, context);
    }

    if (status === 429) {
      return this.createPresenceError(
        "rate_limited",
        this.uiT("presence.error.rateLimited", { service }, `${service} received too many requests.`),
        { status, retryable: true }
      );
    }

    if (context.type === "twitchAuth" && (status === 400 || status === 401 || status === 403)) {
      return this.createPresenceError(
        "twitch_credentials_rejected",
        this.uiT("presence.error.twitchCredentialsRejected", {}, "Twitch rejected the Client ID or Client Secret."),
        { status, retryable: false }
      );
    }

    if (context.type === "youtube" && (status === 400 || status === 401 || status === 403)) {
      const reason = this.getYouTubeErrorReason(json);
      const quotaExceeded = /quota|dailylimit|ratelimit/.test(reason);
      return this.createPresenceError(
        quotaExceeded ? "youtube_quota_exceeded" : "youtube_forbidden",
        quotaExceeded
          ? this.uiT("presence.error.youtubeQuota", {}, "The YouTube API quota is exhausted. Please try again later.")
          : this.uiT("presence.error.youtubeForbidden", {}, "YouTube rejected the API key or channel request."),
        { status, retryable: quotaExceeded }
      );
    }

    if (status >= 500) {
      const key = context.type === "youtube"
        ? "presence.error.youtubeUnavailable"
        : context.type === "managedTwitch"
          ? "presence.error.managedApiUnavailable"
          : "presence.error.twitchUnavailable";
      return this.createPresenceError(
        "service_unavailable",
        this.uiT(key, {}, `${service} is temporarily unavailable.`),
        { status, retryable: true }
      );
    }

    return this.createPresenceError(
      "http_error",
      this.uiT("presence.error.http", { service, status }, `${service} responded with HTTP ${status}.`),
      { status, retryable: RETRYABLE_HTTP_STATUS.has(status) }
    );
  }

  async fetchJson(url, options = {}, context = {}) {
    const retries = Math.max(0, Number(context.retries ?? DEFAULT_FETCH_RETRIES));
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await this.fetchWithTimeout(url, options, context);
        const json = await this.readJsonResponse(res, context);

        if (!res.ok) {
          throw this.createHttpError(res.status, json, context);
        }

        return json;
      } catch (err) {
        lastError = this.normalizeRequestError(err, context);
        if (attempt >= retries || !this.isRetryableError(lastError)) {
          throw lastError;
        }

        await this.sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }

    throw lastError;
  }

  logSourceWarningOnce(key, message) {
    if (this.lastSourceWarningKey === key) return;
    this.lastSourceWarningKey = key;
    this.log(message);
  }

  clearSourceWarning() {
    this.lastSourceWarningKey = "";
  }

  resolveSourceFallback(sourceType, err, fallbackBuilder) {
    if (!this.isRetryableError(err)) {
      throw err;
    }

    const cacheKey = `${sourceType}ActivityData`;
    const cached = this.sourceCache[cacheKey];
    const sourceLabel = sourceType === "youtube" ? "YouTube" : "Twitch";

    if (cached) {
      this.logSourceWarningOnce(
        `${sourceType}-cached`,
        this.uiT(
          "presence.log.usingCachedData",
          { source: sourceLabel },
          `${sourceLabel} is temporarily unavailable. Keeping the last known status.`
        )
      );
      return cached;
    }

    this.logSourceWarningOnce(
      `${sourceType}-fallback`,
      this.uiT(
        "presence.log.usingFallbackData",
        { source: sourceLabel },
        `${sourceLabel} is temporarily unavailable. Showing a safe offline fallback.`
      )
    );
    return fallbackBuilder();
  }

  normalizeCustomActivityType(type = this.config.customActivityType) {
    const normalized = String(type || "playing").trim().toLowerCase();
    return ["playing", "listening", "watching", "competing"].includes(normalized)
      ? normalized
      : "playing";
  }

  normalizeCustomTimestampMode(mode = this.config.customTimestampMode) {
    const normalized = String(mode || "none").trim();
    return ["none", "start", "end", "startEnd", "clock"].includes(normalized)
      ? normalized
      : "none";
  }

  getCustomActivityTypeCode(type = this.normalizeCustomActivityType()) {
    const map = {
      playing: 0,
      listening: 2,
      watching: 3,
      competing: 5
    };
    return map[this.normalizeCustomActivityType(type)] ?? 0;
  }

  getCustomActivityTypeLabel(type = this.normalizeCustomActivityType()) {
    const normalized = this.normalizeCustomActivityType(type);
    const fallbacks = {
      playing: "Playing",
      listening: "Listening",
      watching: "Watching",
      competing: "Competing"
    };
    return this.activityT(`custom.activityType.${normalized}`, {}, fallbacks[normalized] || "Playing");
  }

  parseCustomTimestamp(value) {
    const raw = this.s(value, "", 64);
    if (!raw) return null;

    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }

  resolveCustomTimestamps() {
    const mode = this.normalizeCustomTimestampMode();
    const configuredStart = this.parseCustomTimestamp(this.config.customTimestampStart);
    const configuredEnd = this.parseCustomTimestamp(this.config.customTimestampEnd);

    let startUnix = null;
    let endUnix = null;

    if (mode === "start" || mode === "startEnd") {
      startUnix = Number.isFinite(configuredStart)
        ? configuredStart
        : this.getActivityTimestamp();
    }

    if (mode === "end" || mode === "startEnd") {
      endUnix = Number.isFinite(configuredEnd) ? configuredEnd : null;
    }

    if (Number.isFinite(startUnix) && Number.isFinite(endUnix) && endUnix <= startUnix) {
      endUnix = startUnix + 1;
    }

    return { mode, startUnix, endUnix };
  }

  getCustomClockText() {
    return this.formatClockTime(new Date(), false);
  }

  getCustomClockKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  }

  getActiveTickIntervalMs() {
    if (this.normalizeSource() === "custom") {
      return this.normalizeCustomTimestampMode() === "clock" ? CUSTOM_CLOCK_REFRESH_MS : null;
    }

    return this.checkMs;
  }

  restartTickInterval() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (!this.running) return;

    const intervalMs = this.getActiveTickIntervalMs();
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;

    this.interval = setInterval(() => {
      this.tick().catch((err) => {
        this.log(this.uiT("presence.log.intervalError", { message: err.message }, `Interval error: ${err.message}`));
      });
    }, intervalMs);
  }

  get checkMs() {
    return Math.max(5, parseInt(this.config.checkIntervalSec, 10) || 30) * 1000;
  }

  get youtubeOfflineCheckMs() {
    return Math.max(this.checkMs, YOUTUBE_OFFLINE_SEARCH_MIN_MS);
  }

  getConfiguredActivityStartUnix() {
    return this.unixts(this.config.activityStartedAt);
  }

  getActivityTimestamp(startUnix) {
    if (Number.isFinite(startUnix)) return startUnix;

    const configuredStart = this.getConfiguredActivityStartUnix();
    if (Number.isFinite(configuredStart)) return configuredStart;

    if (Number.isFinite(this.activityStartedAtUnix)) return this.activityStartedAtUnix;
    return Math.floor(Date.now() / 1000);
  }

  buildViewerText(viewers) {
    const viewersWord = this.activityT(
      "preview.viewers",
      {},
      this.activityT("presence.text.viewers", {}, "viewers")
    );

    return `${this.nf.format(Math.max(0, Number(viewers) || 0))} ${viewersWord}`;
  }

  buildLiveState(displayName, game, viewers) {
    const parts = [];
    const safeName = this.s(displayName, "Streamer", 64);
    const safeGame = this.s(game, "", 48);

    if (safeName) parts.push(safeName);
    if (safeGame) parts.push(safeGame);
    parts.push(this.buildViewerText(viewers));

    return this.s(parts.filter(Boolean).join(" - "), this.buildViewerText(viewers), 128);
  }

  buildOfflineState(offlineTitle) {
    return this.s(
      offlineTitle,
      this.activityT(
        "preview.noStreamTitle",
        {},
        this.activityT("presence.text.offlineState", {}, "Offline")
      ),
      128
    );
  }

  buildButtons(displayName, primaryUrl) {
    const buttons = [];
    const primaryLabel = this.activityT("presence.button.openStream", {}, "Join Stream");

    if (this.isUrl(primaryUrl)) {
      buttons.push({
        label: this.s(primaryLabel, "Open", 32),
        url: primaryUrl
      });
    }

    if (this.isUrl(this.config.discordInviteUrl)) {
      buttons.push({
        label: this.s(
          this.activityT("presence.button.community", { name: displayName }, `${this.possessive(displayName)} Discord Server`),
          `${this.possessive(displayName)} Discord Server`,
          32
        ),
        url: this.config.discordInviteUrl
      });
    }

    return buttons.slice(0, 2);
  }

  buildCustomButtons(displayName) {
    const buttons = [];
    const primaryUrl = this.isUrl(this.config.customStreamUrl) ? this.config.customStreamUrl : "";
    const primaryLabel = this.s(
      this.config.customButtonOneLabel,
      this.activityT("presence.button.openLink", {}, "Open Link"),
      32
    );

    if (primaryUrl) {
      buttons.push({
        label: primaryLabel,
        url: primaryUrl
      });
    }

    const secondaryUrl = this.isUrl(this.config.customButtonTwoUrl) ? this.config.customButtonTwoUrl : "";
    const secondaryLabel = this.s(
      this.config.customButtonTwoLabel,
      this.activityT("presence.button.openLink", {}, "Open Link"),
      32
    );

    if (secondaryUrl) {
      buttons.push({
        label: secondaryLabel,
        url: secondaryUrl
      });
    }

    return buttons.slice(0, 2);
  }

  resolveActivityDataButtons(sourceType, displayName, streamUrl, buttons) {
    if (Array.isArray(buttons) && buttons.length) {
      return buttons.slice(0, 2);
    }

    if (sourceType === "custom") {
      return [];
    }

    return this.buildButtons(displayName, streamUrl);
  }

  resolveLargeImage(primaryImageUrl) {
    return (
      (this.isUrl(this.config.largeImageUrl) && this.config.largeImageUrl) ||
      (this.isUrl(primaryImageUrl) && primaryImageUrl) ||
      this.config.largeImageKey ||
      undefined
    );
  }

  resolveCustomLargeImage() {
    return (
      (this.isUrl(this.config.customLargeImageUrl) && this.config.customLargeImageUrl) ||
      this.config.customLargeImageKey ||
      this.resolveLargeImage("")
    );
  }

  resolveCustomSmallImage() {
    return (
      (this.isUrl(this.config.customSmallImageUrl) && this.config.customSmallImageUrl) ||
      this.config.customSmallImageKey ||
      undefined
    );
  }

  buildDefaultStreamStatusImageDataUri(isLive) {
    return isLive
      ? "https://www.dropbox.com/scl/fi/p51kr59v381326jj2cv1j/small_image_live.png?rlkey=g4id7mdqsxp2aj67lweyl06mp&st=7i8x1nxx&raw=1"
      : "https://www.dropbox.com/scl/fi/0r2wi0736avrhdw1n7ywq/small_image_offline.png?rlkey=svzpuijqh6f3y6bcxbaszxs74&st=93fuxo89&raw=1";
  }

  resolveSmallImage(isLive, { allowFallback = false } = {}) {
    if (isLive) {
      const value = (
        (this.isUrl(this.config.smallImageLiveUrl) && this.config.smallImageLiveUrl) ||
        this.config.smallImageLiveKey ||
        undefined
      );
      if (value) return value;
      return allowFallback && this.config.useDefaultStreamStatusImage !== false
        ? this.buildDefaultStreamStatusImageDataUri(true)
        : undefined;
    }

    const value = (
      (this.isUrl(this.config.smallImageOfflineUrl) && this.config.smallImageOfflineUrl) ||
      this.config.smallImageOfflineKey ||
      undefined
    );
    if (value) return value;
    return allowFallback && this.config.useDefaultStreamStatusImage !== false
      ? this.buildDefaultStreamStatusImageDataUri(false)
      : undefined;
  }

  buildActivityData({
    sourceType,
    displayName,
    avatarUrl = "",
    live = false,
    title = "",
    game = "",
    viewers = 0,
    streamUrl = "",
    startedAt = null,
    startedAtUnix = null,
    previewLargeImageUrl = "",
    buttons = [],
    largeText = "",
    smallText = "",
    customActivityType = "",
    badgeLabel = "",
    endedAt = null,
    endedAtUnix = null,
    timestampMode = "none",
    userId = "",
    channelDescription = "",
    offlineImage = "",
    broadcasterType = "",
    createdAt = null,
    channelLanguage = "",
    tags = [],
    isBrandedContent = null
  }) {
    return {
      sourceType,
      streamerDisplayName: this.s(displayName, "Streamer", 64),
      avatarUrl: avatarUrl || "",
      previewLargeImageUrl: previewLargeImageUrl || "",
      live: !!live,
      title: this.s(title, "", 128),
      game: this.s(game, "", 128),
      viewers: Math.max(0, Number(viewers) || 0),
      streamUrl: this.isUrl(streamUrl) ? streamUrl : "",
      startedAt: startedAt || null,
      startedAtUnix: Number.isFinite(startedAtUnix) ? startedAtUnix : this.unixts(startedAt),
      endedAt: endedAt || null,
      endedAtUnix: Number.isFinite(endedAtUnix) ? endedAtUnix : this.unixts(endedAt),
      buttons: this.resolveActivityDataButtons(sourceType, displayName, streamUrl, buttons),
      largeText: this.s(largeText, "", 128),
      smallText: this.s(smallText, "", 128),
      customActivityType: this.s(customActivityType, "", 32),
      badgeLabel: this.s(badgeLabel, "", 32),
      timestampMode: this.s(timestampMode, "none", 32),
      userId: this.s(userId, "", 64),
      channelDescription: this.s(channelDescription, "", 280),
      offlineImage: this.isUrl(offlineImage) ? offlineImage : "",
      broadcasterType: this.s(broadcasterType, "", 32),
      createdAt: createdAt || null,
      channelLanguage: this.s(channelLanguage, "", 16),
      tags: Array.isArray(tags) ? tags.map((tag) => this.s(tag, "", 32)).filter(Boolean).slice(0, 10) : [],
      isBrandedContent: typeof isBrandedContent === "boolean" ? isBrandedContent : null
    };
  }

  buildFallbackActivityData(sourceType = this.normalizeSource()) {
    const twitchLogin = this.s(this.config.streamerLogin, "Streamer", 64);
    const youtubeChannel = this.s(this.config.youtubeChannel, "YouTube", 64);
    const customName = this.getCustomDisplayName();

    if (sourceType === "youtube") {
      return this.buildActivityData({
        sourceType,
        displayName: youtubeChannel || "YouTube",
        streamUrl: this.buildYouTubeFallbackUrl(this.config.youtubeChannel)
      });
    }

    if (sourceType === "custom") {
      return this.buildCustomActivityData();
    }

    return this.buildActivityData({
      sourceType: "twitch",
      displayName: twitchLogin || customName,
      streamUrl: twitchLogin ? `https://twitch.tv/${twitchLogin}` : ""
    });
  }

  getCustomDisplayName() {
    return this.s(this.config.customDisplayName, this.s(this.config.streamerLogin, "Streamer", 64), 64);
  }

  buildCustomActivityData() {
    const displayName = this.getCustomDisplayName();
    const activityType = this.normalizeCustomActivityType();
    const timestamps = this.resolveCustomTimestamps();
    const customLargeImage = this.isUrl(this.config.customLargeImageUrl) ? this.config.customLargeImageUrl : "";

    return this.buildActivityData({
      sourceType: "custom",
      displayName,
      avatarUrl: customLargeImage || (this.isUrl(this.config.largeImageUrl) ? this.config.largeImageUrl : ""),
      previewLargeImageUrl: customLargeImage || (this.isUrl(this.config.largeImageUrl) ? this.config.largeImageUrl : ""),
      live: true,
      title: this.config.customTitle || "",
      game: this.config.customGame || "",
      viewers: 0,
      streamUrl: this.config.customStreamUrl || "",
      startedAt: Number.isFinite(timestamps.startUnix) ? new Date(timestamps.startUnix * 1000).toISOString() : null,
      startedAtUnix: timestamps.startUnix,
      endedAt: Number.isFinite(timestamps.endUnix) ? new Date(timestamps.endUnix * 1000).toISOString() : null,
      endedAtUnix: timestamps.endUnix,
      timestampMode: timestamps.mode,
      buttons: this.buildCustomButtons(displayName),
      largeText: this.config.customLargeText || displayName,
      smallText: this.config.customSmallText || this.getCustomActivityTypeLabel(activityType),
      customActivityType: activityType,
      badgeLabel: this.getCustomActivityTypeLabel(activityType)
    });
  }

  async getAppToken() {
    const now = Date.now() / 1000;
    if (this.tokenCache.token && now < this.tokenCache.exp - 30) {
      return this.tokenCache.token;
    }

    const js = await this.fetchJson("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.twitchClientId,
        client_secret: this.config.twitchClientSecret,
        grant_type: "client_credentials"
      })
    }, {
      type: "twitchAuth",
      service: "Twitch",
      retries: 1
    });

    if (!js?.access_token) {
      throw this.createPresenceError(
        "invalid_api_response",
        this.uiT("presence.error.invalidApiResponse", { service: "Twitch" }, "Twitch returned an unexpected response."),
        { retryable: true }
      );
    }

    this.tokenCache.token = js.access_token;
    this.tokenCache.exp = Math.floor(Date.now() / 1000) + (js.expires_in || 3600);
    return this.tokenCache.token;
  }

  async fetchManagedTwitchStatus(login) {
    const url = new URL(MANAGED_TWITCH_STATUS_API_URL);
    url.searchParams.set("channel", login);

    const json = await this.fetchJson(url.toString(), {}, {
      type: "managedTwitch",
      service: "Managed Twitch API",
      login,
      retries: 2
    });

    if (json && typeof json === "object" && json.success === false) {
      throw this.createManagedApiError(200, json, {
        type: "managedTwitch",
        service: "Managed Twitch API",
        login
      });
    }

    if (json && typeof json === "object" && json.success === true && json.data && typeof json.data === "object") {
      return json.data;
    }

    if (json && typeof json === "object" && json.success === true) {
      throw this.createPresenceError(
        "invalid_api_response",
        this.uiT("presence.error.invalidApiResponse", { service: "Managed Twitch API" }, "Managed Twitch API returned an unexpected response."),
        { retryable: true }
      );
    }

    return json;
  }

  async resolveManagedTwitchActivityData(login) {
    const data = await this.fetchManagedTwitchStatus(login);
    const displayName = this.s(data.display_name || data.channel || login, login || "Streamer", 64);
    const streamUrl = this.isUrl(data.url) ? data.url : `https://twitch.tv/${login}`;
    const startedAt = data.started_at || data.startedAt || null;
    const previewImage = data.profile_image || "";

    const activityData = this.buildActivityData({
      sourceType: "twitch",
      displayName,
      avatarUrl: previewImage,
      previewLargeImageUrl: previewImage,
      live: !!data.live,
      title: data.title || "",
      game: data.game || "",
      viewers: Number(data.viewer_count || data.viewers || 0),
      streamUrl,
      startedAt,
      startedAtUnix: this.unixts(startedAt),
      userId: data.user_id || "",
      channelDescription: data.description || "",
      offlineImage: data.offline_image || "",
      broadcasterType: data.broadcaster_type || "",
      createdAt: data.created_at || null,
      channelLanguage: data.language || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      isBrandedContent: typeof data.is_branded_content === "boolean"
        ? data.is_branded_content
        : null
    });
    this.sourceCache.twitchActivityData = activityData;
    this.clearSourceWarning();
    return activityData;
  }

  async tFetch(endpoint, params = {}) {
    const token = await this.getAppToken();
    const url = new URL(`https://api.twitch.tv/helix/${endpoint}`);

    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const js = await this.fetchJson(url.toString(), {
      headers: {
        "Client-ID": this.config.twitchClientId,
        Authorization: `Bearer ${token}`
      }
    }, {
      type: "twitch",
      service: "Twitch",
      retries: 2
    });

    return js;
  }

  async getUser(login) {
    const js = await this.tFetch("users", { login });

    if (!js.data || !js.data.length) {
      throw new Error(
        this.uiT("presence.error.streamerNotFound", { login }, `Streamer '${login}' not found`)
      );
    }

    return js.data[0];
  }

  async getTwitchUser() {
    const login = this.s(this.config.streamerLogin, "", 64);
    if (!login) {
      throw new Error(this.uiT("presence.error.streamerNotFound", { login }, "Streamer not found"));
    }

    if (this.sourceCache.twitchUser && this.sourceCache.twitchUser.login === login) {
      return this.sourceCache.twitchUser;
    }

    const user = await this.getUser(login);
    this.sourceCache.twitchUser = user;
    return user;
  }

  async getStream(userId) {
    const js = await this.tFetch("streams", { user_id: userId });

    if (!js.data || !js.data.length) {
      return { live: false, title: null, game: null, startedAt: null, viewers: 0 };
    }

    const sdata = js.data[0];
    return {
      live: true,
      title: sdata.title || null,
      game: sdata.game_name || null,
      startedAt: this.unixts(sdata.started_at),
      viewers: Number(sdata.viewer_count || 0)
    };
  }

  async getChannelInfo(userId) {
    const js = await this.tFetch("channels", { broadcaster_id: userId });
    const c = js.data?.[0];
    return c
      ? {
          title: c.title || null,
          game: c.game_name || null,
          language: c.broadcaster_language || "",
          tags: Array.isArray(c.tags) ? c.tags : [],
          isBrandedContent: typeof c.is_branded_content === "boolean" ? c.is_branded_content : null
        }
      : { title: null, game: null, language: "", tags: [], isBrandedContent: null };
  }

  async resolveOfficialTwitchActivityData(login) {
    const user = await this.getTwitchUser();
    const stream = await this.getStream(user.id);

    let channelTitle = "";
    let channelGame = "";
    let channelLanguage = "";
    let channelTags = [];
    let isBrandedContent = null;
    try {
      const channel = await this.getChannelInfo(user.id);
      channelTitle = channel.title || "";
      channelGame = channel.game || "";
      channelLanguage = channel.language || "";
      channelTags = channel.tags || [];
      isBrandedContent = channel.isBrandedContent;
    } catch {
      // ignore channel fallback errors
    }

    const activityData = this.buildActivityData({
      sourceType: "twitch",
      displayName: user.display_name || login,
      avatarUrl: user.profile_image_url || "",
      live: !!stream.live,
      title: stream.title || channelTitle || "",
      game: stream.game || channelGame || "",
      viewers: stream.viewers || 0,
      streamUrl: `https://twitch.tv/${login}`,
      startedAt: Number.isFinite(stream.startedAt) ? new Date(stream.startedAt * 1000).toISOString() : null,
      startedAtUnix: stream.startedAt,
      userId: user.id || "",
      channelDescription: user.description || "",
      offlineImage: user.offline_image_url || "",
      broadcasterType: user.broadcaster_type || user.type || "",
      createdAt: user.created_at || null,
      channelLanguage,
      tags: channelTags,
      isBrandedContent
    });
    this.sourceCache.twitchActivityData = activityData;
    this.clearSourceWarning();
    return activityData;
  }

  async resolveTwitchActivityData() {
    const login = this.s(this.config.streamerLogin, "", 64);
    if (!login) {
      return this.buildFallbackActivityData("twitch");
    }

    const clientId = this.s(this.config.twitchClientId, "", 128);
    const clientSecret = this.s(this.config.twitchClientSecret, "", 128);
    const hasOfficialCredentials = !!clientId && !!clientSecret;

    if (this.normalizeTwitchApiMode() !== "official") {
      try {
        return await this.resolveManagedTwitchActivityData(login);
      } catch (err) {
        if (hasOfficialCredentials && this.isRetryableError(err)) {
          this.logSourceWarningOnce(
            `managed-official-${login}`,
            this.uiT(
              "presence.log.usingOfficialTwitchFallback",
              {},
              "Managed Twitch API is unavailable. Falling back to your own Twitch app."
            )
          );
          return this.resolveOfficialTwitchActivityData(login);
        }

        return this.resolveSourceFallback("twitch", err, () => this.buildFallbackActivityData("twitch"));
      }
    }

    if (!hasOfficialCredentials) {
      return this.buildFallbackActivityData("twitch");
    }

    try {
      return await this.resolveOfficialTwitchActivityData(login);
    } catch (err) {
      return this.resolveSourceFallback("twitch", err, () => this.buildFallbackActivityData("twitch"));
    }
  }

  async yFetch(endpoint, params = {}) {
    const apiKey = this.s(this.config.youtubeApiKey, "", 256);
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    url.searchParams.set("key", apiKey);

    Object.entries(params).forEach(([k, v]) => {
      if (typeof v !== "undefined" && v !== null && String(v) !== "") {
        url.searchParams.set(k, v);
      }
    });

    return this.fetchJson(url.toString(), {}, {
      type: "youtube",
      service: "YouTube",
      retries: 2
    });
  }

  parseYouTubeChannelInput(input) {
    const raw = this.s(input, "", 256);
    if (!raw) return { channelId: "", handle: "", username: "", url: "" };

    try {
      if (this.isUrl(raw)) {
        const url = new URL(raw);
        const parts = url.pathname.split("/").filter(Boolean);

        if (parts[0] === "channel" && parts[1]) {
          return { channelId: parts[1], handle: "", username: "", url: raw };
        }

        if (parts[0] && parts[0].startsWith("@")) {
          return { channelId: "", handle: parts[0], username: "", url: raw };
        }

        if (parts[0] === "user" && parts[1]) {
          return { channelId: "", handle: "", username: parts[1], url: raw };
        }
      }
    } catch {
      // ignore URL parsing errors
    }

    if (/^UC[\w-]{20,}$/i.test(raw)) {
      return { channelId: raw, handle: "", username: "", url: `https://www.youtube.com/channel/${raw}` };
    }

    if (raw.startsWith("@")) {
      return { channelId: "", handle: raw, username: "", url: `https://www.youtube.com/${raw}` };
    }

    return {
      channelId: "",
      handle: raw,
      username: raw,
      url: `https://www.youtube.com/@${raw.replace(/^@/, "")}`
    };
  }

  buildYouTubeFallbackUrl(input) {
    return this.parseYouTubeChannelInput(input).url || "";
  }

  mapYouTubeChannel(item, fallbackInput = "") {
    if (!item) return null;

    const thumbs = item.snippet?.thumbnails || {};
    const avatar = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";

    return {
      id: item.id || "",
      displayName: item.snippet?.title || this.s(fallbackInput, "YouTube", 64),
      avatarUrl: avatar,
      url: item.id ? `https://www.youtube.com/channel/${item.id}` : this.buildYouTubeFallbackUrl(fallbackInput)
    };
  }

  async resolveYouTubeChannel(input) {
    const parsed = this.parseYouTubeChannelInput(input);

    if (this.sourceCache.youtubeChannel) {
      const cached = this.sourceCache.youtubeChannel;
      const sameChannelId = parsed.channelId && cached.id === parsed.channelId;
      const sameHandle = parsed.handle && String(cached.handle || "").toLowerCase() === String(parsed.handle).toLowerCase();
      const sameUsername = parsed.username && String(cached.username || "").toLowerCase() === String(parsed.username).toLowerCase();
      if (sameChannelId || sameHandle || sameUsername) {
        return cached;
      }
    }

    const lookups = [];
    if (parsed.channelId) lookups.push({ id: parsed.channelId });
    if (parsed.handle) lookups.push({ forHandle: parsed.handle });
    if (parsed.username) lookups.push({ forUsername: parsed.username });

    for (const params of lookups) {
      const js = await this.yFetch("channels", {
        part: "snippet",
        ...params
      });

      const item = js.items?.[0];
      if (!item) continue;

      const channel = this.mapYouTubeChannel(item, input);
      if (!channel) continue;

      channel.handle = parsed.handle || "";
      channel.username = parsed.username || "";
      this.sourceCache.youtubeChannel = channel;
      return channel;
    }

    throw new Error(
      this.uiT("presence.error.youtubeChannelNotFound", { channel: input }, `YouTube channel '${input}' not found`)
    );
  }

  async getYouTubeVideo(videoId) {
    if (!videoId) return null;

    const js = await this.yFetch("videos", {
      part: "snippet,liveStreamingDetails",
      id: videoId
    });

    return js.items?.[0] || null;
  }

  isYouTubeVideoLive(video) {
    if (!video) return false;

    const broadcastState = String(video.snippet?.liveBroadcastContent || "").toLowerCase();
    if (broadcastState && broadcastState !== "live") return false;
    if (video.liveStreamingDetails?.actualEndTime) return false;

    return true;
  }

  async searchYouTubeLiveVideo(channelId) {
    const js = await this.yFetch("search", {
      part: "snippet",
      channelId,
      eventType: "live",
      type: "video",
      maxResults: 1
    });

    const videoId = js.items?.[0]?.id?.videoId || "";
    if (!videoId) return null;

    this.sourceCache.youtubeLiveVideoId = videoId;
    return this.getYouTubeVideo(videoId);
  }

  async getYouTubeLiveVideo(channelId, { forceSearch = false } = {}) {
    const now = Date.now();

    if (this.sourceCache.youtubeLiveVideoId) {
      const activeVideo = await this.getYouTubeVideo(this.sourceCache.youtubeLiveVideoId);
      if (this.isYouTubeVideoLive(activeVideo)) {
        return activeVideo;
      }

      this.sourceCache.youtubeLiveVideoId = "";
    }

    if (!forceSearch && now < this.sourceCache.youtubeNextOfflineCheckAt) {
      return null;
    }

    this.sourceCache.youtubeNextOfflineCheckAt = now + this.youtubeOfflineCheckMs;
    const liveVideo = await this.searchYouTubeLiveVideo(channelId);
    return this.isYouTubeVideoLive(liveVideo) ? liveVideo : null;
  }

  async resolveYouTubeActivityData(options = {}) {
    const identifier = this.s(this.config.youtubeChannel, "", 256);
    const apiKey = this.s(this.config.youtubeApiKey, "", 256);

    if (!identifier || !apiKey) {
      return this.buildFallbackActivityData("youtube");
    }

    const channel = await this.resolveYouTubeChannel(identifier);
    const liveVideo = await this.getYouTubeLiveVideo(channel.id, {
      forceSearch: !!options.forceSearch
    });

    const liveLabel = this.activityT("source.youtubeLiveLabel", {}, "YouTube Live");
    const actualStartTime = liveVideo?.liveStreamingDetails?.actualStartTime || null;

    const activityData = this.buildActivityData({
      sourceType: "youtube",
      displayName: channel.displayName || identifier,
      avatarUrl: channel.avatarUrl || "",
      live: !!liveVideo,
      title: liveVideo?.snippet?.title || "",
      game: liveVideo ? liveLabel : "",
      viewers: Number(liveVideo?.liveStreamingDetails?.concurrentViewers || 0),
      streamUrl: liveVideo?.id ? `https://www.youtube.com/watch?v=${liveVideo.id}` : channel.url,
      startedAt: actualStartTime,
      startedAtUnix: this.unixts(actualStartTime)
    });
    this.sourceCache.youtubeActivityData = activityData;
    this.clearSourceWarning();
    return activityData;
  }

  async resolveActivityData(options = {}) {
    const sourceType = this.normalizeSource();

    if (sourceType === "youtube") {
      try {
        return await this.resolveYouTubeActivityData(options);
      } catch (err) {
        return this.resolveSourceFallback("youtube", err, () => this.buildFallbackActivityData("youtube"));
      }
    }

    if (sourceType === "custom") {
      return this.buildCustomActivityData();
    }

    return this.resolveTwitchActivityData(options);
  }

  async resolvePreviewData() {
    return {
      ok: true,
      preview: await this.resolveActivityData({ forceSearch: true })
    };
  }

  async connectDiscordRpc(rpc) {
    try {
      await new Promise((resolve, reject) => {
        rpc.once("ready", resolve);
        rpc.login({ clientId: this.config.discordAppClientId }).catch(reject);
      });
    } catch {
      throw this.createPresenceError(
        "discord_unavailable",
        this.uiT(
          "presence.error.discordUnavailable",
          {},
          "Discord Desktop is not running or Rich Presence could not connect."
        ),
        { retryable: false }
      );
    }
  }

  async testConnections() {
    const sourceType = this.normalizeSource();
    let displayName = this.getCustomDisplayName();

    if (sourceType === "youtube") {
      const channel = await this.resolveYouTubeChannel(this.config.youtubeChannel);
      displayName = channel.displayName;
    } else if (sourceType === "twitch" && this.normalizeTwitchApiMode() === "official") {
      const user = await this.getTwitchUser();
      displayName = user.display_name || this.config.streamerLogin;
    } else if (sourceType === "twitch") {
      const data = await this.resolveManagedTwitchActivityData(this.s(this.config.streamerLogin, "", 64));
      displayName = data.streamerDisplayName;
    }

    RPC.register(this.config.discordAppClientId);
    const rpc = new RPC.Client({ transport: "ipc" });

    try {
      await this.connectDiscordRpc(rpc);
      return {
        sourceOk: true,
        discordOk: true,
        streamerFound: true,
        streamerDisplayName: displayName
      };
    } finally {
      try {
        rpc.destroy();
      } catch {}
    }
  }

  getPresenceKey(data) {
    const scope = this.normalizeSource();
    const buttonKey = Array.isArray(data.buttons)
      ? data.buttons.map((button) => `${this.s(button?.label, "", 32)}>${this.s(button?.url, "", 256)}`).join(",")
      : "";
    const customTimestampMode = this.normalizeCustomTimestampMode(data.timestampMode);
    const clockKey = data.sourceType === "custom" && customTimestampMode === "clock"
      ? this.getCustomClockKey()
      : "";

    return [
      scope,
      data.sourceType === "custom"
        ? this.s(data.customActivityType, "playing", 32)
        : (data.live ? "live" : "offline"),
      this.s(data.streamerDisplayName),
      this.s(data.title),
      this.s(data.game),
      data.startedAtUnix || 0,
      data.endedAtUnix || 0,
      Number(data.viewers || 0),
      this.s(data.streamUrl),
      this.s(data.largeText),
      this.s(data.smallText),
      customTimestampMode,
      clockKey,
      buttonKey
    ].join("|");
  }

  async setPresenceCustom({
    displayName,
    details,
    state,
    timestampMode,
    startUnix,
    endUnix,
    buttons,
    avatarUrl,
    largeText,
    smallText,
    activityType
  }) {
    const resolvedName = this.s(displayName, this.getCustomDisplayName(), 64);
    const resolvedType = this.normalizeCustomActivityType(activityType);
    const assets = {
      large_image: this.resolveCustomLargeImage() || this.resolveLargeImage(avatarUrl),
      large_text: this.s(largeText, resolvedName, 128),
      small_image: this.resolveCustomSmallImage(),
      small_text: this.s(smallText, this.getCustomActivityTypeLabel(resolvedType), 128)
    };

    Object.keys(assets).forEach((key) => assets[key] === undefined && delete assets[key]);

    const timestamps = {};
    if (Number.isFinite(startUnix)) timestamps.start = startUnix;
    if (Number.isFinite(endUnix)) timestamps.end = endUnix;
    const resolvedTimestampMode = this.normalizeCustomTimestampMode(timestampMode);
    const clockText = resolvedTimestampMode === "clock" ? this.getCustomClockText() : "";
    const resolvedState = this.s(
      [clockText, this.s(state, "", 128)].filter(Boolean).join(" - "),
      clockText || "",
      128
    );

    const activity = {
      type: this.getCustomActivityTypeCode(resolvedType),
      details: this.s(details, resolvedName, 128),
      assets,
      instance: false
    };

    if (resolvedState) {
      activity.state = resolvedState;
    }

    if (Object.keys(timestamps).length) {
      activity.timestamps = timestamps;
    }

    const resolvedButtons = Array.isArray(buttons) && buttons.length
      ? buttons.slice(0, 2)
      : this.buildCustomButtons(resolvedName);
    if (resolvedButtons.length) activity.buttons = resolvedButtons;

    await this.rpc.request("SET_ACTIVITY", {
      pid: process.pid,
      activity
    });
  }

  async setPresenceLive({ displayName, title, game, startUnix, viewers, streamUrl, avatarUrl }) {
    const resolvedName = this.s(displayName, this.getCustomDisplayName(), 64);
    const liveTitle = this.s(
      title,
      this.activityT(
        "preview.defaultLiveTitle",
        {},
        this.activityT("presence.text.liveFallback", {}, "Live")
      ),
      128
    );

    const assets = {
      large_image: this.resolveLargeImage(avatarUrl),
      large_text: this.s(resolvedName, "Streamer", 128),
      small_image: this.resolveSmallImage(true, { allowFallback: true }),
      small_text: this.s(this.activityT("presence.text.smallLive", {}, "Live"), "Live", 128)
    };

    Object.keys(assets).forEach((key) => assets[key] === undefined && delete assets[key]);

    const activity = {
      type: 3,
      details: liveTitle,
      state: this.buildLiveState(resolvedName, game, viewers),
      timestamps: {
        start: this.getActivityTimestamp(startUnix)
      },
      assets,
      instance: false
    };

    const buttons = this.buildButtons(resolvedName, streamUrl);
    if (buttons.length) activity.buttons = buttons;

    await this.rpc.request("SET_ACTIVITY", {
      pid: process.pid,
      activity
    });
  }

  async setPresenceOffline({ displayName, offlineTitle, streamUrl, avatarUrl }) {
    const resolvedName = this.s(displayName, this.getCustomDisplayName(), 64);
    const assets = {
      large_image: this.resolveLargeImage(avatarUrl),
      large_text: this.s(resolvedName, "Streamer", 128),
      small_image: this.resolveSmallImage(false, { allowFallback: true }),
      small_text: this.s(this.activityT("presence.text.smallOffline", {}, "Offline"), "Offline", 128)
    };

    Object.keys(assets).forEach((key) => assets[key] === undefined && delete assets[key]);

    const activity = {
      type: 2,
      details: this.s(
        this.activityT(
          "preview.defaultOfflineTitle",
          {},
          this.activityT("presence.text.offlineDetails", { name: resolvedName }, `Waiting for ${resolvedName}`)
        ),
        `Waiting for ${resolvedName}`,
        128
      ),
      state: this.buildOfflineState(offlineTitle),
      timestamps: {
        start: this.getActivityTimestamp()
      },
      assets,
      instance: false
    };

    const buttons = this.buildButtons(resolvedName, streamUrl);
    if (buttons.length) activity.buttons = buttons;

    await this.rpc.request("SET_ACTIVITY", {
      pid: process.pid,
      activity
    });
  }

  async applyResolvedActivity(data) {
    if (!this.rpc) return;

    if (data.sourceType === "custom") {
      await this.setPresenceCustom({
        displayName: data.streamerDisplayName,
        details: data.title,
        state: data.game,
        timestampMode: data.timestampMode,
        startUnix: data.startedAtUnix,
        endUnix: data.endedAtUnix,
        buttons: data.buttons,
        avatarUrl: data.avatarUrl,
        largeText: data.largeText,
        smallText: data.smallText,
        activityType: data.customActivityType
      });
      return;
    }

    if (data.live) {
      await this.setPresenceLive({
        displayName: data.streamerDisplayName,
        title: data.title,
        game: data.game,
        startUnix: data.startedAtUnix,
        viewers: data.viewers,
        streamUrl: data.streamUrl,
        avatarUrl: data.avatarUrl
      });
    } else {
      await this.setPresenceOffline({
        displayName: data.streamerDisplayName,
        offlineTitle: data.title,
        streamUrl: data.streamUrl,
        avatarUrl: data.avatarUrl
      });
    }
  }

  async clearPresenceRaw() {
    if (!this.rpc) return;
    try {
      await this.rpc.request("SET_ACTIVITY", { pid: process.pid, activity: null });
    } catch {}
  }

  async tick() {
    if (!this.running) return;

    try {
      const data = await this.resolveActivityData();
      const key = this.getPresenceKey(data);

      if (key !== this.lastKey) {
        await this.applyResolvedActivity(data);
        this.lastKey = key;

        if (data.sourceType === "custom") {
          this.status("Running");
          if (this.normalizeCustomTimestampMode(data.timestampMode) !== "clock") {
            this.log(this.uiT(
              "presence.log.customApplied",
              { name: data.streamerDisplayName },
              `Custom activity updated: ${data.streamerDisplayName}`
            ));
          }
        } else if (data.live) {
          this.status("Live");
          this.log(this.uiT("presence.log.liveDetected", {
            name: data.streamerDisplayName,
            title: data.title || "untitled"
          }, `Live detected: ${data.streamerDisplayName} | ${data.title || "untitled"}`));
        } else {
          this.status("Offline");
          this.log(this.uiT("presence.log.offlineDetected", { name: data.streamerDisplayName }, `Offline detected: ${data.streamerDisplayName}`));
        }
      }
    } catch (err) {
      this.status("Error");
      this.log(this.uiT("presence.log.tickError", { message: err.message }, `Tick error: ${err.message}`));
    }
  }

  async refreshActivity() {
    if (!this.running || !this.rpc) return;

    const data = await this.resolveActivityData({ forceSearch: true });
    this.lastKey = this.getPresenceKey(data);
    await this.applyResolvedActivity(data);
  }

  async start() {
    if (this.running) return;

    this.running = true;
    this.lastKey = null;
    this.activityStartedAtUnix = Math.floor(Date.now() / 1000);

    RPC.register(this.config.discordAppClientId);
    this.rpc = new RPC.Client({ transport: "ipc" });

    try {
      await this.connectDiscordRpc(this.rpc);
    } catch (err) {
      try {
        this.rpc.destroy();
      } catch {}
      this.rpc = null;
      this.running = false;
      throw err;
    }

    this.log(this.uiT("presence.log.connected", {}, "Connected to Discord RPC."));
    this.status("Connected");

    const initialData = await this.resolveActivityData({ forceSearch: true });
    if (this.normalizeSource() === "custom") {
      this.log(this.uiT(
        "presence.log.customReady",
        { name: initialData.streamerDisplayName },
        `Custom activity ready: ${initialData.streamerDisplayName}`
      ));
    } else {
      this.log(this.uiT("presence.log.watching", {
        name: initialData.streamerDisplayName,
        seconds: this.checkMs / 1000
      }, `Monitoring ${initialData.streamerDisplayName} every ${this.checkMs / 1000}s.`));
    }

    this.status("Running");

    await this.tick();

    this.restartTickInterval();
  }

  async stop() {
    this.running = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    await this.clearPresenceRaw();

    if (this.rpc) {
      try {
        this.rpc.destroy();
      } catch {}
      this.rpc = null;
    }

    this.lastKey = null;
    this.activityStartedAtUnix = null;

    this.log(this.uiT("presence.log.cleared", {}, "Discord presence cleared."));
  }
}

module.exports = { PresenceService };
