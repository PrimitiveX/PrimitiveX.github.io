const appView = document.getElementById("app-view");
const routeLinks = document.querySelectorAll("[data-route-link]");
const introSection = document.querySelector(".intro");

const routeSections = ["research", "scenario", "tutorial", "join-us", "apply"];
const siteConfigPath = "site-config.json";
let dataVersion = "20260503";
const scriptElement = document.querySelector('script[src$="script.js"]');
const assetBaseUrl = scriptElement ? new URL(".", scriptElement.src) : new URL("./", window.location.href);
let homeVideoUrl = "home-posts/video/home.mp4";

let listConfig = {
  research: "research-list.json",
  scenario: "scenario-list.json",
  tutorial: "tutorial-list.json",
};

let collectionTitles = {
  research: "Research",
  scenario: "Scenario",
  tutorial: "Tutorial",
};

const collectionData = {
  research: [],
  scenario: [],
  tutorial: [],
};

let activeTutorialTrack = "all";
let currentLang = localStorage.getItem("arm_lang") === "zh" ? "zh" : "en";
let joinUsListPath = "joinus-list.json";
let supabaseConfig = {
  enabled: false,
  url: "",
  anonKey: "",
  storageBucket: "applications-resumes",
  emailFunctionName: "send-application-email",
  notifyEmails: [],
};
let supabaseClient = null;

let joinRoleDefinitions = [];

let applyText = null;

let uiText = null;

function t(path) {
  const keys = path.split(".");
  let node = uiText[currentLang];
  for (const key of keys) {
    node = node?.[key];
  }
  return node;
}

function applySiteConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("site-config.json is invalid.");
  }

  if (!config.uiText?.en || !config.uiText?.zh) {
    throw new Error("site-config.json missing uiText locales.");
  }
  if (!config.applyText?.en || !config.applyText?.zh) {
    throw new Error("site-config.json missing applyText locales.");
  }

  if (typeof config.dataVersion === "string" && config.dataVersion.trim()) {
    dataVersion = config.dataVersion.trim();
  }

  if (config.assets?.homeVideoUrl) {
    homeVideoUrl = config.assets.homeVideoUrl;
  }

  if (config.collections?.research?.list) {
    listConfig.research = config.collections.research.list;
  }
  if (config.collections?.scenario?.list) {
    listConfig.scenario = config.collections.scenario.list;
  }
  if (config.collections?.tutorial?.list) {
    listConfig.tutorial = config.collections.tutorial.list;
  }

  if (config.collections?.research?.title) {
    collectionTitles.research = config.collections.research.title;
  }
  if (config.collections?.scenario?.title) {
    collectionTitles.scenario = config.collections.scenario.title;
  }
  if (config.collections?.tutorial?.title) {
    collectionTitles.tutorial = config.collections.tutorial.title;
  }

  if (config.collections?.joinUsList) {
    joinUsListPath = config.collections.joinUsList;
  }

  supabaseConfig = {
    ...supabaseConfig,
    ...(config.supabase || {}),
  };

  if (typeof window.supabase?.createClient === "function" && supabaseConfig.url && supabaseConfig.anonKey) {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  } else {
    supabaseClient = null;
  }

  uiText = config.uiText;
  applyText = config.applyText;
}

function localizeText(template, variables) {
  return Object.entries(variables).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );
}

