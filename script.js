const appView = document.getElementById("app-view");
const routeLinks = document.querySelectorAll("[data-route-link]");
const introSection = document.querySelector(".intro");

const routeSections = ["research", "scenario", "tutorial", "join-us"];
const siteConfigPath = "site-config.json";
let dataVersion = "20260503";
const scriptElement = document.querySelector('script[src$="script.js"]');
const assetBaseUrl = scriptElement ? new URL(".", scriptElement.src) : new URL("./", window.location.href);
let homeVideoUrl = "home-posts/video/home.mp4";

let listConfig = {
  research: "research-list.json",
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

let activeTutorialTrack = "model";
let currentLang = localStorage.getItem("arm_lang") === "zh" ? "zh" : "en";
let pendingRouteScrollOverride = null;
let lastViewportScroll = { x: 0, y: 0 };

let uiText = null;

function t(path) {
  const keys = path.split(".");
  let node = uiText[currentLang];
  for (const key of keys) {
    node = node?.[key];
  }
  return node;
}

function captureViewportScroll() {
  lastViewportScroll = { x: window.scrollX, y: window.scrollY };
  return lastViewportScroll;
}

function applySiteConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("site-config.json is invalid.");
  }

  if (!config.uiText?.en || !config.uiText?.zh) {
    throw new Error("site-config.json missing uiText locales.");
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

  uiText = config.uiText;
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

function localizedRoadmapValue(node, key) {
  if (currentLang === "zh") {
    const zhKey = `zh${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (node?.[zhKey]) {
      return node[zhKey];
    }
  }
  return node?.[key] || "";
}

function localizedCollectionTitle(collection) {
  if (collection === "join-us") {
    return t("tabTitles.join-us");
  }
  return t(`tabTitles.${collection}`) || collectionTitles[collection] || collection;
}

function roadmapMonthIndex(node) {
  const raw = String(node?.dateLabel || node?.timeModelLabel || "").trim();
  const ymMatch = raw.match(/(\d{4})[-/.](\d{1,2})/);
  if (ymMatch) {
    const year = Number(ymMatch[1]);
    const month = Number(ymMatch[2]);
    return year * 12 + Math.max(0, Math.min(11, month - 1));
  }

  const yearMatch = raw.match(/(\d{4})/);
  if (yearMatch) {
    return Number(yearMatch[1]) * 12;
  }

  return Number.MAX_SAFE_INTEGER;
}

function roadmapNodeUnits(node) {
  const dateText = String(node?.dateLabel || node?.timeModelLabel || "").trim();
  const modelText = String(node?.modelLabel || node?.timeModelLabel || "").trim();
  const baseLen = Math.max(1, [...modelText].length, [...dateText].length);
  return Math.max(6, Math.ceil(baseLen * 1.1) + 1);
}

function splitRoadmapIntoSnakeLanes(nodes) {
  const shellWidth = Math.max(320, appView?.clientWidth || window.innerWidth || 980);
  const charWidthPx = 8.8;
  const maxUnits = Math.max(24, Math.floor((shellWidth - 220) / charWidthPx));
  const gapUnits = 3;

  const lanes = [];
  let currentLane = [];
  let usedUnits = 0;

  for (const node of nodes) {
    const nodeUnits = roadmapNodeUnits(node);
    const nextUsedUnits = currentLane.length ? usedUnits + gapUnits + nodeUnits : nodeUnits;
    const laneIndex = lanes.length;
    const laneDirection = laneIndex % 2 === 0 ? "forward" : "reverse";
    const remainingUnitsOnActiveEdge = maxUnits - nextUsedUnits;
    const edgeSafetyUnits = Math.max(2, Math.ceil(nodeUnits * 0.18));
    const hitsEdgeInForwardLane = laneDirection === "forward" && remainingUnitsOnActiveEdge < edgeSafetyUnits;
    const hitsEdgeInReverseLane = laneDirection === "reverse" && remainingUnitsOnActiveEdge < edgeSafetyUnits;

    // In forward lanes, the newly appended node is the visual right edge;
    // in reverse lanes, it is the visual left edge. Wrap when edge room is insufficient.
    if (currentLane.length && (nextUsedUnits > maxUnits || hitsEdgeInForwardLane || hitsEdgeInReverseLane)) {
      lanes.push(currentLane);
      currentLane = [node];
      usedUnits = nodeUnits;
      continue;
    }

    currentLane.push(node);
    usedUnits = nextUsedUnits;
  }

  if (currentLane.length) {
    lanes.push(currentLane);
  }

  return lanes;
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

  const introRepoText = document.querySelector("[data-i18n-intro-repo]");
  if (introRepoText) {
    introRepoText.innerHTML = t("introRepoHtml") || "";
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
  if (!listPath) {
    collectionData[name] = [];
    return;
  }

  let listData = null;
  try {
    listData = await fetchJson(listPath);
  } catch (error) {
    console.warn(`Skip ${name}: failed to load list ${listPath}.`, error);
    collectionData[name] = [];
    return;
  }
  const baseDir = listPath.slice(0, listPath.lastIndexOf("/") + 1);

  const resolvePostPath = (post) => {
    const configuredPath = String(post?.path || "").trim();
    if (configuredPath) {
      if (/^(?:https?:)?\/\//i.test(configuredPath) || configuredPath.startsWith("/")) {
        return configuredPath;
      }

      // Keep project-root style paths unchanged (for example: "research-posts/foo.json").
      if (configuredPath.startsWith(`${name}-posts/`)) {
        return configuredPath;
      }

      return `${baseDir}${configuredPath}`;
    }

    return `${baseDir}${name}-posts/${post.slug}.json`;
  };

  const postPaths = (listData.posts || []).map((post) => resolvePostPath(post));

  const postResults = await Promise.allSettled(postPaths.map((path) => fetchJson(path)));
  const posts = postResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  const failedCount = postResults.length - posts.length;
  if (failedCount > 0) {
    console.warn(`Skip ${failedCount} broken ${name} post(s) from ${listPath}.`);
  }

  collectionData[name] = posts
    .slice()
    .sort((a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime());
}

async function loadSiteConfig() {
  // site-config drives dataVersion itself; fetch it directly to avoid bootstrapping stale versions.
  const config = await fetchJson(siteConfigPath, { withVersion: false });
  applySiteConfig(config);
}

async function loadAllCollections() {
  const results = await Promise.allSettled([...Object.keys(listConfig).map((name) => loadCollection(name))]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("A collection loader failed and was ignored.", result.reason);
    }
  }
}

function pathForRoute(route) {
  const base = basePrefix(window.location.pathname);
  if (route.name === "home") {
    return `${base}/`;
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

function restoreRouteFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const encodedPath = params.get("p");
  if (!encodedPath) {
    return;
  }

  let decodedPath = encodedPath;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    decodedPath = encodedPath;
  }

  if (!decodedPath.startsWith("/")) {
    decodedPath = `/${decodedPath}`;
  }

  const base = basePrefix(window.location.pathname);
  const routePath = decodedPath === "/" ? (base || "/") : `${base}${decodedPath}`;

  const encodedSearch = params.get("q");
  const encodedHash = params.get("h");

  let searchPart = "";
  let hashPart = "";

  if (encodedSearch) {
    try {
      searchPart = decodeURIComponent(encodedSearch);
    } catch {
      searchPart = encodedSearch;
    }
    searchPart = searchPart ? `?${searchPart}` : "";
  }

  if (encodedHash) {
    try {
      hashPart = decodeURIComponent(encodedHash);
    } catch {
      hashPart = encodedHash;
    }
    hashPart = hashPart ? `#${hashPart}` : "";
  }

  window.history.replaceState(null, "", `${routePath}${searchPart}${hashPart}`);
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
  const normalizedTitle = currentLang === "zh" ? String(title) : String(title).toLowerCase();
  const hintTitle = localizeText(t("emptyHint"), { title: normalizedTitle });
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
    return renderEmptyCollection(localizedCollectionTitle(collection), `${collection}-posts`);
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

  return `<section class="timeline" aria-label="${localizedCollectionTitle(collection)} timeline">${itemsMarkup}</section>`;
}

function renderScenarioListView() {
  const items = collectionData.scenario;
  if (!items.length) {
    return renderEmptyCollection(localizedCollectionTitle("scenario"), "scenario-posts");
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

  return `<section class="timeline scenario-timeline" aria-label="${localizedCollectionTitle("scenario")} timeline">${itemsMarkup}</section>`;
}

function renderTutorialListItems(items) {
  return items
    .map(
      (item) => {
        const title = localizedItemValue(item, "title");
        const summary = localizedItemValue(item, "summary");

        if (Array.isArray(item.roadmap) && item.roadmap.length) {
          const sortedRoadmap = [...item.roadmap].sort((a, b) => {
            const monthA = roadmapMonthIndex(a);
            const monthB = roadmapMonthIndex(b);
            if (monthA !== monthB) {
              return monthA - monthB;
            }
            return String(a?.modelLabel || a?.timeModelLabel || "").localeCompare(
              String(b?.modelLabel || b?.timeModelLabel || "")
            );
          });
          const lanes = splitRoadmapIntoSnakeLanes(sortedRoadmap);

          const roadmapMarkup = lanes
            .map((laneNodes, laneIndex) => {
              const laneDirection = laneIndex % 2 === 0 ? "forward" : "reverse";
              const laneNodesMarkup = laneNodes
                .map((node, nodeIndex) => {
                  const dateText = String(localizedRoadmapValue(node, "dateLabel") || node.timeModelLabel || "").trim();
                  const modelText = String(localizedRoadmapValue(node, "modelLabel") || node.timeModelLabel || "").trim();
                  const modelCharCount = roadmapNodeUnits(node);
                  const modelUrl = String(node.modelUrl || "").trim();
                  const dateMarkup = `<span class="roadmap-point-text roadmap-date">${dateText}</span>`;
                  const modelMarkup = modelUrl
                    ? `<a class="roadmap-point-link roadmap-model" href="${resolveDataUrl(modelUrl)}" target="_blank" rel="noopener noreferrer">${modelText}</a>`
                    : `<span class="roadmap-point-text roadmap-model">${modelText}</span>`;

                  return `
                    <article class="tutorial-roadmap-point" style="--model-ch:${modelCharCount};">
                      <div class="tutorial-roadmap-info">
                        ${dateMarkup}
                        ${modelMarkup}
                      </div>
                      <span class="tutorial-roadmap-dot" aria-hidden="true"></span>
                    </article>
                  `;
                })
                .join("");

              const connectorMarkup =
                laneIndex < lanes.length - 1
                  ? `<div class="tutorial-roadmap-turn ${laneDirection === "forward" ? "at-right" : "at-left"}" aria-hidden="true"></div>`
                  : "";

              return `
                <div class="tutorial-roadmap-lane ${laneDirection}">
                  ${laneNodesMarkup}
                </div>
                ${connectorMarkup}
              `;
            })
            .join("");

          return `
            <article class="timeline-item tutorial-item tutorial-roadmap-entry">
              <div class="timeline-head tutorial-roadmap-title">
                <h2>${title}</h2>
              </div>
              <div class="tutorial-roadmap-item">
                <div class="tutorial-roadmap" aria-label="${title} roadmap">
                  ${roadmapMarkup}
                </div>
              </div>
            </article>
          `;
        }

        return `
        <article class="timeline-item tutorial-item">
          <a class="timeline-link" href="${pathForRoute({ name: "tutorial-detail", collection: "tutorial", slug: item.slug })}" data-route-path="${pathForRoute({ name: "tutorial-detail", collection: "tutorial", slug: item.slug })}">
            <div class="timeline-content">
              <div class="timeline-head">
                <h2>${title}</h2>
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
    return renderEmptyCollection(localizedCollectionTitle("tutorial"), "tutorial-posts");
  }

  const tracks = ["model", "data", "competition"];
  const labels = {
    model: t("tutorialTracks.model"),
    data: t("tutorialTracks.data"),
    competition: t("tutorialTracks.competition"),
  };

  const visibleItems = allItems.filter((item) => {
    const track = normalizeSlug(item.track);
    return track === activeTutorialTrack;
  });

  const itemsMarkup = visibleItems.length
    ? renderTutorialListItems(visibleItems)
    : (() => {
        const activeLabelRaw = String(labels[activeTutorialTrack] || localizedCollectionTitle("tutorial"));
        const activeLabel = currentLang === "zh" ? activeLabelRaw : activeLabelRaw.toLowerCase();
        const hintTitle = localizeText(t("emptyHint"), { title: activeLabel });
        const hintHelp = localizeText(t("emptyHelp"), { path: "tutorial-posts" });
        return `
          <article class="timeline-item tutorial-item">
            <div class="timeline-content">
              <div class="timeline-head">
                <h2>${hintTitle}</h2>
              </div>
              <p>${hintHelp}</p>
            </div>
          </article>
        `;
      })();

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
        ${itemsMarkup}
      </section>
    </section>
  `;
}

function normalizeMediaLayout(layout, fallback = "double") {
  const raw = String(layout || "").trim().toLowerCase();
  if (raw === "single" || raw === "1" || raw === "single-column" || raw === "singlecolumn" || raw === "鍗曟爮") {
    return "single";
  }
  if (raw === "double" || raw === "2" || raw === "double-column" || raw === "doublecolumn" || raw === "鍙屾爮") {
    return "double";
  }
  return fallback;
}

function normalizeDetailVideos(item) {
  const videos = [];
  const defaultVideoTitle = currentLang === "zh" ? "瑙嗛" : "Video";

  if (Array.isArray(item.videos)) {
    for (const [index, video] of item.videos.entries()) {
      if (typeof video === "string" && video.trim()) {
        videos.push({
          url: resolveDataUrl(video.trim()),
          poster: "",
          title: `${defaultVideoTitle} ${index + 1}`,
          caption: "",
          layout: "double",
        });
        continue;
      }

      if (video && typeof video === "object" && video.url) {
        videos.push({
          url: resolveDataUrl(String(video.url)),
          poster: video.poster ? resolveDataUrl(String(video.poster)) : "",
          title: video.title ? String(video.title) : `${defaultVideoTitle} ${index + 1}`,
          caption: video.caption ? String(video.caption) : "",
          layout: normalizeMediaLayout(video.layout),
        });
      }
    }
  }

  if (!videos.length && item.videoUrl) {
    videos.push({
      url: resolveDataUrl(item.videoUrl),
      poster: item.videoPoster ? resolveDataUrl(item.videoPoster) : "",
      title: defaultVideoTitle,
      caption: "",
      layout: "single",
    });
  }

  return videos;
}

function normalizeDetailFigures(item, title) {
  const figures = [];
  const figureSuffix = currentLang === "zh" ? "图" : "figure";

  if (Array.isArray(item.figures)) {
    for (const [index, figure] of item.figures.entries()) {
      if (typeof figure === "string" && figure.trim()) {
        figures.push({
          url: resolveDataUrl(figure.trim()),
          alt: `${title} ${figureSuffix} ${index + 1}`,
          caption: "",
          layout: "double",
        });
        continue;
      }

      if (figure && typeof figure === "object" && figure.url) {
        figures.push({
          url: resolveDataUrl(String(figure.url)),
          alt: figure.alt ? String(figure.alt) : `${title} ${figureSuffix} ${index + 1}`,
          caption: figure.caption ? String(figure.caption) : "",
          layout: normalizeMediaLayout(figure.layout),
        });
      }
    }
  }

  if (!figures.length && item.figureUrl) {
    figures.push({
      url: resolveDataUrl(item.figureUrl),
      alt: localizedItemValue(item, "figureAlt") || item.figureAlt || `${title} ${figureSuffix}`,
      caption: item.figureCaption || "",
      layout: "single",
    });
  }

  return figures;
}

function renderDetailMediaGallery(item, title, options = {}) {
  const includeFigures = options.includeFigures !== false;
  const includeVideos = options.includeVideos !== false;
  const videos = normalizeDetailVideos(item);
  const figures = normalizeDetailFigures(item, title);

  if ((!includeVideos || !videos.length) && (!includeFigures || !figures.length)) {
    return "";
  }

  const videosMarkup = videos
    .map((video) => {
      const posterAttr = video.poster ? `poster="${video.poster}"` : "";
      const caption = [video.title, video.caption].filter(Boolean).join(" - ");
      return `
        <figure class="article-media-card article-media-video article-media-layout-${video.layout}">
          <div class="article-video-frame">
            <video class="article-video-player" controls playsinline preload="metadata" ${posterAttr}>
              <source src="${video.url}" type="video/mp4" />
            </video>
          </div>
          ${caption ? `<figcaption>${caption}</figcaption>` : ""}
        </figure>
      `;
    })
    .join("");

  const figuresMarkup = figures
    .map(
      (figure) => `
        <figure class="article-media-card article-figure article-media-layout-${figure.layout}">
          <img src="${figure.url}" alt="${figure.alt}" loading="lazy" />
          ${figure.caption ? `<figcaption>${figure.caption}</figcaption>` : ""}
        </figure>
      `
    )
    .join("");

  const videoHeading = currentLang === "zh" ? "瑙嗛" : "Videos";
  const figureHeading = currentLang === "zh" ? "鍥剧墖" : "Figures";

  return `
    <section class="article-media-gallery" aria-label="Media gallery">
      ${includeFigures && figures.length ? `<section class="article-media-group" aria-label="Figure group"><h2 class="article-media-heading">${figureHeading}</h2><div class="article-media-grid">${figuresMarkup}</div></section>` : ""}
      ${includeVideos && videos.length ? `<section class="article-media-group" aria-label="Video group"><h2 class="article-media-heading">${videoHeading}</h2><div class="article-media-grid">${videosMarkup}</div></section>` : ""}
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
    detailLinkUrl && detailLinkUrl !== "#"
      ? `<p class="article-paper"><span>${t(`labels.${detailLinkLabelKey}`) || `${detailLinkLabel}:`}</span> <a href="${detailLinkUrl}" target="_blank" rel="noopener noreferrer">${detailLinkLabel}</a></p>`
      : "";
  const emailLabel = item.emailLabel || "arm-lab@example.com";
  const emailUrl = item.emailUrl || `mailto:${emailLabel}`;
  const title = localizedItemValue(item, "title");
  const dateLabel = localizedItemValue(item, "dateLabel");
  const body = localizedItemValue(item, "body") || item.body || [];
  const isScenarioDetail = collection === "scenario";
  const figureGalleryMarkup = isScenarioDetail
    ? ""
    : renderDetailMediaGallery(item, title, { includeFigures: true, includeVideos: false });
  const videoGalleryMarkup = renderDetailMediaGallery(item, title, { includeFigures: false, includeVideos: true });
  const bodyMarkup = body.map((paragraph) => `<p>${paragraph}</p>`).join("");
  const contentMarkup = isScenarioDetail
    ? `${videoGalleryMarkup}<div class="article-body">${bodyMarkup}</div>`
    : `${figureGalleryMarkup}<div class="article-body">${bodyMarkup}</div>${videoGalleryMarkup}`;
  return `
    <article class="article-view" aria-label="${localizedCollectionTitle(collection)} article">
      <h1>${title}</h1>
      <p class="article-date"><span>${t("labels.date")}</span> ${dateLabel}</p>
      <p class="article-email"><span>${t("labels.email")}</span> <a href="${emailUrl}">${emailLabel}</a></p>
      ${detailMetaMarkup}
      ${contentMarkup}
    </article>
  `;
}

function renderJoinUsView() {
  const splitContactLabel = (label, fallbackRole, fallbackName) => {
    const raw = String(label || "").trim();
    if (!raw) {
      return { role: fallbackRole, name: fallbackName };
    }

    if (raw.endsWith(fallbackName)) {
      const role = raw.slice(0, raw.length - fallbackName.length).trim();
      return { role: role || fallbackRole, name: fallbackName };
    }

    const idx = raw.lastIndexOf(" ");
    if (idx > 0 && idx < raw.length - 1) {
      return {
        role: raw.slice(0, idx).trim() || fallbackRole,
        name: raw.slice(idx + 1).trim() || fallbackName,
      };
    }

    return { role: fallbackRole, name: raw || fallbackName };
  };

  const joinText = t("joinUs");
  const companyText = String(joinText.company || "");
  const researchHeadEmail = joinText.researchHeadEmail || "omtcyang@gmail.com";
  const researchHeadLabel = joinText.researchHeadLabel || "Research Head Dr. Chuang YANG";
  const researchHeadParts = splitContactLabel(
    researchHeadLabel,
    currentLang === "zh" ? "研究负责人" : "Research Head",
    "Dr. Chuang YANG"
  );
  const researchHeadLink = `<span class="contact-role">${researchHeadParts.role}</span> <a class="contact-link" href="mailto:${researchHeadEmail}">${researchHeadParts.name}</a>`;
  const contactTemplate =
    joinText.contactTemplate ||
    (currentLang === "zh"
      ? "如果你想加入我们团队或有任何其他问题，请联系（{researchHead}）。"
      : "Contact me ({researchHead}) if you want to join our team or have any other questions.");
  const contactSentence = localizeText(contactTemplate, {
    researchHead: researchHeadLink,
  });

  return `
    <section class="join-us-view" aria-label="Join us">
      <p>${companyText}</p>
      ${joinText.hiring ? `<p>${joinText.hiring}</p>` : ""}
      <p>${contactSentence}</p>
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

  if (route.name.endsWith("-detail") && item) {
    document.title = localizedItemValue(item, "title");
    return;
  }

  const sectionName = t(`tabTitles.${route.name}`) || route.name;
  document.title = sectionName;
}

function bindLanguageToggle() {
  const toggleButton = document.querySelector("[data-lang-toggle]");
  if (!toggleButton || toggleButton.dataset.bound === "true") {
    return;
  }

  toggleButton.addEventListener("click", () => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    currentLang = currentLang === "en" ? "zh" : "en";
    localStorage.setItem("arm_lang", currentLang);
    applyRoute(routeFromPath(window.location.pathname), "replace", { preserveScroll: true });
    window.scrollTo({ top: scrollY, left: scrollX, behavior: "auto" });
  });

  toggleButton.dataset.bound = "true";
}

function bindRouteLinks() {
  for (const link of routeLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const targetRoute = link.getAttribute("data-route-link") || "home";
      applyRoute({ name: targetRoute }, "push", { scrollOverride: captureViewportScroll() });
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
        pendingRouteScrollOverride = captureViewportScroll();
        window.history.back();
        return;
      }
      applyRoute({ name: "home" }, "push", { scrollOverride: captureViewportScroll() });
    });
  }

  const globalForwardButton = document.querySelector("[data-go-forward]");
  if (globalForwardButton) {
    globalForwardButton.addEventListener("click", () => {
      pendingRouteScrollOverride = captureViewportScroll();
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

      applyRoute(routeFromPath(nextPath), "push", { scrollOverride: captureViewportScroll() });
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
      applyRoute({ name: "tutorial" }, "replace", { scrollOverride: captureViewportScroll() });
    });
  }
}

