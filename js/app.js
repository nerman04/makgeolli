import { db } from "./db.js";
import {
  score,
  overall,
  filterLogs,
  statistics,
  toCSV,
  safeImageURL,
  localDate,
} from "./utils.js";
const $ = (id) => document.getElementById(id);
const state = {
  logs: [],
  favorites: [],
  filter: "all",
  editing: null,
  current: null,
  image: null,
  thumbnail: null,
  dirty: false,
  busy: false,
  loading: false,
  revision: 0,
  loaded: false,
  photoBusy: false,
};
const cacheKey = "makgeolli.logs.v5",
  favoriteKey = "makgeolli.favorites.v5";
const readLocal = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};
const element = (tag, className, text) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};
const dateText = (date) =>
  Number.isNaN(Date.parse(date))
    ? "날짜 미상"
    : new Date(date).toLocaleDateString("ko-KR");
const ratingText = (value) =>
  score(value) ? `★ ${score(value).toFixed(1)}` : "미평가";
let toastTimer,
  imageToken = 0,
  previewURL = null;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function errorMessage(error) {
  return error.name === "AbortError"
    ? "응답이 지연되고 있습니다. 새로고침으로 저장 여부를 확인해 주세요."
    : navigator.onLine
      ? "서버 요청에 실패했습니다. 연결 및 접근 권한을 확인하고 다시 시도해 주세요."
      : "인터넷 연결이 끊겼습니다. 연결 후 다시 시도해 주세요.";
}
function placeholder() {
  const node = element("div", "no-photo");
  node.append(
    element("span", "mini-bottle", "탁"),
    element("span", "", "아직 사진이 없어요"),
  );
  return node;
}
function addPhoto(container, url, alt) {
  const safe = safeImageURL(url);
  if (!safe) {
    container.append(placeholder());
    return;
  }
  const image = new Image();
  image.alt = alt;
  image.loading = "lazy";
  image.src = safe;
  image.addEventListener("error", () => image.replaceWith(placeholder()), {
    once: true,
  });
  container.append(image);
}
function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
function leaveForm() {
  return (
    !state.dirty || confirm("저장하지 않은 내용이 있습니다. 나가시겠어요?")
  );
}
function renderStats() {
  const stats = statistics(state.logs);
  $("stats").replaceChildren();
  for (const [label, value, unit] of [
    ["기록한 막걸리", stats.count, "잔"],
    ["나의 평균 평점", stats.average, "/ 5"],
    ["발견한 지역·양조장", stats.regions, "곳"],
    ["마음에 든 막걸리", stats.best, "잔 · 4점 이상"],
  ]) {
    const card = element("div", "stat");
    const number = element("strong", "", value);
    number.append(element("small", "", unit));
    card.append(element("span", "", label), number);
    $("stats").append(card);
  }
  $("total-count").textContent = state.logs.length;
}
function renderRegions() {
  const selected = $("region-filter").value;
  const regions = [
    ...new Set(state.logs.map((log) => log.region).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ko"));
  $("region-filter").replaceChildren(new Option("모든 지역", ""));
  $("regions").replaceChildren();
  for (const region of regions) {
    $("region-filter").add(new Option(region, region));
    $("regions").append(new Option(region, region));
  }
  $("region-filter").value = regions.includes(selected) ? selected : "";
}
function renderList() {
  renderStats();
  const logs = filterLogs(state.logs, {
    query: $("search").value,
    region: $("region-filter").value,
    sort: $("sort").value,
    filter: state.filter,
    favorites: state.favorites,
  });
  $("result-count").textContent = `${logs.length}개의 기록`;
  $("makgeolli-list").replaceChildren();
  $("makgeolli-list").setAttribute("aria-busy", String(state.loading));
  if (!logs.length) {
    const empty = element("div", "empty-state");
    const filtered =
      $("search").value || $("region-filter").value || state.filter !== "all";
    empty.append(
      element(
        "h3",
        "",
        state.loading
          ? "기록을 불러오고 있어요"
          : filtered
            ? "조건에 맞는 기록이 없어요"
            : state.loaded
              ? "당신의 첫 번째 한 잔을 기다려요"
              : "기록을 불러오지 못했어요",
      ),
      element(
        "p",
        "",
        filtered
          ? "검색어나 필터를 바꾸어 선반을 다시 살펴보세요."
          : state.loaded
            ? "오늘 만난 막걸리의 이름과 느낌을 남겨보세요."
            : "연결 상태를 확인한 후 새로고침해 주세요.",
      ),
    );
    const button = element(
      "button",
      "button primary",
      filtered
        ? "필터 초기화"
        : state.loaded
          ? "＋ 첫 기록 남기기"
          : "다시 불러오기",
    );
    button.addEventListener(
      "click",
      filtered
        ? resetFilters
        : state.loaded
          ? () => navigate("#add")
          : loadLogs,
    );
    empty.append(button);
    $("makgeolli-list").append(empty);
    return;
  }
  for (const log of logs) {
    const card = element("article", "card");
    const open = element("button", "card-open");
    open.type = "button";
    open.setAttribute("aria-label", `${log.name} 상세 보기`);
    const photo = element("div", "card-image");
    addPhoto(photo, log.thumbnail || log.image, log.name);
    const body = element("div", "card-body");
    const bottom = element("div", "card-bottom");
    const sort = $("sort").value;
    const value =
      sort === "ratingTaste"
        ? log.ratingTaste
        : sort === "ratingPrice"
          ? log.ratingPrice
          : overall(log);
    const prefix =
      sort === "ratingTaste" ? "맛 " : sort === "ratingPrice" ? "가성비 " : "";
    bottom.append(
      element("span", "score", prefix + ratingText(value)),
      element("span", "", dateText(log.date)),
    );
    body.append(
      element(
        "p",
        "card-region",
        `${log.region || "지역 미기록"}${log.alcohol !== null && log.alcohol !== "" && log.alcohol !== undefined ? " · " + log.alcohol + "%" : ""}`,
      ),
      element("h3", "", log.name),
      bottom,
    );
    open.append(photo, body);
    open.addEventListener("click", () =>
      navigate("#detail/" + encodeURIComponent(log.id)),
    );
    const favorite = element(
      "button",
      "favorite",
      state.favorites.includes(String(log.id)) ? "♥" : "♡",
    );
    favorite.setAttribute("aria-label", `${log.name} 다시 마실 술`);
    favorite.setAttribute(
      "aria-pressed",
      String(state.favorites.includes(String(log.id))),
    );
    favorite.addEventListener("click", () => toggleFavorite(log.id));
    card.append(open, favorite);
    $("makgeolli-list").append(card);
  }
}
function resetFilters() {
  $("search").value = "";
  $("region-filter").value = "";
  state.filter = "all";
  syncChips();
  renderList();
}
function syncChips() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
function toggleFavorite(id) {
  const key = String(id);
  const next = state.favorites.includes(key)
    ? state.favorites.filter((value) => value !== key)
    : [...state.favorites, key];
  if (!writeLocal(favoriteKey, next)) {
    toast("브라우저 저장 공간에 접근할 수 없어 표시를 저장하지 못했습니다.");
    return;
  }
  state.favorites = next;
  renderList();
  if (state.current) renderDetail(state.current);
}
async function loadLogs() {
  if (state.loading) return;
  state.loading = true;
  $("refresh-btn").disabled = true;
  $("load-error").hidden = true;
  renderList();
  try {
    const revision = state.revision;
    const fetched = await db.getAllLogs();
    if (revision !== state.revision) return;
    state.logs = fetched;
    state.loaded = true;
    const cached = writeLocal(cacheKey, {
      savedAt: new Date().toISOString(),
      logs: state.logs,
    });
    $("connection").textContent = cached
      ? "클라우드 연결됨"
      : "클라우드 연결됨 · 캐시 불가";
    renderRegions();
  } catch (error) {
    console.error(error);
    $("load-error").textContent =
      errorMessage(error) +
      (state.logs.length ? " 마지막으로 불러온 기록을 표시합니다." : "");
    $("load-error").hidden = false;
    $("connection").textContent = "연결 확인 필요";
  } finally {
    state.loading = false;
    $("refresh-btn").disabled = false;
    renderList();
  }
}
function setPreview(image) {
  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  const url =
    image instanceof Blob
      ? (previewURL = URL.createObjectURL(image))
      : safeImageURL(image);
  $("image-preview").hidden = !url;
  $("photo-placeholder").hidden = !!url;
  $("remove-image").hidden = !url;
  if (url) $("image-preview").src = url;
  else $("image-preview").removeAttribute("src");
}
function prepareForm(log = null) {
  imageToken++;
  state.photoBusy = false;
  state.editing = log;
  state.image = log?.image || null;
  state.thumbnail = log?.thumbnail || null;
  $("add-form").reset();
  $("name").value = log?.name || "";
  $("region").value = log?.region || "";
  $("alcohol").value = log?.alcohol ?? "";
  $("date").value =
    log?.date && !Number.isNaN(Date.parse(log.date))
      ? localDate(new Date(log.date))
      : localDate();
  $("memo").value = log?.memo || "";
  for (const key of ["ratingOverall", "ratingPrice", "ratingTaste"])
    $(key).value = score(
      key === "ratingOverall" && log ? overall(log) : log?.[key],
    );
  $("input-camera").value = "";
  $("input-gallery").value = "";
  $("form-error").hidden = true;
  $("form-title").textContent = log
    ? "한 잔의 기록 다듬기"
    : "새로운 한 잔 기록하기";
  $("save-btn").textContent = log ? "수정 저장하기" : "기록 저장하기";
  $("save-btn").disabled = false;
  setPreview(state.image);
  state.dirty = false;
}
async function resize(file, maxSize) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      maxSize / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("사진 변환 실패"))),
        "image/jpeg",
        0.82,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function choosePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
    toast("15MB 이하의 이미지 파일을 선택해 주세요.");
    event.target.value = "";
    return;
  }
  const token = ++imageToken;
  state.photoBusy = true;
  $("save-btn").disabled = true;
  try {
    const image = await resize(file, 1600);
    const thumbnail = await resize(image, 480);
    if (token !== imageToken) return;
    state.image = image;
    state.thumbnail = thumbnail;
    state.dirty = true;
    setPreview(image);
  } catch (error) {
    if (token === imageToken)
      toast("사진을 읽을 수 없습니다. JPG 또는 PNG 사진을 선택해 주세요.");
  } finally {
    event.target.value = "";
    if (token === imageToken) {
      state.photoBusy = false;
      $("save-btn").disabled = false;
    }
  }
}
async function save(event) {
  event.preventDefault();
  if (state.busy || state.photoBusy) return;
  const name = $("name").value.trim();
  if (!name) {
    $("name").setCustomValidity("막걸리 이름을 입력해 주세요.");
    $("name").reportValidity();
    return;
  }
  if (!navigator.onLine) {
    $("form-error").textContent =
      "저장하려면 인터넷 연결이 필요합니다. 입력 내용은 이 화면에 유지됩니다.";
    $("form-error").hidden = false;
    return;
  }
  const selectedDate = $("date").value;
  const previous = state.editing;
  const date =
    previous?.date && selectedDate === localDate(new Date(previous.date))
      ? previous.date
      : new Date(selectedDate + "T12:00:00").toISOString();
  const data = {
    name,
    region: $("region").value.trim(),
    alcohol: $("alcohol").value === "" ? null : Number($("alcohol").value),
    memo: $("memo").value.trim(),
    date,
    image: state.image,
    thumbnail: state.thumbnail,
  };
  for (const key of ["ratingOverall", "ratingPrice", "ratingTaste"])
    data[key] = score($(key).value);
  state.busy = true;
  $("save-btn").disabled = true;
  $("save-btn").textContent = "저장 중…";
  $("form-error").hidden = true;
  try {
    const saved = await db.saveLog(data, previous);
    state.revision++;
    const exists = state.logs.some(
      (log) => String(log.id) === String(saved.id),
    );
    state.logs = exists
      ? state.logs.map((log) =>
          String(log.id) === String(saved.id) ? saved : log,
        )
      : [saved, ...state.logs];
    writeLocal(cacheKey, {
      savedAt: new Date().toISOString(),
      logs: state.logs,
    });
    state.loaded = true;
    state.dirty = false;
    renderRegions();
    renderList();
    navigate("#detail/" + encodeURIComponent(saved.id));
    toast(previous ? "기록을 수정했습니다." : "새로운 한 잔을 기록했습니다.");
  } catch (error) {
    console.error(error);
    $("form-error").textContent =
      errorMessage(error) +
      " 입력한 내용은 유지됩니다. 저장 결과가 불확실하면 다시 저장하기 전에 선반에서 확인해 주세요.";
    $("form-error").hidden = false;
  } finally {
    state.busy = false;
    $("save-btn").disabled = false;
    $("save-btn").textContent = previous ? "수정 저장하기" : "기록 저장하기";
  }
}
function renderDetail(log) {
  state.current = log;
  const layout = element("div", "detail-layout");
  const photo = element("div", "detail-photo");
  addPhoto(photo, log.image || log.thumbnail, log.name);
  const info = element("div", "detail-info");
  const title = element("h1", "", log.name);
  title.id = "detail-name";
  title.tabIndex = -1;
  info.append(element("p", "eyebrow", "THE TASTING NOTE"), title);
  const facts = element("div", "detail-facts");
  facts.append(
    element("span", "", log.region || "지역 미기록"),
    element(
      "span",
      "",
      log.alcohol === null || log.alcohol === undefined || log.alcohol === ""
        ? "도수 미기록"
        : `${log.alcohol}%`,
    ),
  );
  const ratings = element("div", "detail-ratings");
  for (const [label, value] of [
    ["종합 만족도", overall(log)],
    ["맛", log.ratingTaste],
    ["가성비", log.ratingPrice],
  ]) {
    const row = element("div", "detail-rating");
    row.append(
      element("span", "", label),
      element("span", "score", ratingText(value)),
    );
    ratings.append(row);
  }
  info.append(
    facts,
    ratings,
    element("h2", "", "한 잔의 기억"),
    element(
      "p",
      "detail-memo",
      log.memo || "아직 메모가 없어요. 기억이 생생할 때 남겨보세요.",
    ),
    element("p", "detail-date", dateText(log.date) + "의 기록"),
  );
  const actions = element("div", "detail-actions");
  const edit = element("button", "button primary", "기록 수정");
  edit.onclick = () => navigate("#edit/" + encodeURIComponent(log.id));
  const favorite = element(
    "button",
    "button secondary",
    state.favorites.includes(String(log.id))
      ? "♥ 다시 마실 술"
      : "♡ 다시 마실 술",
  );
  favorite.setAttribute(
    "aria-pressed",
    String(state.favorites.includes(String(log.id))),
  );
  favorite.onclick = () => toggleFavorite(log.id);
  const remove = element("button", "button danger", "삭제");
  remove.onclick = () => deleteLog(log, remove);
  actions.append(edit, favorite, remove);
  info.append(actions);
  layout.append(photo, info);
  $("detail-content").replaceChildren(layout);
}
async function deleteLog(log, button) {
  if (
    state.busy ||
    !confirm(
      `“${log.name}” 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.`,
    )
  )
    return;
  state.busy = true;
  button.disabled = true;
  try {
    await db.deleteLog(log.id);
    state.revision++;
    state.logs = state.logs.filter(
      (item) => String(item.id) !== String(log.id),
    );
    state.favorites = state.favorites.filter((id) => id !== String(log.id));
    writeLocal(favoriteKey, state.favorites);
    writeLocal(cacheKey, {
      savedAt: new Date().toISOString(),
      logs: state.logs,
    });
    renderRegions();
    navigate("#list");
    toast("기록을 삭제했습니다.");
  } catch (error) {
    console.error(error);
    toast(errorMessage(error));
  } finally {
    state.busy = false;
    button.disabled = false;
  }
}
let currentHash = "",
  routeToken = 0;