function localizedItemValue(item, key) {
  if (currentLang === "zh") {
    const zhKey = `zh${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (item?.[zhKey]) {
      return item[zhKey];
    }
  }
  return item?.[key];
}

function localizedCollectionTitle(collection) {
  if (collection === "join-us") {
    return t("tabTitles.join-us");
  }
  return t(`tabTitles.${collection}`) || collectionTitles[collection] || collection;
}

function localizedRoleTitle(role) {
  if (!role || typeof role !== "object") {
    return "";
  }
  if (currentLang === "zh" && role.zhTitle) {
    return role.zhTitle;
  }
  return role.title || "";
}

function applyLocalizedShellText() {
  const logoText = document.querySelector("[data-i18n-logo]");
  if (logoText) {
    logoText.innerHTML = t("logoHtml");
  }

  const introText = document.querySelector("[data-i18n-intro]");
  if (introText) {
    introText.textContent = t("intro");
  }

  const footerText = document.querySelector("[data-i18n-footer]");
  if (footerText) {
    footerText.textContent = t("footer");
  }

  const navItems = document.querySelectorAll("[data-i18n-nav]");
  for (const navItem of navItems) {
    const key = navItem.getAttribute("data-i18n-nav");
    if (!key) {
      continue;
    }
    navItem.textContent = t(`nav.${key}`);
  }

  const toggleButton = document.querySelector("[data-lang-toggle]");
  if (toggleButton) {
    toggleButton.textContent = t("langToggle");
  }

  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
}

function normalizeSlug(value) {
  if (!value) {
    return "";
  }

  try {
    let normalized = String(value).trim();
    for (let i = 0; i < 3; i += 1) {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) {
        break;
      }
      normalized = decoded;
    }
    return normalized.trim().toLowerCase();
  } catch {
    return String(value).trim().toLowerCase();
  }
}

function normalizePath(pathname) {
  if (!pathname) {
    return "/";
  }

  let path = pathname;
  if (path.endsWith("index.html")) {
    path = path.replace(/index\.html$/, "");
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path || "/";
}

function basePrefix(pathname) {
  const normalized = normalizePath(pathname);
  if (normalized === "/") {
    return "";
  }

  const parts = normalized.split("/").filter(Boolean);
  const tail = parts[parts.length - 1] || "";
  const preTail = parts[parts.length - 2] || "";

  if (routeSections.includes(tail)) {
    parts.pop();
  } else if (routeSections.includes(preTail)) {
    parts.pop();
    parts.pop();
  }

  return parts.length ? `/${parts.join("/")}` : "";
}

function resolveDataUrl(relativePath) {
  return new URL(relativePath, assetBaseUrl).href;
}

function addDataVersionToUrl(urlLike) {
  const resolved = new URL(urlLike, window.location.href);
  if (dataVersion) {
    resolved.searchParams.set("v", dataVersion);
  }
  return resolved.toString();
}

function mapResponsibilityValue(value, text) {
  const responsibilityMap = {
    algorithm: text.responsibilityAlgorithm,
    code: text.responsibilityCode,
    hardware: text.responsibilityHardware,
    writing: text.responsibilityWriting,
  };
  return responsibilityMap[value] || "-";
}

function collectApplicationPayload({
  text,
  role,
  roleId,
  formData,
  applicantName,
  phone,
  email,
  hasPaper,
  paperTitle,
  paperJournal,
  hasProject,
  projectName,
  projectResponsibility,
  hasCompetition,
  competitionName,
  competitionResponsibility,
}) {
  const ros2LevelMap = {
    none: text.ros2None,
    understand: text.ros2Understand,
    familiar: text.ros2Familiar,
    expert: text.ros2Expert,
  };
  const degreeMap = {
    phd: text.degreePhd,
    master: text.degreeMaster,
    bachelor: text.degreeBachelor,
    other: text.degreeOther,
  };

  return {
    role: {
      id: roleId,
      title: localizedRoleTitle(role) || roleId,
      language: currentLang,
    },
    personal: {
      name: applicantName,
      phone,
      email,
    },
    ros2: {
      levelKey: String(formData.get("ros2Level") || ""),
      levelLabel: ros2LevelMap[String(formData.get("ros2Level") || "")] || "-",
    },
    education: {
      degreeKey: String(formData.get("degree") || ""),
      degreeLabel: degreeMap[String(formData.get("degree") || "")] || "-",
      graduationDate: String(formData.get("graduationDate") || ""),
      schoolName: String(formData.get("schoolName") || ""),
    },
    paper: {
      hasPaper,
      title: hasPaper === "yes" ? paperTitle : "",
      journal: hasPaper === "yes" ? paperJournal : "",
    },
    project: {
      hasProject,
      name: hasProject === "yes" ? projectName : "",
      responsibilityKey: hasProject === "yes" ? projectResponsibility : "",
      responsibilityLabel: hasProject === "yes" ? mapResponsibilityValue(projectResponsibility, text) : "",
    },
    competition: {
      hasCompetition,
      name: hasCompetition === "yes" ? competitionName : "",
      responsibilityKey: hasCompetition === "yes" ? competitionResponsibility : "",
      responsibilityLabel:
        hasCompetition === "yes" ? mapResponsibilityValue(competitionResponsibility, text) : "",
    },
  };
}

function sanitizeFileName(fileName) {
  return String(fileName || "resume.pdf")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uploadResumeToSupabase(resumeFile, roleId) {
  if (!supabaseClient) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const now = new Date();
  const dateSegment = now.toISOString().slice(0, 10);
  const timeSegment = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const randomSegment = Math.random().toString(36).slice(2, 8);
  const fileName = sanitizeFileName(resumeFile.name || "resume.pdf");
  const filePath = `${dateSegment}/${roleId || "unknown-role"}/${timeSegment}-${randomSegment}-${fileName}`;

  const { error } = await supabaseClient.storage
    .from(supabaseConfig.storageBucket)
    .upload(filePath, resumeFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: resumeFile.type || "application/pdf",
    });

  if (error) {
    throw new Error(`SUPABASE_UPLOAD_FAILED:${error.message}`);
  }

  return {
    bucket: supabaseConfig.storageBucket,
    path: filePath,
    fileName: resumeFile.name,
    fileSize: resumeFile.size,
    mimeType: resumeFile.type || "application/pdf",
  };
}

async function insertApplicationRecord(applicationRecord) {
  if (!supabaseClient) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const { data, error } = await supabaseClient
    .from("applications")
    .insert(applicationRecord)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`SUPABASE_INSERT_FAILED:${error?.message || "unknown"}`);
  }

  return data.id;
}

async function triggerApplicationEmail(applicationId) {
  if (!supabaseClient) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const { data, error } = await supabaseClient.functions.invoke(supabaseConfig.emailFunctionName, {
    body: {
      applicationId,
      notifyEmails: Array.isArray(supabaseConfig.notifyEmails) ? supabaseConfig.notifyEmails : [],
    },
  });

  if (error) {
    throw new Error(`SUPABASE_FUNCTION_FAILED:${error.message}`);
  }

  const ok = data?.ok;
  if (!ok) {
    throw new Error("SUPABASE_FUNCTION_FAILED:mail dispatch rejected");
  }
}

async function fetchJson(relativePath, options = {}) {
  const normalizedPath = String(relativePath || "").replace(/^\/+/, "");
  const base = basePrefix(window.location.pathname);
  const withVersion = options.withVersion !== false;
  const rawCandidates = [
    resolveDataUrl(normalizedPath),
    base ? `${base}/${normalizedPath}` : `./${normalizedPath}`,
    `./${normalizedPath}`,
    `/${normalizedPath}`,
  ];
  const candidates = withVersion
    ? rawCandidates.map((candidate) => addDataVersionToUrl(candidate))
    : rawCandidates;

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: "no-cache" });
      if (!response.ok) {
        lastError = new Error(`Failed ${candidate}: ${response.status}`);
        continue;
      }
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to load ${relativePath}`);
}

async function loadCollection(name) {
  const listPath = listConfig[name];
  const listData = await fetchJson(listPath);
  const baseDir = listPath.slice(0, listPath.lastIndexOf("/") + 1);

  const postPaths = (listData.posts || []).map((post) => {
    if (post.path) {
      return `${baseDir}${post.path}`;
    }
    return `${baseDir}${name}-posts/${post.slug}.json`;
  });

  const posts = await Promise.all(postPaths.map((path) => fetchJson(path)));
  collectionData[name] = posts
    .slice()
    .sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
}

async function loadJoinUsRoles() {
  const listData = await fetchJson(joinUsListPath);
  const roles = Array.isArray(listData?.roles) ? listData.roles : [];

  if (!roles.length) {
    joinRoleDefinitions = [];
    return;
  }

  joinRoleDefinitions = roles
    .filter((role) => role && role.id && role.title)
    .map((role) => ({
      id: normalizeSlug(role.id),
      title: String(role.title),
      zhTitle: role.zhTitle ? String(role.zhTitle) : "",
      qualifications: Array.isArray(role.qualifications) ? role.qualifications : [],
      duties: Array.isArray(role.duties)
        ? role.duties
        : Array.isArray(role.requirements)
          ? role.requirements
          : [],
      zhQualifications: Array.isArray(role.zhQualifications) ? role.zhQualifications : [],
      zhDuties: Array.isArray(role.zhDuties)
        ? role.zhDuties
        : Array.isArray(role.zhRequirements)
          ? role.zhRequirements
          : [],
    }));

  if (!joinRoleDefinitions.length) {
    throw new Error("joinus-list.json has no valid roles.");
  }
}

async function loadSiteConfig() {
  // site-config drives dataVersion itself; fetch it directly to avoid bootstrapping stale versions.
  const config = await fetchJson(siteConfigPath, { withVersion: false });
  applySiteConfig(config);
}

async function loadAllCollections() {
  await Promise.all([
    ...Object.keys(listConfig).map((name) => loadCollection(name)),
    loadJoinUsRoles(),
  ]);
}

function pathForRoute(route) {
  const base = basePrefix(window.location.pathname);
  if (route.name === "home") {
    return `${base}/`;
  }
  if (route.name === "apply") {
    if (route.role) {
      return `${base}/apply/${encodeURIComponent(route.role)}`;
    }
    return `${base}/apply`;
  }
  if (route.name === "join-us") {
    return `${base}/join-us`;
  }
  if (route.name.endsWith("-detail")) {
    return `${base}/${route.collection}/${encodeURIComponent(route.slug)}`;
  }
  return `${base}/${route.name}`;
}

