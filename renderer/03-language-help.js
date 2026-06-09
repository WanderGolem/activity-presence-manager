// Split from the former renderer.js monolith.
function getLanguageDisplayName(language) {
  return language?.nativeName || language?.name || language?.code || "";
}

function getLanguageFlag(code) {
  const normalizedCode = String(code || "").trim().toLowerCase();
  if (!normalizedCode) return "\uD83C\uDF10";
  return (
    LANGUAGE_FLAG_MAP[normalizedCode] ||
    LANGUAGE_FLAG_MAP[normalizedCode.split("-")[0]] ||
    "\uD83C\uDF10"
  );
}

function setLanguageOptionMeta(option, meta) {
  option.value = meta.value;
  option.textContent = meta.label;
  option.dataset.label = meta.label;
  option.dataset.flag = meta.flag || "\uD83C\uDF10";
  option.dataset.languageCode = meta.code || meta.value;
}

function getOptionMeta(option) {
  if (!option) {
    return {
      label: "Select",
      flag: "\uD83C\uDF10"
    };
  }

  return {
    value: option.value,
    label: option.dataset.label || option.textContent || option.value,
    icon: option.dataset.icon || "",
    flag: option.dataset.flag || getLanguageFlag(option.dataset.languageCode || option.value)
  };
}