function updateNavActive(route) {
  const activeRouteName = route.name.endsWith("-detail") ? route.collection : route.name;

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

function restoreViewportScroll(left, top) {
  window.scrollTo({ top, left, behavior: "auto" });
  requestAnimationFrame(() => {
    window.scrollTo({ top, left, behavior: "auto" });
  });
  lastViewportScroll = { x: left, y: top };
}

function restoreViewportScrollForRoute(routeName, left, top) {
  restoreViewportScroll(left, top);
  if (routeName === "home") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top, left, behavior: "auto" });
      });
    });
  }
}

function applyRoute(route, mode = "replace", options = {}) {
  if (!appView) {
    return;
  }

  const { preserveScroll = true, scrollOverride = null } = options;
  const scrollX = preserveScroll ? (scrollOverride?.x ?? lastViewportScroll.x ?? window.scrollX) : 0;
  const scrollY = preserveScroll ? (scrollOverride?.y ?? lastViewportScroll.y ?? window.scrollY) : 0;

  applyLocalizedShellText();

  const rendered = renderRoute(route);
  appView.innerHTML = rendered.nextMarkup;

  if (introSection) {
    introSection.hidden = rendered.route.name !== "home";
  }

  setRouteTitle(rendered.route, rendered.detailItem);
  updateNavActive(rendered.route);
  bindViewInteractions();

  const targetPath = pathForRoute(rendered.route);
  if (mode === "push" && window.location.pathname !== targetPath) {
    window.history.pushState({ route: rendered.route }, "", targetPath);
  }

  if (preserveScroll) {
    restoreViewportScrollForRoute(rendered.route.name, scrollX, scrollY);
  }
}

window.addEventListener("popstate", () => {
  const scrollOverride = pendingRouteScrollOverride || captureViewportScroll();
  pendingRouteScrollOverride = null;
  applyRoute(routeFromPath(window.location.pathname), "replace", { scrollOverride });
});

async function startApp() {
  if (!appView) {
    return;
  }

  window.addEventListener("scroll", captureViewportScroll, { passive: true });
  captureViewportScroll();

  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  restoreRouteFromQuery();

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
    const titleText = currentLang === "zh" ? "数据加载失败" : "Data Load Error";
    const bodyText =
      currentLang === "zh"
        ? "无法加载所需的 JSON 配置或内容，请检查 site-config.json 与列表 JSON 文件。"
        : "Could not load required JSON configuration/content. Check site-config.json and list JSON files.";
    appView.innerHTML =
      `<section class="join-us-view"><h1>${titleText}</h1><p>${bodyText}</p></section>`;
    return;
  }

  bindRouteLinks();
  bindLanguageToggle();
  bindFloatingControls();
  applyLocalizedShellText();

  applyRoute(routeFromPath(window.location.pathname));
}

startApp();