function routeFromPath(pathname) {
  const path = normalizePath(pathname);

  const applyMatch = path.match(/\/apply(?:\/([^/]+))?$/);
  if (applyMatch) {
    return {
      name: "apply",
      role: applyMatch[1] ? normalizeSlug(applyMatch[1]) : "",
    };
  }

  if (path.endsWith("/join-us")) {
    return { name: "join-us" };
  }

  for (const section of ["research", "scenario", "tutorial"]) {
    const detailMatch = path.match(new RegExp(`/${section}/([^/]+)$`));
    if (detailMatch) {
      return {
        name: `${section}-detail`,
        collection: section,
        slug: normalizeSlug(detailMatch[1]),
      };
    }

    if (path.endsWith(`/${section}`)) {
      return { name: section };
    }
  }

  return { name: "home" };
}

function getItemBySlug(collection, slug) {
  return collectionData[collection].find((item) => normalizeSlug(item.slug) === normalizeSlug(slug)) || null;
}

function renderHomeView() {
  const resolvedHomeVideoUrl = resolveDataUrl(homeVideoUrl);
  return `
    <section class="video-section" aria-label="Lab video showcase">
      <div class="video-frame">
        <video class="hero-video" autoplay muted loop playsinline preload="metadata">
          <source src="${resolvedHomeVideoUrl}" type="video/mp4" />
        </video>
      </div>
    </section>
  `;
}

function renderEmptyCollection(title, hintPath) {
  const hintTitle = localizeText(t("emptyHint"), { title: title.toLowerCase() });
  const hintHelp = localizeText(t("emptyHelp"), { path: hintPath });
  return `
    <section class="timeline" aria-label="${title} timeline">
      <article class="timeline-item">
        <div class="timeline-content">
          <div class="timeline-head">
            <h2>${hintTitle}</h2>
          </div>
          <p>${hintHelp}</p>
        </div>
      </article>
    </section>
  `;
}

function renderResearchLikeList(collection) {
  const items = collectionData[collection];
  if (!items.length) {
    return renderEmptyCollection(collectionTitles[collection], `${collection}-posts`);
  }

  const itemsMarkup = items
    .map(
      (item) => {
        const title = localizedItemValue(item, "title");
        const dateLabel = localizedItemValue(item, "dateLabel");
        const summary = localizedItemValue(item, "summary");
        return `
        <article class="timeline-item">
          <a class="timeline-link" href="${pathForRoute({ name: `${collection}-detail`, collection, slug: item.slug })}" data-route-path="${pathForRoute({ name: `${collection}-detail`, collection, slug: item.slug })}">
            <div class="timeline-content">
              <div class="timeline-head">
                <h2>${title}</h2>
                <time class="timeline-date" datetime="${item.isoDate}">${dateLabel}</time>
              </div>
              <p>${summary}</p>
            </div>
          </a>
        </article>
      `;
      }
    )
    .join("");

  return `<section class="timeline" aria-label="${collectionTitles[collection]} timeline">${itemsMarkup}</section>`;
}

function renderScenarioListView() {
  const items = collectionData.scenario;
  if (!items.length) {
    return renderEmptyCollection("Scenario", "scenario-posts");
  }

  const itemsMarkup = items
    .map(
      (item) => {
        const title = localizedItemValue(item, "title");
        const dateLabel = localizedItemValue(item, "dateLabel");
        const summary = localizedItemValue(item, "summary");
        return `
        <article class="timeline-item scenario-item">
          <a class="timeline-link scenario-link" href="${pathForRoute({ name: "scenario-detail", collection: "scenario", slug: item.slug })}" data-route-path="${pathForRoute({ name: "scenario-detail", collection: "scenario", slug: item.slug })}">
            <div class="scenario-video-wrap" aria-hidden="true">
              <video class="scenario-thumb" muted loop playsinline preload="metadata">
                <source src="${resolveDataUrl(item.videoUrl)}" type="video/mp4" />
              </video>
            </div>
            <div class="timeline-content">
              <div class="timeline-head">
                <h2>${title}</h2>
                <time class="timeline-date" datetime="${item.isoDate}">${dateLabel}</time>
              </div>
              <p>${summary}</p>
            </div>
          </a>
        </article>
      `;
      }
    )
    .join("");

  return `<section class="timeline scenario-timeline" aria-label="Scenario timeline">${itemsMarkup}</section>`;
}

function renderTutorialListItems(items) {
  return items
    .map(
      (item) => {
        const title = localizedItemValue(item, "title");
        const dateLabel = localizedItemValue(item, "dateLabel");
        const summary = localizedItemValue(item, "summary");
        return `
        <article class="timeline-item tutorial-item">
          <a class="timeline-link" href="${pathForRoute({ name: "tutorial-detail", collection: "tutorial", slug: item.slug })}" data-route-path="${pathForRoute({ name: "tutorial-detail", collection: "tutorial", slug: item.slug })}">
            <div class="timeline-content">
              <div class="timeline-head">
                <h2>${title}</h2>
                <time class="timeline-date" datetime="${item.isoDate}">${dateLabel}</time>
              </div>
              <p>${summary}</p>
            </div>
          </a>
        </article>
      `;
      }
    )
    .join("");
}

function renderTutorialListView() {
  const allItems = collectionData.tutorial;
  if (!allItems.length) {
    return renderEmptyCollection("Tutorial", "tutorial-posts");
  }

  const tracks = ["all", "vla", "slam", "motion-planning"];
  const labels = {
    all: "All",
    vla: t("tutorialTracks.vla"),
    slam: t("tutorialTracks.slam"),
    "motion-planning": t("tutorialTracks.motion-planning"),
  };

  const visibleItems =
    activeTutorialTrack === "all"
      ? allItems
      : allItems.filter((item) => {
          const track = normalizeSlug(item.track);
          return !track || track === activeTutorialTrack;
        });

  const displayItems = visibleItems.length ? visibleItems : allItems;

  const filterMarkup = tracks
    .map(
      (track) =>
        `<button class="tutorial-filter ${activeTutorialTrack === track ? "active" : ""}" type="button" data-track="${track}">${labels[track]}</button>`
    )
    .join("");

  return `
    <section class="tutorial-shell" aria-label="Tutorial list">
      <div class="tutorial-top-nav" role="tablist" aria-label="Tutorial tracks">${filterMarkup}</div>
      <section class="timeline tutorial-timeline" aria-label="Tutorial timeline">
        ${renderTutorialListItems(displayItems)}
      </section>
    </section>
  `;
}