function buildSelectMetaIcon(meta) {
  if (meta?.icon) {
    const icon = document.createElement("img");
    icon.className = "custom-select-icon";
    icon.src = meta.icon;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  const flag = document.createElement("span");
  flag.className = "custom-select-flag";
  flag.textContent = meta?.flag || "\uD83C\uDF10";
  return flag;
}

function renderSelectMeta(container, meta) {
  if (!container) return;

  container.textContent = "";

  const label = document.createElement("span");
  label.className = "custom-select-label";
  label.textContent = meta.label || "Select";

  container.appendChild(buildSelectMetaIcon(meta));
  container.appendChild(label);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHelpSection(index, title, intro, steps, links = [], note = "") {
  const stepItems = steps
    .filter(Boolean)
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join("");

  const linkItems = links
    .map((link) => `<button class="action btn-import help-link-btn" type="button" data-help-url="${escapeHtml(link.url)}">${escapeHtml(link.label)}</button>`)
    .join("");

  return `
    <section class="help-section">
      <div class="help-section-header">
        <span class="help-section-index">${escapeHtml(index)}</span>
        <h3 class="help-section-title">${escapeHtml(title)}</h3>
      </div>
      <p class="help-section-intro">${escapeHtml(intro)}</p>
      <ol class="help-steps">${stepItems}</ol>
      ${note ? `<div class="help-note">${escapeHtml(note)}</div>` : ""}
      ${linkItems ? `<div class="help-actions">${linkItems}</div>` : ""}
    </section>
  `;
}

function renderHelpContent() {
  const helpNode = el("helpText");
  if (!helpNode) return;

  const sections = [
    buildHelpSection(
      "1",
      t("help.twitch.title", "Set up Twitch monitoring"),
      t("help.twitch.intro", "The managed Twitch API only needs the channel login. Own Twitch credentials are optional."),
      [
        t("help.twitch.step1", "Enter only the Twitch channel name in Streamer Login, not the full Twitch URL."),
        t("help.twitch.step2", "Leave Managed API selected for the easiest setup."),
        t("help.twitch.step3", "Optional: switch to Own Twitch app if you want to use direct Twitch API credentials."),
        t("help.twitch.step4", "For Own Twitch app, open the Twitch Developer Console and create a new application."),
        t("help.twitch.step5", "Copy the Client ID and create a Client Secret with New Secret. Keep the secret private and never share it."),
        t("help.twitch.step6", "Choose Twitch Stream as the source if you want Discord Presence to follow Twitch live status automatically.")
      ],
      [
        { label: t("help.link.twitchConsole", "Twitch Developer Console"), url: HELP_LINKS.twitchConsole },
        { label: t("help.link.twitchDocs", "Twitch setup guide"), url: HELP_LINKS.twitchDocs },
        { label: t("help.link.twitchForum", "Twitch developer forum"), url: HELP_LINKS.twitchForum }
      ],
      t("help.twitch.note", "Managed API is the easiest mode. Switch to Own Twitch app only if you want to use your own Client ID and Client Secret.")
    ),
    buildHelpSection(
      "2",
      t("help.youtube.title", "Set up YouTube support"),
      t("help.youtube.intro", "YouTube mode needs a Google API key with access to the YouTube Data API v3 and a channel ID, handle, or channel URL."),
      [
        t("help.youtube.step1", "Open Google Cloud Console and create or choose a project."),
        t("help.youtube.step2", "Enable the YouTube Data API v3 for that project."),
        t("help.youtube.step3", "Create an API key under Credentials and keep it private."),
        t("help.youtube.step4", "Paste the API key into the YouTube block in this app."),
        t("help.youtube.step5", "Paste a channel ID, an @handle, or a full YouTube channel URL into the YouTube channel field."),
        t("help.youtube.step6", "Choose YouTube Stream as the source if Discord should follow live videos from that channel.")
      ],
      [
        { label: t("help.link.youtubeConsole", "Google Cloud Console"), url: HELP_LINKS.youtubeConsole },
        { label: t("help.link.youtubeDocs", "YouTube Data API guide"), url: HELP_LINKS.youtubeDocs },
        { label: t("help.link.youtubeAppGuide", "Registering an application"), url: HELP_LINKS.youtubeAppGuide }
      ],
      t("help.youtube.note", "Offline live checks for YouTube are slowed down in the background to avoid burning through API quota too quickly.")
    ),
    buildHelpSection(
      "3",
      t("help.discord.title", "Set up a Discord app"),
      t("help.discord.intro", "For this app, the required Discord value is the Application ID, also called the Client ID. A bot token is not required."),
      [
        t("help.discord.step1", "Open the Discord Developer Portal and create a new application."),
        t("help.discord.step2", "Give the application a name and optionally upload an icon or description so it looks cleaner in Discord."),
        t("help.discord.step3", "Open General Information and copy the Application ID. Discord also calls it the Client ID."),
        t("help.discord.step4", "Paste that ID into the Discord block in this app."),
        t("help.discord.step5", "If you want image keys to work, upload the art assets in your Discord application first and then enter those keys in this app.")
      ],
      [
        { label: t("help.link.discordPortal", "Discord Developer Portal"), url: HELP_LINKS.discordPortal },
        { label: t("help.link.discordDocs", "Discord Rich Presence docs"), url: HELP_LINKS.discordDocs },
        { label: t("help.link.discordAppId", "Find Application ID"), url: HELP_LINKS.discordAppIdHelp }
      ],
      t("help.discord.note", "You do not need to create a bot token just to use Rich Presence with this app.")
    ),
    buildHelpSection(
      "4",
      t("help.usage.title", "How to use the app"),
      t("help.usage.intro", "Choose the mode first, then fill only the matching blocks plus the Discord Application ID."),
      [
        t("help.usage.step1", "Pick Twitch, YouTube, or Custom Rich Presence in the source area at the top of the dashboard."),
        t("help.usage.step2", "Twitch and YouTube monitor live status automatically. Discord Rich Presence lets you set activity type, details, state, timestamps, images, and buttons yourself."),
        t("help.usage.step3", "Enter the Discord Application ID in the Discord block."),
        t("help.usage.step4", "Twitch and YouTube use the Images block. Discord Rich Presence has its own image fields directly inside the custom block."),
        t("help.usage.step5", "Use Test Connection first. After that, save your settings or save a preset if you need multiple setups."),
        t("help.usage.step6", "Start Presence from the dashboard or enable auto-start in Settings. The preview and stream info area help you verify the result first."),
        t("help.usage.step7", "Presets also store the selected mode and all advanced custom Rich Presence fields.")
      ],
      [],
      t("help.usage.note", "Discord desktop must already be running, otherwise Rich Presence cannot be set.")
    ),
    buildHelpSection(
      "5",
      t("help.support.title", "Where to get help"),
      t("help.support.intro", "For Twitch, YouTube, or Discord platform questions, use the official developer pages below. For this app itself, use the place where you received the project if a support page exists there."),
      [
        t("help.support.step1", "Use Twitch documentation and the Twitch developer forum for Twitch app creation, authentication, and API questions."),
        t("help.support.step2", "Use the YouTube Data API documentation or Google Cloud Console docs for API keys, quotas, and channel lookup questions."),
        t("help.support.step3", "Use the Discord Developer Help Center for Application ID, Developer Portal, and Discord app setup questions."),
        t("help.support.step4", "Use the general Discord Help Center if the issue is with the Discord desktop client instead of developer setup."),
        t("help.support.step5", "If you want to report a bug or request a feature for this app, use the project page, GitHub issues, Discord server, or release post where the app was shared.")
      ],
      [
        { label: t("help.link.youtubeDocs", "YouTube Data API guide"), url: HELP_LINKS.youtubeDocs },
        { label: t("help.link.discordSupport", "Discord developer support"), url: HELP_LINKS.discordDevSupport },
        { label: t("help.link.discordHelp", "Discord Help Center"), url: HELP_LINKS.discordHelp }
      ],
      t("help.support.note", "Helpful bug reports include the app version, your Windows version, screenshots, the exact error text, and short steps to reproduce the problem.")
    ),
    buildHelpSection(
      "6",
      t("help.tips.title", "Useful tips"),
      t("help.tips.intro", "A few small details help avoid the most common setup mistakes."),
      [
        t("help.tips.step1", "Never share your Twitch Client Secret, YouTube API key, or any private project credentials with anyone."),
        t("help.tips.step2", "The check interval must still be at least 5 seconds. YouTube offline checks are additionally throttled internally."),
        t("help.tips.step3", "Stream images remain optional for Twitch and YouTube, and Discord Rich Presence images remain optional inside the custom block."),
        t("help.tips.step4", "Use presets if you switch between Twitch channels, YouTube channels, Discord apps, or different custom Rich Presence setups."),
        t("help.tips.step5", "Export your settings before larger changes so you always have a backup."),
        t("help.tips.step6", "Import all merges presets with your existing ones and skips invalid presets instead of overwriting good ones."),
        t("help.tips.step7", "Use the Updates & data section to check for updates, install a found update, and open the changelog."),
        t("help.tips.step8", "If the interface looks stuck or wrong after changes, use Reload in the title bar or restart the app once.")
      ]
    )
  ];

  helpNode.innerHTML = sections.join("");

  helpNode.querySelectorAll("[data-help-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetUrl = button.getAttribute("data-help-url") || "";
      const result = await window.appApi.openExternalUrl(targetUrl);
      if (!result?.ok) {
        addLog(`${t("log.testFailed", "Test failed:")} ${result?.error || "open_external_failed"}`);
      }
    });
  });
}

