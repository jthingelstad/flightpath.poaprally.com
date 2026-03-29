/* ============================================================
   Flight Path — Board + Globe UI
   ============================================================ */

(function () {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  const state = {
    view: "board", // "board" or "globe"
    selectedAddress: null,
    flightArcs: [],
    animationStep: 0,
    playing: false,
    playTimer: null,
    speedMs: [3000, 2000, 1500, 1000, 500],
    globeInitialized: false,
    globe: null,
  };

  // Build lookup maps
  const airportByCode = {};
  AIRPORTS.forEach((a) => (airportByCode[a.code] = a));

  const claimsByAddress = {};
  CLAIMS.forEach((c) => {
    if (!claimsByAddress[c.address]) claimsByAddress[c.address] = [];
    claimsByAddress[c.address].push(c);
  });

  // Sort each address's claims by timestamp
  Object.values(claimsByAddress).forEach((arr) =>
    arr.sort((a, b) => a.created.localeCompare(b.created))
  );

  // Build team lookup
  const teamById = {};
  if (typeof TEAMS !== "undefined" && TEAMS.teams) {
    TEAMS.teams.forEach((t) => (teamById[t.id] = t));
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  function truncateAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  function trackEvent(name, value) {
    const el = document.getElementById("tinylytics-tracker");
    if (!el) return;
    el.setAttribute("data-tinylytics-event", name);
    if (value) {
      el.setAttribute("data-tinylytics-event-value", value);
    } else {
      el.removeAttribute("data-tinylytics-event-value");
    }
    el.click();
  }

  // ------------------------------------------------------------------
  // View switching
  // ------------------------------------------------------------------

  function showBoard() {
    state.view = "board";
    document.getElementById("board-view").style.display = "flex";
    document.getElementById("globe-view").style.display = "none";
    updateURL();
  }

  function showGlobe() {
    state.view = "globe";
    document.getElementById("board-view").style.display = "none";
    document.getElementById("globe-view").style.display = "block";

    if (!state.globeInitialized) {
      initGlobe();
      state.globeInitialized = true;
    } else {
      handleGlobeResize();
    }
    updateURL();
  }

  // ------------------------------------------------------------------
  // Board: Stats
  // ------------------------------------------------------------------

  function renderStats() {
    const claimedCount = AIRPORTS.filter((a) => a.claims > 0).length;
    document.getElementById("stat-airports").textContent =
      claimedCount < AIRPORTS.length
        ? `${claimedCount}/${AIRPORTS.length}`
        : AIRPORTS.length;
    document.getElementById("stat-claims").textContent = CLAIMS.length;
    document.getElementById("stat-travelers").textContent =
      LEADERBOARDS.addresses.length;
  }

  // ------------------------------------------------------------------
  // Board: Tab switching
  // ------------------------------------------------------------------

  function setupBoardTabs() {
    document.querySelectorAll(".board-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".board-tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".board-panel")
          .forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document
          .getElementById(`panel-${tab.dataset.tab}`)
          .classList.add("active");
      });
    });
  }

  // ------------------------------------------------------------------
  // Board: Team leaderboard
  // ------------------------------------------------------------------

  const BADGE_LABELS = {
    ens_regex: "ENS",
    poap_holders: "POAP",
    anon: "ANON",
    first_airport: "HOME",
    month_started: "MONTH",
  };

  function renderTeamLeaderboard() {
    const tbody = document.getElementById("lb-teams");
    if (!TEAMS || !TEAMS.leaderboard) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center; color: var(--board-text-muted); padding: 2rem;">No teams data available</td></tr>';
      return;
    }

    tbody.innerHTML = TEAMS.leaderboard
      .map(
        (t, i) => `
        <tr data-team-id="${t.id}">
          <td><span class="board-rank">${i + 1}</span></td>
          <td>
            <span class="board-team-name">${t.name}</span>
            <span class="board-badge board-badge--${t.type}">${BADGE_LABELS[t.type] || t.type}</span>
          </td>
          <td class="col-num"><span class="board-value">${t.member_count}</span></td>
          <td class="col-num"><span class="board-value">${t.unique_airports}</span></td>
          <td class="col-num"><span class="board-value board-value--highlight">${t.total_claims}</span></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const teamId = row.dataset.teamId;
        if (teamId) showTeamDetail(teamId);
      });
    });
  }

  function showTeamDetail(teamId) {
    const team = teamById[teamId];
    if (!team) return;

    trackEvent("teams.detail", team.name);

    document.getElementById("teams-list").style.display = "none";
    document.getElementById("teams-detail").style.display = "block";

    // Render header
    const header = document.getElementById("team-header");
    header.innerHTML = `
      <div class="team-detail-header">
        <div class="team-detail-name">
          ${team.name}
          <span class="board-badge board-badge--${team.type}">${BADGE_LABELS[team.type] || team.type}</span>
        </div>
        ${team.description ? `<div class="team-detail-desc">${team.description}</div>` : ""}
        <div class="team-detail-stats">
          <div class="team-detail-stat"><strong>${team.member_count}</strong> members</div>
          <div class="team-detail-stat"><strong>${team.total_claims}</strong> claims</div>
          <div class="team-detail-stat"><strong>${team.unique_airports}</strong> airports</div>
        </div>
      </div>
    `;

    // Render members
    const tbody = document.getElementById("team-members");
    tbody.innerHTML = team.members
      .map(
        (m, i) => `
        <tr data-address="${m.address}">
          <td><span class="board-rank">${i + 1}</span></td>
          <td>${
            m.ens
              ? `<span class="board-ens">${m.ens}</span>`
              : `<span class="board-address">${truncateAddress(m.address)}</span>`
          }</td>
          <td class="col-num"><span class="board-value board-value--highlight">${m.airport_count}</span></td>
        </tr>`
      )
      .join("");

    // Click member → show on globe
    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const address = row.dataset.address;
        if (address) {
          showGlobe();
          selectAddress(address);
        }
      });
    });
  }

  function hideTeamDetail() {
    document.getElementById("teams-list").style.display = "block";
    document.getElementById("teams-detail").style.display = "none";
  }

  // ------------------------------------------------------------------
  // Board: Traveler leaderboard
  // ------------------------------------------------------------------

  function renderTravelerLeaderboard() {
    const tbody = document.getElementById("lb-travelers");
    tbody.innerHTML = LEADERBOARDS.addresses
      .map(
        (a, i) => `
        <tr data-address="${a.address}">
          <td><span class="board-rank">${i + 1}</span></td>
          <td>${
            a.ens
              ? `<span class="board-ens">${a.ens}</span>`
              : `<span class="board-address">${truncateAddress(a.address)}</span>`
          }</td>
          <td class="col-num"><span class="board-value board-value--highlight">${a.airport_count}</span></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const address = row.dataset.address;
        showGlobe();
        selectAddress(address);
      });
    });
  }

  // ------------------------------------------------------------------
  // Board: Airport leaderboard
  // ------------------------------------------------------------------

  function renderAirportLeaderboard() {
    const tbody = document.getElementById("lb-airports");
    tbody.innerHTML = LEADERBOARDS.airports
      .map(
        (a, i) => `
        <tr data-code="${a.code}">
          <td><span class="board-rank">${i + 1}</span></td>
          <td><span class="board-airport-code">${a.code}</span> ${a.name}</td>
          <td>${a.city}</td>
          <td><span class="board-continent">${a.continent}</span></td>
          <td class="col-num"><span class="board-value board-value--highlight">${a.claims}</span></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const code = row.dataset.code;
        const airport = airportByCode[code];
        if (airport) {
          showGlobe();
          focusAirport(airport);
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // Board: Region leaderboard
  // ------------------------------------------------------------------

  function renderRegionLeaderboard() {
    const tbody = document.getElementById("lb-regions");
    tbody.innerHTML = LEADERBOARDS.regions
      .map(
        (r, i) => `
        <tr>
          <td><span class="board-rank">${i + 1}</span></td>
          <td><span class="board-team-name">${r.continent}</span></td>
          <td class="col-num"><span class="board-value">${r.airport_count}</span></td>
          <td class="col-num"><span class="board-value board-value--highlight">${r.claims}</span></td>
        </tr>`
      )
      .join("");
  }

  // ------------------------------------------------------------------
  // Board: Search
  // ------------------------------------------------------------------

  function setupBoardSearch() {
    const input = document.getElementById("address-search");
    const clearBtn = document.getElementById("clear-search");

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = input.value.trim().toLowerCase();
        if (!query) return;

        const match = LEADERBOARDS.addresses.find(
          (a) =>
            a.ens.toLowerCase() === query ||
            a.address.toLowerCase().startsWith(query) ||
            a.address.toLowerCase() === query
        );

        if (match) {
          trackEvent("search.submit", match.ens || truncateAddress(match.address));
          input.value = match.ens || truncateAddress(match.address);
          clearBtn.style.display = "inline-flex";
          showGlobe();
          selectAddress(match.address);
        }
      }
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.style.display = "none";
    });
  }

  // ------------------------------------------------------------------
  // Globe: Initialization (lazy)
  // ------------------------------------------------------------------

  function maxClaims() {
    return Math.max(...AIRPORTS.map((a) => a.claims), 1);
  }

  function medianClaims() {
    const sorted = AIRPORTS.map((a) => a.claims).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 1;
  }

  function buildPointLabel(airport) {
    const imageHtml = airport.image_url
      ? `<img src="${airport.image_url}" style="width: 64px; height: 64px; border-radius: 50%; border: 2px solid #8076FA; display: block; margin: 0 auto 8px;">`
      : "";
    const claimText =
      airport.claims === 0
        ? '<span style="color: #F87588;">Not yet claimed</span>'
        : `${airport.claims} claim${airport.claims !== 1 ? "s" : ""}`;
    return `
      <div style="font-family: Rubik, sans-serif; font-size: 13px; line-height: 1.4; padding: 6px; text-align: center; min-width: 120px;">
        ${imageHtml}
        <div style="font-family: Comfortaa, sans-serif; font-weight: 700; color: #8076FA; font-size: 15px;">
          ${airport.code}
        </div>
        <div style="color: #e0e0e0;">${airport.name}</div>
        <div style="color: #aab0d0; font-size: 12px;">${airport.city}, ${airport.country}</div>
        <div style="color: #aab0d0; font-size: 12px; margin-top: 4px;">${claimText}</div>
      </div>
    `;
  }

  function initGlobe() {
    // Dynamically load Globe.gl
    const script = document.createElement("script");
    script.src = "https://unpkg.com/globe.gl";
    script.onload = () => {
      const container = document.getElementById("globe-container");
      const unclaimedAirports = AIRPORTS.filter((a) => a.claims === 0);

      const globe = Globe()(container)
        .globeImageUrl(
          "https://unpkg.com/three-globe/example/img/earth-night.jpg"
        )
        .backgroundColor("#0a0a2e")
        .atmosphereColor("#8076FA")
        .atmosphereAltitude(0.2)
        .pointsData(AIRPORTS)
        .pointLat((d) => d.lat)
        .pointLng((d) => d.lon)
        .pointAltitude((d) =>
          d.claims === 0 ? 0.01 : 0.01 + (d.claims / maxClaims()) * 0.06
        )
        .pointRadius((d) =>
          d.claims === 0 ? 0.35 : 0.3 + (d.claims / maxClaims()) * 0.7
        )
        .pointColor((d) => (d.claims === 0 ? "#F87588" : "#9289FF"))
        .pointLabel((d) => buildPointLabel(d))
        .onPointClick((d) => focusAirport(d))
        .ringsData(unclaimedAirports)
        .ringLat((d) => d.lat)
        .ringLng((d) => d.lon)
        .ringColor(() => (t) => `rgba(248, 117, 136, ${1 - t})`)
        .ringMaxRadius(2)
        .ringPropagationSpeed(1)
        .ringRepeatPeriod(2000)
        .arcsData([])
        .arcStartLat((d) => d.startLat)
        .arcStartLng((d) => d.startLng)
        .arcEndLat((d) => d.endLat)
        .arcEndLng((d) => d.endLng)
        .arcColor((d) => d.color)
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime((d) => d.animateTime || 1500)
        .arcStroke(0.5)
        .arcAltitudeAutoScale(0.4)
        .labelsData(AIRPORTS.filter((a) => a.claims >= medianClaims()))
        .labelLat((d) => d.lat)
        .labelLng((d) => d.lon)
        .labelText((d) => d.code)
        .labelSize(0.6)
        .labelDotRadius(0)
        .labelColor(() => "rgba(255, 255, 255, 0.7)")
        .labelAltitude(0.01)
        .labelResolution(2);

      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;

      state.globe = globe;
      handleGlobeResize();

      // If there was a pending address selection, apply it now
      if (state.selectedAddress) {
        applyGlobeSelection(state.selectedAddress);
      }
    };
    document.head.appendChild(script);
  }

  function handleGlobeResize() {
    if (state.globe && state.view === "globe") {
      state.globe.width(window.innerWidth);
      state.globe.height(window.innerHeight);
    }
  }

  window.addEventListener("resize", handleGlobeResize);

  // ------------------------------------------------------------------
  // Globe: Airport focus
  // ------------------------------------------------------------------

  function focusAirport(airport) {
    trackEvent("globe.airport-click", airport.code);
    if (state.globe) {
      state.globe.pointOfView(
        { lat: airport.lat, lng: airport.lon, altitude: 1.5 },
        1000
      );
    }
  }

  // ------------------------------------------------------------------
  // Globe: Flight path animation
  // ------------------------------------------------------------------

  function selectAddress(address) {
    stopAnimation();
    state.selectedAddress = address;
    trackEvent("traveler.select", truncateAddress(address));

    if (state.globe) {
      applyGlobeSelection(address);
    }
    updateURL();
  }

  function applyGlobeSelection(address) {
    const claims = claimsByAddress[address];
    if (!claims || claims.length < 2) {
      state.flightArcs = [];
      state.globe.arcsData([]);
      document.getElementById("playback-controls").style.display = "none";
      return;
    }

    const arcs = [];
    for (let i = 0; i < claims.length - 1; i++) {
      const from = airportByCode[claims[i].airport];
      const to = airportByCode[claims[i + 1].airport];
      if (!from || !to) continue;
      arcs.push({
        startLat: from.lat,
        startLng: from.lon,
        endLat: to.lat,
        endLng: to.lon,
        color: ["rgba(146, 137, 255, 0.9)", "rgba(248, 117, 136, 0.9)"],
        animateTime: 1500,
        fromCode: from.code,
        toCode: to.code,
        order: i,
      });
    }

    state.flightArcs = arcs;
    state.animationStep = arcs.length;
    state.globe.arcsData(arcs);
    state.globe.controls().autoRotate = false;

    if (arcs.length > 0) {
      const firstAirport = airportByCode[claims[0].airport];
      if (firstAirport) {
        state.globe.pointOfView(
          { lat: firstAirport.lat, lng: firstAirport.lon, altitude: 2 },
          1000
        );
      }
    }

    document.getElementById("playback-controls").style.display = "flex";
  }

  function clearSelection() {
    stopAnimation();
    state.selectedAddress = null;
    state.flightArcs = [];
    if (state.globe) {
      state.globe.arcsData([]);
      state.globe.controls().autoRotate = true;
    }
    document.getElementById("playback-controls").style.display = "none";
    const globeSearch = document.getElementById("globe-search");
    const globeClear = document.getElementById("globe-clear-search");
    if (globeSearch) globeSearch.value = "";
    if (globeClear) globeClear.style.display = "none";
    updateURL();
  }

  function playAnimation() {
    if (state.flightArcs.length === 0) return;
    state.playing = true;
    state.animationStep = 0;
    if (state.globe) state.globe.arcsData([]);
    document.getElementById("play-btn").textContent = "Pause";
    stepAnimation();
  }

  function stepAnimation() {
    if (!state.playing || state.animationStep >= state.flightArcs.length) {
      if (state.animationStep >= state.flightArcs.length) {
        if (state.globe) state.globe.arcsData(state.flightArcs);
        state.playing = false;
        document.getElementById("play-btn").textContent = "Replay";
      }
      return;
    }

    const visibleArcs = state.flightArcs.slice(0, state.animationStep + 1);
    if (state.globe) state.globe.arcsData(visibleArcs);

    const currentArc = state.flightArcs[state.animationStep];
    if (state.globe) {
      state.globe.pointOfView(
        { lat: currentArc.endLat, lng: currentArc.endLng, altitude: 2 },
        800
      );
    }

    state.animationStep++;
    const speedIdx =
      parseInt(document.getElementById("speed-slider").value) - 1;
    const delay = state.speedMs[speedIdx] || 1500;
    state.playTimer = setTimeout(stepAnimation, delay);
  }

  function stopAnimation() {
    state.playing = false;
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    const playBtn = document.getElementById("play-btn");
    if (playBtn) playBtn.textContent = "Play";
  }

  function togglePlayback() {
    if (state.playing) {
      stopAnimation();
      if (state.globe) state.globe.arcsData(state.flightArcs);
    } else {
      playAnimation();
    }
  }

  // ------------------------------------------------------------------
  // Globe: Search
  // ------------------------------------------------------------------

  function setupGlobeSearch() {
    const input = document.getElementById("globe-search");
    const clearBtn = document.getElementById("globe-clear-search");
    if (!input) return;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = input.value.trim().toLowerCase();
        if (!query) return;

        const match = LEADERBOARDS.addresses.find(
          (a) =>
            a.ens.toLowerCase() === query ||
            a.address.toLowerCase().startsWith(query) ||
            a.address.toLowerCase() === query
        );

        if (match) {
          trackEvent("search.submit", match.ens || truncateAddress(match.address));
          selectAddress(match.address);
          input.value = match.ens || truncateAddress(match.address);
          clearBtn.style.display = "inline-flex";
        }
      }
    });

    clearBtn.addEventListener("click", clearSelection);
  }

  // ------------------------------------------------------------------
  // Globe: Controls
  // ------------------------------------------------------------------

  function setupGlobeControls() {
    document.getElementById("play-btn").addEventListener("click", togglePlayback);

    document.getElementById("spin-toggle").addEventListener("click", () => {
      if (!state.globe) return;
      const controls = state.globe.controls();
      controls.autoRotate = !controls.autoRotate;
      document.getElementById("spin-toggle").textContent = controls.autoRotate
        ? "Pause Spin"
        : "Resume Spin";
    });
  }

  // ------------------------------------------------------------------
  // URL state
  // ------------------------------------------------------------------

  function updateURL() {
    const params = new URLSearchParams();
    if (state.view === "globe") params.set("view", "globe");
    if (state.selectedAddress) params.set("address", state.selectedAddress);
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    history.replaceState(null, "", url);
  }

  function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const address = params.get("address");

    if (view === "globe") {
      showGlobe();
      if (address && claimsByAddress[address]) {
        selectAddress(address);
      }
    } else if (address) {
      // Show board but pre-select for when they open globe
      state.selectedAddress = address;
      // Switch to travelers tab and highlight
      document.querySelector('[data-tab="travelers"]').click();
    }
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  renderStats();
  renderTeamLeaderboard();
  renderTravelerLeaderboard();
  renderAirportLeaderboard();
  renderRegionLeaderboard();
  setupBoardTabs();
  setupBoardSearch();
  setupGlobeSearch();
  setupGlobeControls();

  // View toggle buttons
  document.getElementById("globe-open").addEventListener("click", () => showGlobe());
  document.getElementById("globe-back").addEventListener("click", () => showBoard());

  // Team detail back button
  document.getElementById("teams-back").addEventListener("click", hideTeamDetail);

  restoreFromURL();
})();