function renderDetailView(item, collection) {
  const detailLinkLabelKey = collection === "tutorial" ? "resource" : "paper";
  const detailLinkLabelFallback = collection === "tutorial" ? "Resource" : "Paper";
  const detailLinkLabel =
    localizedItemValue(item, collection === "tutorial" ? "resourceLabel" : "paperLabel") || detailLinkLabelFallback;
  const detailLinkUrl =
    collection === "tutorial"
      ? item.resourceUrl || item.paperUrl || "#"
      : item.paperUrl || "#";
  const detailMetaMarkup =
    collection === "scenario"
      ? ""
      : `<p class="article-paper"><span>${t(`labels.${detailLinkLabelKey}`) || `${detailLinkLabel}:`}</span> <a href="${detailLinkUrl}" target="_blank" rel="noopener noreferrer">${detailLinkLabel}</a></p>`;
  const emailLabel = item.emailLabel || "arm-lab@example.com";
  const emailUrl = item.emailUrl || `mailto:${emailLabel}`;
  const videoUrl = item.videoUrl ? resolveDataUrl(item.videoUrl) : "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
  const figureUrl = item.figureUrl ? resolveDataUrl(item.figureUrl) : "";
  const videoPoster = item.videoPoster ? `poster="${item.videoPoster}"` : "";
  const title = localizedItemValue(item, "title");
  const dateLabel = localizedItemValue(item, "dateLabel");
  const body = localizedItemValue(item, "body") || item.body || [];
  const figureBlock = figureUrl
    ? `<figure class="article-figure"><img src="${figureUrl}" alt="${item.figureAlt || `${title} figure`}" loading="lazy" /></figure>`
    : "";
  const bodyMarkup = body.map((paragraph) => `<p>${paragraph}</p>`).join("");
  return `
    <article class="article-view" aria-label="${localizedCollectionTitle(collection)} article">
      <h1>${title}</h1>
      <p class="article-date"><span>${t("labels.date")}</span> ${dateLabel}</p>
      <p class="article-email"><span>${t("labels.email")}</span> <a href="${emailUrl}">${emailLabel}</a></p>
      ${detailMetaMarkup}
      <section class="article-video" aria-label="Research video">
        <div class="article-video-frame">
          <video class="article-video-player" controls autoplay muted loop playsinline preload="metadata" ${videoPoster}>
            <source src="${videoUrl}" type="video/mp4" />
          </video>
        </div>
      </section>
      ${figureBlock}
      <div class="article-body">${bodyMarkup}</div>
    </article>
  `;
}

function renderJoinUsView() {
  const joinText = t("joinUs");
  const isZh = currentLang === "zh";
  const companyText = String(joinText.company || "").replace(/[。.]\s*$/, "");
  const websiteUrl = joinText.websiteUrl || "http://www.ymbot.com/home";
  const websiteLabel = joinText.websiteLabel || "official website";
  const projectLeaderEmail = joinText.projectLeaderEmail || "cuichaochen@ymbot.com";
  const researchHeadEmail = joinText.researchHeadEmail || "omtcyang@gmail.com";
  const qualificationsLabel = joinText.qualificationsLabel || "Qualifications";
  const dutiesLabel = joinText.dutiesLabel || "Duties";
  const onlineApply = joinText.onlineApply || (isZh ? "在线申请" : "Apply Online");
  const projectLeaderLabel = joinText.projectLeaderLabel || "Project Leader Mr. Cui";
  const researchHeadLabel = joinText.researchHeadLabel || "Research Head Dr. Yang";
  const projectLeaderLink = `<a class="contact-link" href="mailto:${projectLeaderEmail}">${projectLeaderLabel}</a>`;
  const researchHeadLink = `<a class="contact-link" href="mailto:${researchHeadEmail}">${researchHeadLabel}</a>`;
  const contactTemplate =
    joinText.contactTemplate ||
    (isZh
      ? "如有任何问题，请联系（{projectLeader} 或 {researchHead}）。"
      : "Contact us ({projectLeader} or {researchHead}) if you have any questions.");
  const contactSentence = localizeText(contactTemplate, {
    projectLeader: projectLeaderLink,
    researchHead: researchHeadLink,
  });
  const jobsMarkup = joinRoleDefinitions
    .map((role) => {
      const panelId = `job-panel-${role.id}`;
      const qualifications =
        currentLang === "zh" && role.zhQualifications?.length ? role.zhQualifications : role.qualifications || [];
      const duties = currentLang === "zh" && role.zhDuties?.length ? role.zhDuties : role.duties || [];
      const roleTitle = localizedRoleTitle(role);
      const qualificationsMarkup = qualifications.map((line) => `<li>${line}</li>`).join("");
      const dutiesMarkup = duties.map((line) => `<li>${line}</li>`).join("");
      const applyPath = pathForRoute({ name: "apply", role: role.id });
      return `
        <article class="job-item">
          <button class="job-toggle" type="button" data-job-toggle="${role.id}" aria-expanded="false" aria-controls="${panelId}">
            <span>${roleTitle}</span>
            <span class="job-plus" aria-hidden="true">+</span>
          </button>
          <div class="job-panel" id="${panelId}" data-job-panel="${role.id}" hidden>
            <section class="role-detail-card" aria-label="Role details">
              <p class="job-panel-title">${qualificationsLabel}</p>
              <ul class="job-list">${qualificationsMarkup}</ul>
              <p class="job-panel-title">${dutiesLabel}</p>
              <ul class="job-list">${dutiesMarkup}</ul>
            </section>
            <a class="job-apply" href="${applyPath}" data-route-path="${applyPath}">${onlineApply}</a>
          </div>
        </article>
      `;
    })
    .join("");

  return `
    <section class="join-us-view" aria-label="Join us">
      <p>${companyText} <a href="${websiteUrl}" target="_blank" rel="noopener noreferrer">${websiteLabel}</a>${isZh ? "。" : "."}</p>
      <p>${joinText.hiring}</p>
      <p>${contactSentence}</p>
      <section class="jobs-list" aria-label="Open positions">${jobsMarkup}</section>
    </section>
  `;
}

function renderApplyLabelText(label) {
  const raw = String(label || "");
  const match = raw.match(/^(.*)([（(].*[)）])$/);
  if (!match) {
    return raw;
  }
  return `${match[1]}<span class="apply-label-hint">${match[2]}</span>`;
}

function renderApplySectionLegend(index, label) {
  return `${index}. ${renderApplyLabelText(label)}`;
}