function createCustomSelectOption(option, isSelected, onClick) {
  const meta = getOptionMeta(option);
  const item = document.createElement("div");
  item.className = "custom-select-option";
  if (isSelected) item.classList.add("selected");

  const main = document.createElement("span");
  main.className = "custom-select-option-main";

  const label = document.createElement("span");
  label.className = "custom-select-label";
  label.textContent = meta.label;

  const check = document.createElement("span");
  check.className = "custom-select-check";

  main.appendChild(buildSelectMetaIcon(meta));
  main.appendChild(label);
  item.appendChild(main);
  item.appendChild(check);
  item.addEventListener("click", onClick);

  return item;
}

function buildActivityFollowAppOption(languages) {
  const appLanguageCode = el("language")?.value || currentLanguage || "en";
  const appLanguage = languages.find((language) => language.code === appLanguageCode);
  const appLanguageName = getLanguageDisplayName(appLanguage) || appLanguageCode;

  return {
    value: "app",
    code: appLanguageCode,
    label: `${t("language.followApp", "App language")} (${appLanguageName})`,
    flag: getLanguageFlag(appLanguageCode)
  };
}

function getActivePageKey(panelName = activePanelName) {
  if (panelName === "dashboard" && presetEditMode) {
    return presetEditorMode === "create" ? "newPreset" : "presetEditor";
  }

  if (panelName === "presets") {
    return "newPreset";
  }

  return panelName;
}