async function route() {
  const token = ++routeToken;
  let hash = location.hash || "#list";
  if (currentHash === hash) return;
  if (state.busy) {
    history.replaceState(null, "", currentHash || "#list");
    toast("처리가 끝날 때까지 잠시 기다려 주세요.");
    return;
  }
  if (currentHash.startsWith("#add") || currentHash.startsWith("#edit/")) {
    if (!leaveForm()) {
      history.replaceState(null, "", currentHash);
      return;
    }
    state.dirty = false;
  }
  let view = "list";
  state.current = null;
  if (hash === "#add") {
    prepareForm();
    view = "add";
  } else if (hash.startsWith("#detail/") || hash.startsWith("#edit/")) {
    let id;
    try {
      id = decodeURIComponent(hash.split("/")[1]);
    } catch {
      navigate("#list");
      return;
    }
    let log = state.logs.find((item) => String(item.id) === id);
    if (!log) {
      try {
        log = await db.getLog(id);
      } catch (error) {
        toast(errorMessage(error));
      }
      if (token !== routeToken) return;
    }
    if (!log) {
      toast("기록을 찾을 수 없습니다.");
      navigate("#list");
      return;
    }
    if (hash.startsWith("#edit/")) {
      prepareForm(log);
      view = "add";
    } else {
      renderDetail(log);
      view = "detail";
    }
  } else if (hash !== "#list") {
    history.replaceState(null, "", "#list");
    hash = "#list";
  }
  currentHash = hash;
  for (const name of ["list", "add", "detail"])
    $(name + "-view").hidden = name !== view;
  if (view === "list") renderList();
  window.scrollTo({ top: 0, behavior: "instant" });
  $(
    view === "list"
      ? "page-title"
      : view === "add"
        ? "form-title"
        : "detail-name",
  )?.focus({ preventScroll: true });
}
function download(content, type, extension) {
  if (!state.loaded) {
    toast("먼저 기록을 불러와 주세요.");
    return;
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = `탁주일기-${localDate()}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("전체 기록을 내보냈습니다. 사진은 URL로 포함됩니다.");
}
function registerUpdates() {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || document.getElementById("update-btn")) return;
    const button = element("button", "button secondary", "새 버전 적용");
    button.id = "update-btn";
    button.type = "button";
    button.onclick = () => {
      if (state.busy || state.photoBusy) {
        toast("저장 또는 사진 처리가 끝난 후 적용해 주세요.");
        return;
      }
      if (!leaveForm()) return;
      state.dirty = false;
      location.reload();
    };
    document.querySelector(".header-actions").prepend(button);
    toast("새 버전이 준비됐습니다. 상단의 새 버전 적용을 눌러 주세요.");
  });
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((registration) => {
      const check = () => registration.update().catch(console.warn);
      check();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && navigator.onLine) check();
      });
    })
    .catch(console.warn);
}

function init() {
  const favorites = readLocal(favoriteKey, []);
  state.favorites = Array.isArray(favorites) ? favorites.map(String) : [];
  const cached = readLocal(cacheKey, null);
  if (Array.isArray(cached?.logs)) {
    state.logs = cached.logs.filter(
      (log) => log && log.id != null && typeof log.name === "string",
    );
    state.loaded = true;
    renderRegions();
    $("connection").textContent = "저장된 기록 표시 중";
  }
  for (const [key, label] of [
    ["ratingOverall", "종합 만족도"],
    ["ratingTaste", "맛"],
    ["ratingPrice", "가성비"],
  ]) {
    const row = element("div", "rating-row");
    const title = element("label", "", label);
    title.htmlFor = key;
    const select = element("select");
    select.id = key;
    select.add(new Option("미평가", "0"));
    for (let i = 1; i <= 5; i++)
      select.add(new Option("★".repeat(i) + ` · ${i}점`, String(i)));
    row.append(title, select);
    $("rating-fields").append(row);
  }
  document
    .querySelectorAll("[data-add]")
    .forEach((button) => (button.onclick = () => navigate("#add")));
  document
    .querySelectorAll("[data-back]")
    .forEach((button) => (button.onclick = () => navigate("#list")));
  document.querySelectorAll("[data-filter]").forEach(
    (button) =>
      (button.onclick = () => {
        state.filter = button.dataset.filter;
        syncChips();
        renderList();
      }),
  );
  $("search").oninput = renderList;
  $("region-filter").onchange = renderList;
  $("sort").onchange = renderList;
  $("refresh-btn").onclick = loadLogs;
  $("export-btn").onclick = () =>
    download(toCSV(state.logs), "text/csv;charset=utf-8", "csv");
  $("backup-btn").onclick = () =>
    download(
      JSON.stringify(
        { version: 1, exportedAt: new Date().toISOString(), logs: state.logs },
        null,
        2,
      ),
      "application/json",
      "json",
    );
  $("add-form").onsubmit = save;
  $("add-form").oninput = () => (state.dirty = true);
  $("name").addEventListener("input", () => $("name").setCustomValidity(""));
  $("btn-camera").onclick = () => $("input-camera").click();
  $("btn-gallery").onclick = () => $("input-gallery").click();
  $("input-camera").onchange = choosePhoto;
  $("input-gallery").onchange = choosePhoto;
  $("remove-image").onclick = () => {
    imageToken++;
    state.photoBusy = false;
    state.image = null;
    state.thumbnail = null;
    state.dirty = true;
    $("save-btn").disabled = false;
    setPreview(null);
  };
  document.querySelectorAll("[data-prompt]").forEach(
    (button) =>
      (button.onclick = () => {
        const text = [$("memo").value, button.dataset.prompt]
          .filter(Boolean)
          .join(" ");
        if (text.length <= 5000) $("memo").value = text;
        state.dirty = true;
        $("memo").focus();
      }),
  );
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (event) => {
    if (state.dirty || state.busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("offline", () => {
    $("connection").textContent = "오프라인";
    toast("오프라인입니다. 불러온 기록은 계속 볼 수 있어요.");
  });
  window.addEventListener("online", () => {
    $("connection").textContent = "온라인 · 새로고침 가능";
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    $("install-btn").hidden = false;
    $("install-btn").onclick = async () => {
      await event.prompt();
      $("install-btn").hidden = true;
    };
  });
  window.addEventListener(
    "appinstalled",
    () => ($("install-btn").hidden = true),
  );
  renderList();
  route();
  loadLogs();
  if ("serviceWorker" in navigator && location.protocol !== "file:")
    registerUpdates();
}
init();