function renderApplyView(roleId = "") {
  const text = applyText[currentLang];
  const selectedRole =
    joinRoleDefinitions.find((role) => role.id === normalizeSlug(roleId)) ||
    joinRoleDefinitions[0] ||
    null;
  const selectedQualifications = selectedRole
    ? currentLang === "zh" && selectedRole.zhQualifications?.length
      ? selectedRole.zhQualifications
      : selectedRole.qualifications || []
    : [];
  const selectedDuties = selectedRole
    ? currentLang === "zh" && selectedRole.zhDuties?.length
      ? selectedRole.zhDuties
      : selectedRole.duties || []
    : [];

  const roleDetailsMarkup = selectedRole
    ? `
      <section class="apply-role-summary role-detail-card" aria-label="Role details">
        <h2>${text.roleDetailTitle}: ${localizedRoleTitle(selectedRole)}</h2>
        <p class="job-panel-title">${text.qualificationsLabel}</p>
        <ul class="job-list">${selectedQualifications.map((line) => `<li>${line}</li>`).join("")}</ul>
        <p class="job-panel-title">${text.dutiesLabel}</p>
        <ul class="job-list">${selectedDuties.map((line) => `<li>${line}</li>`).join("")}</ul>
      </section>
    `
    : "";

  const maxSelectableYear = 2030;
  const minSelectableYear = 1970;
  const yearOptions = Array.from(
    { length: maxSelectableYear - minSelectableYear + 1 },
    (_, index) => String(maxSelectableYear - index)
  );
  const yearOptionMarkup = yearOptions.map((year) => `<option value="${year}">${year}</option>`).join("");
  const monthOptionMarkup = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return `<option value="${month}">${month}</option>`;
  }).join("");

  return `
    <section class="apply-view" aria-label="Apply form">
      ${roleDetailsMarkup}
      <form class="apply-form" data-apply-form>
        <input type="hidden" name="role" value="${selectedRole?.id || ""}" />
        <fieldset class="apply-fieldset apply-fieldset-dashed" data-apply-section="personal">
          <legend>${renderApplySectionLegend(1, text.personalInfoLabel)}</legend>
          <div class="apply-row apply-row-3">
            <label>
              <span>${text.nameLabel}</span>
              <input type="text" name="name" required />
            </label>
            <label>
              <span>${text.phoneLabel}</span>
              <input type="tel" name="phone" inputmode="tel" pattern="^1[3-9]\\d{9}$" required />
            </label>
            <label>
              <span>${text.emailLabel}</span>
              <input type="email" name="email" required />
            </label>
          </div>
        </fieldset>

        <fieldset class="apply-fieldset apply-fieldset-dashed apply-ros2-fieldset" data-apply-section="ros2">
          <legend>${renderApplySectionLegend(2, text.ros2LevelLabel)}</legend>
          <div class="apply-radio-list">
            <label class="choice-inline">
              <input type="radio" name="ros2Level" value="none" required /> ${text.ros2None}
            </label>
            <label class="choice-inline">
              <input type="radio" name="ros2Level" value="understand" required /> ${text.ros2Understand}
            </label>
            <label class="choice-inline">
              <input type="radio" name="ros2Level" value="familiar" required /> ${text.ros2Familiar}
            </label>
            <label class="choice-inline">
              <input type="radio" name="ros2Level" value="expert" required /> ${text.ros2Expert}
            </label>
          </div>
        </fieldset>

        <fieldset class="apply-fieldset apply-fieldset-dashed" data-apply-section="education">
          <legend>${renderApplySectionLegend(3, text.educationBackgroundLabel)}</legend>
          <label class="choice-inline">
            <input type="radio" name="degree" value="phd" required /> ${text.degreePhd}
          </label>
          <label class="choice-inline">
            <input type="radio" name="degree" value="master" required /> ${text.degreeMaster}
          </label>
          <label class="choice-inline">
            <input type="radio" name="degree" value="bachelor" required /> ${text.degreeBachelor}
          </label>
          <label class="choice-inline">
            <input type="radio" name="degree" value="other" required /> ${text.degreeOther}
          </label>
          <div class="apply-row apply-row-edu">
            <label class="month-picker-field">
              <span>${text.graduationDateLabel}</span>
              <div class="month-select-row">
                <select name="graduationYear" data-month-year="graduation" required>
                  <option value="">Y</option>
                  ${yearOptionMarkup}
                </select>
                <select name="graduationMonth" data-month-month="graduation" required>
                  <option value="">M</option>
                  ${monthOptionMarkup}
                </select>
              </div>
              <input type="hidden" name="graduationDate" data-month-combined="graduation" />
            </label>
            <label>
              <span>${text.schoolNameLabel}</span>
              <input type="text" name="schoolName" required />
            </label>
          </div>
        </fieldset>

        <fieldset class="apply-fieldset apply-fieldset-dashed" data-apply-section="paper">
          <legend>${renderApplySectionLegend(4, text.paperQuestionLabel)}</legend>
          <label class="choice-inline">
            <input type="radio" name="hasPaper" value="yes" data-paper-toggle="yes" required /> ${text.paperYes}
          </label>
          <label class="choice-inline">
            <input type="radio" name="hasPaper" value="no" data-paper-toggle="no" checked required /> ${text.paperNo}
          </label>
          <label>
            <span>${renderApplyLabelText(text.paperTitleLabel)}</span>
            <input type="text" name="paperTitle" data-paper-detail disabled />
          </label>
          <label>
            <span>${text.paperJournalLabel}</span>
            <input type="text" name="paperJournal" data-paper-detail disabled />
          </label>
        </fieldset>

        <fieldset class="apply-fieldset apply-fieldset-dashed" data-apply-section="project">
          <legend>${renderApplySectionLegend(5, text.projectExperienceLabel)}</legend>
          <label class="choice-inline">
            <input type="radio" name="hasProject" value="yes" data-project-toggle="yes" required /> ${text.projectYes}
          </label>
          <label class="choice-inline">
            <input type="radio" name="hasProject" value="no" data-project-toggle="no" checked required /> ${text.projectNo}
          </label>
          <label>
            <span>${renderApplyLabelText(text.projectNameLabel)}</span>
            <input type="text" name="projectName" data-project-detail disabled />
          </label>
          <fieldset class="apply-fieldset apply-inline-fieldset apply-responsibility-fieldset" data-project-detail>
            <legend>${renderApplyLabelText(text.responsibilityLabel)}</legend>
            <label class="choice-inline">
              <input type="radio" name="projectResponsibility" value="algorithm" data-project-detail disabled /> ${text.responsibilityAlgorithm}
            </label>
            <label class="choice-inline">
              <input type="radio" name="projectResponsibility" value="code" data-project-detail disabled /> ${text.responsibilityCode}
            </label>
            <label class="choice-inline">
              <input type="radio" name="projectResponsibility" value="hardware" data-project-detail disabled /> ${text.responsibilityHardware}
            </label>
            <label class="choice-inline">
              <input type="radio" name="projectResponsibility" value="writing" data-project-detail disabled /> ${text.responsibilityWriting}
            </label>
          </fieldset>
        </fieldset>

        <fieldset class="apply-fieldset apply-fieldset-dashed" data-apply-section="competition">
          <legend>${renderApplySectionLegend(6, text.competitionExperienceLabel)}</legend>
          <label class="choice-inline">
            <input type="radio" name="hasCompetition" value="yes" data-competition-toggle="yes" required /> ${text.competitionYes}
          </label>
          <label class="choice-inline">
            <input type="radio" name="hasCompetition" value="no" data-competition-toggle="no" checked required /> ${text.competitionNo}
          </label>
          <label>
            <span>${renderApplyLabelText(text.competitionNameLabel)}</span>
            <input type="text" name="competitionName" data-competition-detail disabled />
          </label>
          <fieldset class="apply-fieldset apply-inline-fieldset apply-responsibility-fieldset" data-competition-detail>
            <legend>${renderApplyLabelText(text.responsibilityLabel)}</legend>
            <label class="choice-inline">
              <input type="radio" name="competitionResponsibility" value="algorithm" data-competition-detail disabled /> ${text.responsibilityAlgorithm}
            </label>
            <label class="choice-inline">
              <input type="radio" name="competitionResponsibility" value="code" data-competition-detail disabled /> ${text.responsibilityCode}
            </label>
            <label class="choice-inline">
              <input type="radio" name="competitionResponsibility" value="hardware" data-competition-detail disabled /> ${text.responsibilityHardware}
            </label>
            <label class="choice-inline">
              <input type="radio" name="competitionResponsibility" value="writing" data-competition-detail disabled /> ${text.responsibilityWriting}
            </label>
          </fieldset>
        </fieldset>

        <div class="apply-resume-field">
          <span>${text.resumeLabel} <span class="apply-label-hint">(${text.resumeHint})</span></span>
          <div class="apply-file-picker">
            <input id="resume-upload-input" class="apply-file-input" type="file" name="resume" accept=".pdf,application/pdf" required />
            <button class="apply-file-trigger" type="button" data-resume-trigger>${text.resumeChooseFileLabel || "Choose File"}</button>
            <span class="apply-file-name" data-resume-file-name>${text.resumeNoFileLabel || "No file chosen"}</span>
          </div>
        </div>
        <button type="submit">${text.submitLabel}</button>
        <p class="apply-status" data-apply-status aria-live="polite"></p>
      </form>
    </section>
  `;
}

