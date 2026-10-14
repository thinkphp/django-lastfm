(() => {
  const form = document.querySelector("#search-form");
  const usernameInput = document.querySelector("#username");
  const results = document.querySelector("#results");
  const status = document.querySelector("#status");
  const content = document.querySelector("#track-content");
  const resultsUser = document.querySelector("#results-user");
  const count = document.querySelector("#track-count");
  const trackList = document.querySelector("#track-list");
  const loadArea = document.querySelector("#load-more-area");
  const loadButton = document.querySelector("#load-more");
  const loadError = document.querySelector("#load-more-error");
  const BATCH_SIZE = 10;

  let username = "";
  let cachedTracks = [];
  let visibleTracks = [];
  let hasMore = false;
  let requestId = 0;
  let loadingMore = false;

  function setStatus(kind, title, message = "") {
    status.hidden = false;
    status.className = `state-card ${kind === "error" ? "error-state" : ""}`;
    status.replaceChildren();
    const icon = document.createElement("span");
    icon.className = kind === "error" ? "error-icon" : "loader";
    if (kind === "error") icon.textContent = "!";
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    copy.append(heading);
    if (message) {
      const detail = document.createElement("p");
      detail.textContent = message;
      copy.append(detail);
    }
    status.append(icon, copy);
    content.hidden = true;
  }

  function updateLoadButton() {
    loadArea.hidden = !(hasMore || visibleTracks.length < cachedTracks.length);
    loadButton.disabled = loadingMore;
    loadButton.querySelector(".button-label").textContent = loadingMore ? "Loading..." : "Load more";
    loadButton.querySelector(".button-arrow").hidden = loadingMore;
    if (loadingMore && !loadButton.querySelector(".loader")) {
      const spinner = document.createElement("span");
      spinner.className = "loader small-loader";
      loadButton.prepend(spinner);
    } else if (!loadingMore) {
      loadButton.querySelector(".loader")?.remove();
    }
  }

  function renderTracks() {
    content.hidden = false;
    status.hidden = true;
    resultsUser.replaceChildren(document.createTextNode(username));
    const dot = document.createElement("span");
    dot.className = "heading-dot";
    dot.textContent = ".";
    resultsUser.append(dot);
    count.textContent = String(visibleTracks.length).padStart(2, "0");
    trackList.replaceChildren();

    visibleTracks.forEach((track, index) => {
      const row = document.createElement("a");
      row.className = "track-row";
      row.href = track.url || "#";
      row.target = "_blank";
      row.rel = "noopener noreferrer";

      const number = document.createElement("span");
      number.className = "track-index";
      number.textContent = String(index + 1).padStart(2, "0");
      const image = document.createElement("img");
      image.className = "cover";
      image.src = track.image_url || "";
      image.alt = `${track.name} cover art`;
      const info = document.createElement("span");
      info.className = "track-info";
      const title = document.createElement("strong");
      title.textContent = track.name;
      const artist = document.createElement("span");
      artist.textContent = track.artist;
      info.append(title, artist);
      const arrow = document.createElement("span");
      arrow.className = "play-mark";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      row.append(number, image, info, arrow);
      trackList.append(row);
    });

    updateLoadButton();
  }

  async function fetchBatch(offset, currentRequest) {
    const params = new URLSearchParams({ user: username, offset: String(offset) });
    const response = await fetch(`/api/recent-tracks?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load tracks.");
    if (currentRequest !== requestId) return null;
    return payload;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nextUsername = usernameInput.value.trim();
    if (!nextUsername) return;

    username = nextUsername;
    const currentRequest = ++requestId;
    cachedTracks = [];
    visibleTracks = [];
    hasMore = false;
    loadingMore = false;
    results.hidden = false;
    loadError.hidden = true;
    setStatus("loading", "Following the sound...", `Fetching recent plays for ${username}`);

    try {
      const payload = await fetchBatch(0, currentRequest);
      if (!payload) return;
      cachedTracks = payload.tracks || [];
      visibleTracks = cachedTracks.slice(0, BATCH_SIZE);
      hasMore = Boolean(payload.has_more);
      if (!visibleTracks.length) {
        setStatus("error", "No recent tracks found.", "Try another Last.fm username.");
        return;
      }
      renderTracks();
    } catch (error) {
      if (currentRequest !== requestId) return;
      setStatus("error", "We couldn’t find that listening history.", error.message);
    }
  });

  loadButton.addEventListener("click", async () => {
    if (loadingMore) return;
    loadError.hidden = true;
    if (visibleTracks.length < cachedTracks.length) {
      visibleTracks = cachedTracks.slice(0, visibleTracks.length + BATCH_SIZE);
      renderTracks();
      return;
    }
    if (!hasMore) return;

    loadingMore = true;
    updateLoadButton();
    const currentRequest = requestId;
    try {
      const payload = await fetchBatch(cachedTracks.length, currentRequest);
      if (!payload) return;
      cachedTracks = [...cachedTracks, ...(payload.tracks || [])];
      hasMore = Boolean(payload.has_more);
      visibleTracks = cachedTracks.slice(0, visibleTracks.length + BATCH_SIZE);
      loadingMore = false;
      if (!payload.tracks?.length && !hasMore) {
        updateLoadButton();
        return;
      }
      renderTracks();
    } catch (error) {
      if (currentRequest !== requestId) return;
      loadingMore = false;
      loadError.textContent = error.message;
      loadError.hidden = false;
      updateLoadButton();
    }
  });
})();