function getPageSubtitle(pageKey) {
  const subtitleMap = {
    dashboard: t(
      "page.dashboardSubtitle",
      "Steuere Presence, Vorschau und Stream-Status an einem Ort."
    ),
    settings: t(
      "page.settingsSubtitle",
      "Passe Sprache, Darstellung und Startverhalten der App an."
    ),
    newPreset: t(
      "page.newPresetSubtitle",
      "Erstelle ein neues Preset und fülle Twitch, Discord und Bilder direkt im Dashboard aus."
    ),
    presetEditor: t(
      "page.presetEditorSubtitle",
      "Bearbeite dieses Preset und speichere deine Twitch-, Discord- und Bilddaten."
    ),
    help: t(
      "page.helpSubtitle",
      "Kurze Hinweise für Einrichtung und Nutzung der App."
    )
  };

  return subtitleMap[pageKey] || subtitleMap.dashboard;
}

function setActivePanel(panelName) {
  activePanelName = panelName;

  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.classList.remove("active"));

  const panel = el(`panel-${panelName}`);
  if (panel) panel.classList.add("active");

  const navPanelName = panelName === "dashboard" && presetEditMode && presetEditorMode === "create"
    ? "presets"
    : panelName;

  const menuMap = {
    dashboard: "menuDashboardBtn",
    settings: "menuSettingsBtn",
    presets: "menuPresetsBtn",
    help: "menuHelpBtn"
  };

  const activeBtn = el(menuMap[navPanelName]);
  if (activeBtn) activeBtn.classList.add("active");

  const pageKey = getActivePageKey(panelName);
  const titleMap = {
    dashboard: t("menu.dashboard", "Dashboard"),
    settings: t("menu.settings", "Settings"),
    newPreset: t("menu.newPreset", "New Preset"),
    presetEditor: t("section.presetEditor", "Edit Preset"),
    help: t("menu.help", "Help")
  };

  el("appTitle").textContent = titleMap[pageKey] || t("menu.dashboard", "Dashboard");
  el("appSubtitle").textContent = getPageSubtitle(pageKey);
}

async function navigateToPanel(panelName) {
  const canLeave = await confirmLeavingPresetEditor();
  if (!canLeave) return false;

  setActivePanel(panelName);
  return true;
}

async function populateLanguages(selectedCode) {
  const languages = await window.appApi.getLanguages();
  const select = el("language");
  select.innerHTML = "";

  for (const lang of languages) {
    const option = document.createElement("option");
    setLanguageOptionMeta(option, {
      value: lang.code,
      code: lang.code,
      label: getLanguageDisplayName(lang),
      flag: getLanguageFlag(lang.code)
    });
    select.appendChild(option);
  }

  if (selectedCode && languages.some((l) => l.code === selectedCode)) {
    select.value = selectedCode;
  } else if (languages.some((l) => l.code === "en")) {
    select.value = "en";
  }

  renderLanguageCustomSelect();
}

function renderLanguageCustomSelect() {
  const select = el("language");
  const menu = el("languageSelectMenu");
  const value = el("languageSelectValue");

  menu.innerHTML = "";

  const selectedOption = select.options[select.selectedIndex];
  renderSelectMeta(value, getOptionMeta(selectedOption));

  Array.from(select.options).forEach((option) => {
    const item = createCustomSelectOption(option, option.value === select.value, async () => {
      const currentZoom = Number(el("uiZoom").value || pendingZoomValue || 100);

      select.value = option.value;
      closeLanguageSelect();

      await applyLanguage(option.value);

      pendingZoomValue = currentZoom;
      el("uiZoom").value = String(currentZoom);
      updateZoomLabel(currentZoom);

      await saveSettings();
      await validateAndRender();
    });

    menu.appendChild(item);
  });
}

function toggleLanguageSelect() {
  el("languageSelect").classList.toggle("open");
}

function closeLanguageSelect() {
  el("languageSelect").classList.remove("open");
}