function setRouteTitle(route, item = null) {
  if (route.name === "home") {
    document.title = t("tabTitles.home");
    return;
  }

  if (route.name === "join-us") {
    document.title = t("tabTitles.join-us");
    return;
  }

  if (route.name === "apply") {
    document.title = currentLang === "zh" ? "申请" : "Apply";
    return;
  }

  if (route.name.endsWith("-detail") && item) {
    document.title = localizedItemValue(item, "title");
    return;
  }

  const sectionName = t(`tabTitles.${route.name}`) || route.name;
  document.title = sectionName;
}

function captureRouteTransientState() {
  const expandedRoleIds = [];
  if (!appView) {
    return { expandedRoleIds };
  }

  const expandedButtons = appView.querySelectorAll('[data-job-toggle][aria-expanded="true"]');
  for (const button of expandedButtons) {
    const roleId = button.getAttribute("data-job-toggle");
    if (roleId) {
      expandedRoleIds.push(roleId);
    }
  }

  return { expandedRoleIds };
}

function restoreJoinUsExpandedPanels(expandedRoleIds = []) {
  if (!appView || !Array.isArray(expandedRoleIds) || !expandedRoleIds.length) {
    return;
  }

  const uniqueRoleIds = [...new Set(expandedRoleIds.map((id) => normalizeSlug(id)).filter(Boolean))];
  if (!uniqueRoleIds.length) {
    return;
  }

  const allButtons = appView.querySelectorAll("[data-job-toggle]");
  const allPanels = appView.querySelectorAll("[data-job-panel]");

  for (const button of allButtons) {
    button.setAttribute("aria-expanded", "false");
    const icon = button.querySelector(".job-plus");
    if (icon) {
      icon.textContent = "+";
    }
  }

  for (const panel of allPanels) {
    panel.hidden = true;
  }

  for (const roleId of uniqueRoleIds) {
    const button = appView.querySelector(`[data-job-toggle="${roleId}"]`);
    const panel = appView.querySelector(`[data-job-panel="${roleId}"]`);
    if (!button || !panel) {
      continue;
    }
    button.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    const icon = button.querySelector(".job-plus");
    if (icon) {
      icon.textContent = "-";
    }
  }
}

function bindLanguageToggle() {
  const toggleButton = document.querySelector("[data-lang-toggle]");
  if (!toggleButton || toggleButton.dataset.bound === "true") {
    return;
  }

  toggleButton.addEventListener("click", () => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const routeState = captureRouteTransientState();
    currentLang = currentLang === "en" ? "zh" : "en";
    localStorage.setItem("arm_lang", currentLang);
    applyRoute(routeFromPath(window.location.pathname), "replace", {
      preserveScroll: true,
      expandedRoleIds: routeState.expandedRoleIds,
    });
    window.scrollTo({ top: scrollY, left: scrollX, behavior: "auto" });
  });

  toggleButton.dataset.bound = "true";
}

function bindRouteLinks() {
  for (const link of routeLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const targetRoute = link.getAttribute("data-route-link") || "home";
      applyRoute({ name: targetRoute }, "push");
    });
  }
}

