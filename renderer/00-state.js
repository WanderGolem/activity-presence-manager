// Split from the former renderer.js monolith.
const DEFAULT_ACCENT_COLOR = "#5865f2";

const configFields = [
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
  "smallImageOfflineUrl",
  "checkIntervalSec",
  "language",
  "activityLanguage",
  "accentColor",
  "uiZoom"
];

const boolFields = [
  "launchOnStartup",
  "minimizeToTray",
  "startMinimized",
  "autoStartPresence",
  "autoCheckForUpdates",
  "showPreview",
  "useDefaultStreamStatusImage"
];

const BOOL_FIELD_DEFAULTS = {
  launchOnStartup: false,
  minimizeToTray: true,
  startMinimized: false,
  autoStartPresence: false,
  autoCheckForUpdates: true,
  showPreview: true,
  useDefaultStreamStatusImage: true
};

let currentUpdaterState = {
  status: "idle",
  version: "",
  packaged: false,
  info: null,
  progress: null,
  error: ""
};

const presetFields = [
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

const EDIT_ICON_SVG = [
  '<img src="./assets/icons/edit.svg" alt="" aria-hidden="true" />'
].join("");

const PRESET_SOURCE_ICONS = {
  twitch: '<img src="./assets/icons/twitch.svg" alt="" aria-hidden="true" />',
  youtube: '<img src="./assets/icons/youtube.svg" alt="" aria-hidden="true" />',
  custom: '<img src="./assets/icons/discord.svg" alt="" aria-hidden="true" />'
};

const DASHBOARD_EDITABLE_SECTIONS = {
  twitch: {
    cardId: "twitchCard",
    buttonId: "editTwitchBtn",
    fieldIds: ["twitchApiMode", "twitchClientId", "twitchClientSecret", "streamerLogin"],
    controlIds: ["twitchApiModeManaged", "twitchApiModeOfficial", "toggleSecretBtn"],
    labelKey: "section.twitch",
    fallbackLabel: "Twitch"
  },
  youtube: {
    cardId: "youtubeCard",
    buttonId: "editYoutubeBtn",
    fieldIds: ["youtubeApiKey", "youtubeChannel"],
    controlIds: [],
    labelKey: "section.youtube",
    fallbackLabel: "YouTube"
  },
  custom: {
    cardId: "customCard",
    buttonId: "editCustomBtn",
    fieldIds: [
      "customDisplayName",
      "customActivityType",
      "customTitle",
      "customGame",
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
      "customSmallText"
    ],
    controlIds: ["customActivityTypeSelectTrigger", "customTimestampModeSelectTrigger"],
    labelKey: "section.customActivity",
    fallbackLabel: "Custom Activity"
  },
  discord: {
    cardId: "discordCard",
    buttonId: "editDiscordBtn",
    fieldIds: ["discordAppClientId", "discordInviteUrl"],
    controlIds: [],
    labelKey: "section.discord",
    fallbackLabel: "Discord"
  },
  images: {
    cardId: "imagesCard",
    buttonId: "editImagesBtn",
    fieldIds: [
      "largeImageKey",
      "largeImageUrl",
      "smallImageLiveKey",
      "smallImageLiveUrl",
      "smallImageOfflineKey",
      "smallImageOfflineUrl"
    ],
    controlIds: [],
    labelKey: "section.images",
    fallbackLabel: "Images"
  }
};

const PRESET_FIELD_DEFAULTS = {
  activitySource: "twitch",
  twitchApiMode: "managed",
  accentColor: DEFAULT_ACCENT_COLOR,
  customActivityType: "playing",
  customTimestampMode: "none"
};

let translations = {};
let currentLanguage = "en";
let activityTranslations = {};
let currentActivityLanguageSetting = "en";
let currentActivityLanguageCode = "en";
let presetsCache = {};
let isMaximized = false;
let appTitleFromMain = "Activity Presence Manager";
let activePanelName = "dashboard";
let activeSidebarPreset = "";
let appInitComplete = false;
let pendingStartupChangelog = null;
let startupChangelogShown = false;
let startupChangelogOpening = false;

let previewMode = "offline";
let previewAutoMode = false;
let previewLiveData = null;
let previewFetchTimer = null;
let previewPresenceStartedAt = null;
let currentStreamInfoData = null;
let currentPresenceStatus = "Ready";
let dashboardSectionEditState = {
  twitch: false,
  youtube: false,
  custom: false,
  discord: false,
  images: false
};
let presetEditMode = false;
let editingPresetOriginalName = "";
let presetEditorMode = "idle";
let presetEditorBaseline = null;
let presetEditReturnSnapshot = null;

let pendingZoomValue = 100;
let draggedPresetName = "";
let presetDropTargetName = "";
let presetDropPosition = "before";
let presetDragJustCompleted = false;

const LANGUAGE_FLAG_MAP = {
  de: "\uD83C\uDDE9\uD83C\uDDEA",
  en: "\uD83C\uDDFA\uD83C\uDDF8",
  ru: "\uD83C\uDDF7\uD83C\uDDFA",
  "en-gb": "\uD83C\uDDEC\uD83C\uDDE7",
  "en-us": "\uD83C\uDDFA\uD83C\uDDF8"
};

const HELP_LINKS = {
  twitchConsole: "https://dev.twitch.tv/console/apps",
  twitchDocs: "https://dev.twitch.tv/docs/authentication/register-app",
  twitchForum: "https://discuss.dev.twitch.com/",
  youtubeConsole: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
  youtubeDocs: "https://developers.google.com/youtube/v3/getting-started",
  youtubeAppGuide: "https://developers.google.com/youtube/registering_an_application",
  discordPortal: "https://discord.com/developers/applications",
  discordAppIdHelp: "https://support-dev.discord.com/hc/en-us/articles/360028717192-Where-can-I-find-my-Application-Team-Server-ID",
  discordDocs: "https://docs.discord.com/developers/platform/rich-presence",
  discordDevSupport: "https://support-dev.discord.com/hc/en-us",
  discordHelp: "https://support.discord.com/hc/en-us"
};

const WINDOW_MAXIMIZE_ICON = [
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
  '<rect x="3.25" y="3.25" width="9.5" height="9.5" rx="0.8" fill="none" stroke="currentColor" stroke-width="1.65"/>',
  '</svg>'
].join("");

const WINDOW_RESTORE_ICON = [
  '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
  '<path d="M5.75 3.25h6a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  '<rect x="3.25" y="5.25" width="7.5" height="7.5" rx="0.8" fill="none" stroke="currentColor" stroke-width="1.65"/>',
  '</svg>'
].join("");