async function populateActivityLanguages(selectedCode) {
  const languages = await window.appApi.getLanguages();
  const select = el("activityLanguage");
  select.innerHTML = "";

  const followAppOption = document.createElement("option");
  setLanguageOptionMeta(followAppOption, buildActivityFollowAppOption(languages));
  select.appendChild(followAppOption);

  for (const lang of languages) {
    const option = document.createElement("option");
    setLanguageOptionMeta(option, {
      value: lang.code,
      code: lang.code,
      label: getLanguageDisplayName(lang),
      flag: getLanguageFlag(lang.code)
    });
    select.appendChild(option);
  }

  if (selectedCode === "app") {
    select.value = "app";
  } else if (selectedCode && languages.some((l) => l.code === selectedCode)) {
    select.value = selectedCode;
  } else if (languages.some((l) => l.code === "en")) {
    select.value = "en";
  }

  renderActivityLanguageCustomSelect();
}

function renderActivityLanguageCustomSelect() {
  const select = el("activityLanguage");
  const menu = el("activityLanguageSelectMenu");
  const value = el("activityLanguageSelectValue");

  menu.innerHTML = "";

  const selectedOption = select.options[select.selectedIndex];
  renderSelectMeta(value, getOptionMeta(selectedOption));

  Array.from(select.options).forEach((option) => {
    const item = createCustomSelectOption(option, option.value === select.value, async () => {
      select.value = option.value;
      closeActivityLanguageSelect();
      renderActivityLanguageCustomSelect();
      await loadActivityTranslations(option.value);
      renderPreview(getCurrentPreviewSnapshot());
      await saveSettings();
      schedulePreviewRefresh();
    });

    menu.appendChild(item);
  });
}

function toggleActivityLanguageSelect() {
  el("activityLanguageSelect").classList.toggle("open");
}

function closeActivityLanguageSelect() {
  el("activityLanguageSelect").classList.remove("open");
}

function renderCustomActivityTypeSelect() {
  const select = el("customActivityType");
  const menu = el("customActivityTypeSelectMenu");
  const value = el("customActivityTypeSelectValue");
  if (!select || !menu || !value) return;

  menu.innerHTML = "";

  const selectedOption = select.options[select.selectedIndex];
  renderSelectMeta(value, getOptionMeta(selectedOption));

  Array.from(select.options).forEach((option) => {
    const item = createCustomSelectOption(option, option.value === select.value, () => {
      select.value = option.value;
      closeCustomActivityTypeSelect();
      renderCustomActivityTypeSelect();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.appendChild(item);
  });
}

function toggleCustomActivityTypeSelect() {
  el("customActivityTypeSelect")?.classList.toggle("open");
}

function closeCustomActivityTypeSelect() {
  el("customActivityTypeSelect")?.classList.remove("open");
}

function updateCustomTimestampModeFieldVisibility() {
  const mode = normalizeCustomTimestampMode(el("customTimestampMode")?.value || "none");
  const startField = el("field_customTimestampStart");
  const endField = el("field_customTimestampEnd");

  if (startField) {
    startField.hidden = !["start", "startEnd"].includes(mode);
  }

  if (endField) {
    endField.hidden = !["end", "startEnd"].includes(mode);
  }
}

function renderCustomTimestampModeSelect() {
  const select = el("customTimestampMode");
  const menu = el("customTimestampModeSelectMenu");
  const value = el("customTimestampModeSelectValue");
  if (!select || !menu || !value) return;

  menu.innerHTML = "";

  const selectedOption = select.options[select.selectedIndex];
  renderSelectMeta(value, getOptionMeta(selectedOption));

  Array.from(select.options).forEach((option) => {
    const item = createCustomSelectOption(option, option.value === select.value, () => {
      select.value = option.value;
      closeCustomTimestampModeSelect();
      renderCustomTimestampModeSelect();
      updateCustomTimestampModeFieldVisibility();
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    menu.appendChild(item);
  });

  updateCustomTimestampModeFieldVisibility();
}

function toggleCustomTimestampModeSelect() {
  el("customTimestampModeSelect")?.classList.toggle("open");
}

function closeCustomTimestampModeSelect() {
  el("customTimestampModeSelect")?.classList.remove("open");
}