function bindFloatingControls() {
  const globalBackTopButton = document.querySelector("[data-scroll-top]");
  if (globalBackTopButton) {
    globalBackTopButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const globalBackButton = document.querySelector("[data-go-back]");
  if (globalBackButton) {
    globalBackButton.addEventListener("click", () => {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      applyRoute({ name: "home" }, "push");
    });
  }

  const globalForwardButton = document.querySelector("[data-go-forward]");
  if (globalForwardButton) {
    globalForwardButton.addEventListener("click", () => {
      window.history.forward();
    });
  }
}

function bindViewInteractions() {
  if (appView && !appView.dataset.routePathDelegateBound) {
    appView.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const detailLink = target.closest("[data-route-path]");
      if (!detailLink) {
        return;
      }

      event.preventDefault();
      const nextPath = detailLink.getAttribute("data-route-path");
      if (!nextPath) {
        return;
      }

      applyRoute(routeFromPath(nextPath), "push");
    });

    appView.dataset.routePathDelegateBound = "true";
  }

  const tutorialFilterButtons = appView.querySelectorAll("[data-track]");
  for (const button of tutorialFilterButtons) {
    button.addEventListener("click", () => {
      const track = normalizeSlug(button.getAttribute("data-track"));
      if (!track) {
        return;
      }
      activeTutorialTrack = track;
      applyRoute({ name: "tutorial" }, "replace");
    });
  }

  const jobToggleButtons = appView.querySelectorAll("[data-job-toggle]");
  for (const button of jobToggleButtons) {
    button.addEventListener("click", () => {
      const roleId = button.getAttribute("data-job-toggle");
      if (!roleId) {
        return;
      }

      const panel = appView.querySelector(`[data-job-panel="${roleId}"]`);
      if (!panel) {
        return;
      }

      const expanded = button.getAttribute("aria-expanded") === "true";

      for (const otherButton of jobToggleButtons) {
        otherButton.setAttribute("aria-expanded", "false");
        const otherIcon = otherButton.querySelector(".job-plus");
        if (otherIcon) {
          otherIcon.textContent = "+";
        }
      }

      const allPanels = appView.querySelectorAll("[data-job-panel]");
      for (const otherPanel of allPanels) {
        otherPanel.hidden = true;
      }

      if (!expanded) {
        button.setAttribute("aria-expanded", "true");
        panel.hidden = false;
        const icon = button.querySelector(".job-plus");
        if (icon) {
          icon.textContent = "-";
        }
      }
    });
  }

  const applyForm = appView.querySelector("[data-apply-form]");
  if (applyForm instanceof HTMLFormElement && applyForm.dataset.bound !== "true") {
    const syncCombinedMonthValue = (prefix) => {
      const yearInput = applyForm.querySelector(`[data-month-year="${prefix}"]`);
      const monthInput = applyForm.querySelector(`[data-month-month="${prefix}"]`);
      const combinedInput = applyForm.querySelector(`[data-month-combined="${prefix}"]`);
      if (!(yearInput instanceof HTMLSelectElement) || !(monthInput instanceof HTMLSelectElement)) {
        return;
      }
      if (!(combinedInput instanceof HTMLInputElement)) {
        return;
      }

      const year = yearInput.value;
      const month = monthInput.value;
      combinedInput.value = year && month ? `${year}-${month}` : "";
    };

    const monthPrefixes = ["graduation"];
    for (const prefix of monthPrefixes) {
      const yearInput = applyForm.querySelector(`[data-month-year="${prefix}"]`);
      const monthInput = applyForm.querySelector(`[data-month-month="${prefix}"]`);
      if (yearInput instanceof HTMLSelectElement) {
        yearInput.addEventListener("change", () => syncCombinedMonthValue(prefix));
      }
      if (monthInput instanceof HTMLSelectElement) {
        monthInput.addEventListener("change", () => syncCombinedMonthValue(prefix));
      }
      syncCombinedMonthValue(prefix);
    }

    const bindToggleGroup = (toggleSelector, detailSelector) => {
      const toggles = applyForm.querySelectorAll(toggleSelector);
      const detailInputs = applyForm.querySelectorAll(detailSelector);
      const syncState = () => {
        const enabled = Array.from(toggles).some(
          (toggle) =>
            toggle instanceof HTMLInputElement && toggle.checked && toggle.value === "yes"
        );
        for (const input of detailInputs) {
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            input.disabled = !enabled;
            input.required = enabled;
            if (!enabled) {
              if (input instanceof HTMLInputElement && (input.type === "radio" || input.type === "checkbox")) {
                input.checked = false;
              } else {
                input.value = "";
              }
            }
          }
        }
      };

      for (const toggle of toggles) {
        toggle.addEventListener("change", syncState);
      }

      syncState();
      return syncState;
    };

    const syncPaperDetails = bindToggleGroup("[data-paper-toggle]", "[data-paper-detail]");
    const syncProjectDetails = bindToggleGroup("[data-project-toggle]", "[data-project-detail]");
    const syncCompetitionDetails = bindToggleGroup("[data-competition-toggle]", "[data-competition-detail]");

    const resumeInput = applyForm.querySelector('input[name="resume"]');
    const resumeTrigger = applyForm.querySelector("[data-resume-trigger]");
    const resumeFileNameNode = applyForm.querySelector("[data-resume-file-name]");
    const syncResumeFileName = () => {
      if (!(resumeFileNameNode instanceof HTMLElement)) {
        return;
      }
      const text = applyText[currentLang];
      if (!(resumeInput instanceof HTMLInputElement) || !resumeInput.files || !resumeInput.files.length) {
        resumeFileNameNode.textContent = text.resumeNoFileLabel || "No file chosen";
        return;
      }
      resumeFileNameNode.textContent = resumeInput.files[0]?.name || text.resumeNoFileLabel || "No file chosen";
    };

    if (resumeTrigger instanceof HTMLButtonElement && resumeInput instanceof HTMLInputElement) {
      resumeTrigger.addEventListener("click", () => {
        resumeInput.click();
      });
    }

    if (resumeInput instanceof HTMLInputElement) {
      resumeInput.addEventListener("change", syncResumeFileName);
    }

    syncResumeFileName();

    const clearFieldsetAlerts = () => {
      const highlighted = applyForm.querySelectorAll(".apply-fieldset--alert");
      for (const node of highlighted) {
        node.classList.remove("apply-fieldset--alert");
      }
    };

    const markSectionAlert = (sectionName, shouldScroll = false) => {
      const section = applyForm.querySelector(`[data-apply-section="${sectionName}"]`);
      if (section instanceof HTMLElement) {
        section.classList.add("apply-fieldset--alert");
        if (shouldScroll) {
          section.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    };

    let firstInvalidHandled = false;
    const submitButton = applyForm.querySelector('button[type="submit"]');
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.addEventListener("click", () => {
        firstInvalidHandled = false;
        clearFieldsetAlerts();
      });
    }

    applyForm.addEventListener(
      "invalid",
      (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const section = target.closest("[data-apply-section]");
        if (section instanceof HTMLElement) {
          section.classList.add("apply-fieldset--alert");
          if (!firstInvalidHandled) {
            firstInvalidHandled = true;
            section.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      },
      true
    );

    const clearFieldsetAlertOnInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const section = target.closest("[data-apply-section]");
      if (section instanceof HTMLElement) {
        section.classList.remove("apply-fieldset--alert");
      }
    };

    applyForm.addEventListener("input", clearFieldsetAlertOnInput);
    applyForm.addEventListener("change", clearFieldsetAlertOnInput);

    applyForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = applyForm.querySelector("[data-apply-status]");
      if (!status) {
        return;
      }

      const setApplyStatus = (message, kind = "neutral") => {
        status.textContent = message;
        status.classList.remove("apply-status--success", "apply-status--error");
        if (kind === "success") {
          status.classList.add("apply-status--success");
        } else if (kind === "error") {
          status.classList.add("apply-status--error");
        }
      };

      const text = applyText[currentLang];
      const submittingText = currentLang === "zh" ? "提交中..." : "Submitting...";
      const setSubmittingState = (isSubmitting) => {
        if (!(submitButton instanceof HTMLButtonElement)) {
          return;
        }
        if (isSubmitting) {
          submitButton.dataset.idleLabel = submitButton.textContent || text.submitLabel;
          submitButton.disabled = true;
          submitButton.classList.add("is-submitting");
          submitButton.textContent = submittingText;
          return;
        }
        submitButton.disabled = false;
        submitButton.classList.remove("is-submitting");
        submitButton.textContent = submitButton.dataset.idleLabel || text.submitLabel;
      };

      setApplyStatus("", "neutral");
      clearFieldsetAlerts();
      setSubmittingState(true);

      const formData = new FormData(applyForm);
      const roleId = normalizeSlug(formData.get("role"));
      const applicantName = String(formData.get("name") || "").trim();
      const phone = String(formData.get("phone") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const hasPaper = String(formData.get("hasPaper") || "").trim();
      const paperTitle = String(formData.get("paperTitle") || "").trim();
      const paperJournal = String(formData.get("paperJournal") || "").trim();
      const hasProject = String(formData.get("hasProject") || "").trim();
      const projectName = String(formData.get("projectName") || "").trim();
      const projectResponsibility = String(formData.get("projectResponsibility") || "").trim();
      const hasCompetition = String(formData.get("hasCompetition") || "").trim();
      const competitionName = String(formData.get("competitionName") || "").trim();
      const competitionResponsibility = String(formData.get("competitionResponsibility") || "").trim();
      const resumeFile = formData.get("resume");

      const phonePattern = /^1[3-9]\d{9}$/;
      if (!phonePattern.test(phone)) {
        markSectionAlert("personal", true);
        setApplyStatus(text.invalidPhone, "error");
        setSubmittingState(false);
        return;
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        markSectionAlert("personal", true);
        setApplyStatus(text.invalidEmail, "error");
        setSubmittingState(false);
        return;
      }

      if (hasPaper === "yes" && (!paperTitle || !paperJournal)) {
        markSectionAlert("paper", true);
        setApplyStatus(text.invalidPaper, "error");
        setSubmittingState(false);
        return;
      }

      if (hasProject === "yes" && (!projectName || !projectResponsibility)) {
        markSectionAlert("project", true);
        setApplyStatus(text.invalidProject, "error");
        setSubmittingState(false);
        return;
      }

      if (hasCompetition === "yes" && (!competitionName || !competitionResponsibility)) {
        markSectionAlert("competition", true);
        setApplyStatus(text.invalidCompetition, "error");
        setSubmittingState(false);
        return;
      }

      if (!(resumeFile instanceof File) || resumeFile.size <= 0) {
        setApplyStatus(text.invalidResumeType, "error");
        setSubmittingState(false);
        return;
      }

      const isPdfFile =
        resumeFile.type === "application/pdf" || /\.pdf$/i.test(resumeFile.name || "");
      if (!isPdfFile) {
        setApplyStatus(text.invalidResumeType, "error");
        setSubmittingState(false);
        return;
      }

      const maxResumeSize = 10 * 1024 * 1024;
      if (resumeFile.size > maxResumeSize) {
        setApplyStatus(text.invalidResumeSize, "error");
        setSubmittingState(false);
        return;
      }

      const role = joinRoleDefinitions.find((item) => item.id === roleId);

      if (!supabaseConfig.enabled || !supabaseClient) {
        setApplyStatus(text.missingEndpoint, "error");
        setSubmittingState(false);
        return;
      }
      const roleTitle = localizedRoleTitle(role) || roleId;
      const payload = collectApplicationPayload({
        text,
        role,
        roleId,
        formData,
        applicantName,
        phone,
        email,
        hasPaper,
        paperTitle,
        paperJournal,
        hasProject,
        projectName,
        projectResponsibility,
        hasCompetition,
        competitionName,
        competitionResponsibility,
      });

      try {
        const resumeUpload = await uploadResumeToSupabase(resumeFile, roleId);

        const applicationId = await insertApplicationRecord({
          role_id: roleId,
          role_title: roleTitle,
          lang: currentLang,
          applicant_name: applicantName,
          phone,
          email,
          ros2_level: payload.ros2.levelKey,
          degree: payload.education.degreeKey,
          graduation_date: payload.education.graduationDate,
          school_name: payload.education.schoolName,
          has_paper: hasPaper === "yes",
          paper_title: payload.paper.title,
          paper_journal: payload.paper.journal,
          has_project: hasProject === "yes",
          project_name: payload.project.name,
          project_responsibility: payload.project.responsibilityKey,
          has_competition: hasCompetition === "yes",
          competition_name: payload.competition.name,
          competition_responsibility: payload.competition.responsibilityKey,
          resume_bucket: resumeUpload.bucket,
          resume_path: resumeUpload.path,
          payload,
        });

        await triggerApplicationEmail(applicationId);

        setApplyStatus(`${text.successPrefix} ${roleTitle} ${text.successSuffix}`, "success");
        applyForm.reset();
        firstInvalidHandled = false;
        syncPaperDetails();
        syncProjectDetails();
        syncCompetitionDetails();
        syncResumeFileName();
        setSubmittingState(false);
      } catch (error) {
        const message = String(error?.message || "");
        if (message.includes("SUPABASE_NOT_CONFIGURED")) {
          setApplyStatus(text.missingEndpoint, "error");
        } else {
          setApplyStatus(text.submitFailed, "error");
        }
        setSubmittingState(false);
      }
    });

    applyForm.dataset.bound = "true";
  }
}

function updateNavActive(route) {
  const activeRouteName =
    route.name === "apply"
      ? "join-us"
      : route.name.endsWith("-detail")
        ? route.collection
        : route.name;

  for (const link of routeLinks) {
    const targetRoute = link.getAttribute("data-route-link");
    link.classList.toggle("active", targetRoute === activeRouteName);
    link.setAttribute("href", pathForRoute({ name: targetRoute }));
  }
}

function renderRoute(route) {
  let nextMarkup = "";
  let detailItem = null;

  if (route.name === "home") {
    nextMarkup = renderHomeView();
  } else if (route.name === "research") {
    nextMarkup = renderResearchLikeList("research");
  } else if (route.name === "scenario") {
    nextMarkup = renderScenarioListView();
  } else if (route.name === "tutorial") {
    nextMarkup = renderTutorialListView();
  } else if (route.name === "join-us") {
    nextMarkup = renderJoinUsView();
  } else if (route.name === "apply") {
    nextMarkup = renderApplyView(route.role || "");
  } else if (route.name.endsWith("-detail")) {
    const item = getItemBySlug(route.collection, route.slug);
    if (!item) {
      route = { name: route.collection };
      if (route.name === "scenario") {
        nextMarkup = renderScenarioListView();
      } else if (route.name === "tutorial") {
        nextMarkup = renderTutorialListView();
      } else {
        nextMarkup = renderResearchLikeList(route.name);
      }
    } else {
      detailItem = item;
      nextMarkup = renderDetailView(item, route.collection);
    }
  } else {
    route = { name: "home" };
    nextMarkup = renderHomeView();
  }

  return { route, nextMarkup, detailItem };
}

function applyRoute(route, mode = "replace", options = {}) {
  if (!appView) {
    return;
  }

  const { preserveScroll = false, expandedRoleIds = [] } = options;

  applyLocalizedShellText();

  const rendered = renderRoute(route);
  appView.innerHTML = rendered.nextMarkup;

  if (introSection) {
    introSection.hidden = rendered.route.name !== "home";
  }

  setRouteTitle(rendered.route, rendered.detailItem);
  updateNavActive(rendered.route);
  bindViewInteractions();
  if (rendered.route.name === "join-us") {
    restoreJoinUsExpandedPanels(expandedRoleIds);
  }

  const targetPath = pathForRoute(rendered.route);
  if (mode === "push" && window.location.pathname !== targetPath) {
    window.history.pushState({ route: rendered.route }, "", targetPath);
  }

  if (rendered.route.name === "apply" && !preserveScroll) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}

window.addEventListener("popstate", () => {
  applyRoute(routeFromPath(window.location.pathname));
});

async function startApp() {
  if (!appView) {
    return;
  }

  let loadError = null;

  try {
    await loadSiteConfig();
    await loadAllCollections();
  } catch (error) {
    loadError = error;
  }

  if (loadError) {
    if (introSection) {
      introSection.hidden = true;
    }
    appView.innerHTML =
      `<section class="join-us-view"><h1>Data Load Error</h1><p>Could not load required JSON configuration/content. Check site-config.json and list JSON files.</p></section>`;
    return;
  }

  bindRouteLinks();
  bindLanguageToggle();
  bindFloatingControls();
  applyLocalizedShellText();

  applyRoute(routeFromPath(window.location.pathname));
}

startApp();
