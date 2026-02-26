/* ============================================================
   Flight Path — Globe visualization & UI logic
   ============================================================ */

(function () {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  const state = {
    selectedAddress: null,
    flightArcs: [],
    animationStep: 0,
    playing: false,
    playTimer: null,
    speedMs: [3000, 2000, 1500, 1000, 500], // speed slider values
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

  // ------------------------------------------------------------------
  // Globe setup (full viewport)
  // ------------------------------------------------------------------

  const container = document.getElementById("globe-container");

  const unclaimedAirports = AIRPORTS.filter((a) => a.claims === 0);
  const claimedAirports = AIRPORTS.filter((a) => a.claims > 0);

  const globe = Globe()(container)
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
    .backgroundColor("#0a0a2e")
    .atmosphereColor("#8076FA")
    .atmosphereAltitude(0.2)
    // Points — airport markers (all airports)
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
    // Rings — pulsing glow on unclaimed airports
    .ringsData(unclaimedAirports)
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lon)
    .ringColor(() => (t) =>
      `rgba(248, 117, 136, ${1 - t})`
    )
    .ringMaxRadius(2)
    .ringPropagationSpeed(1)
    .ringRepeatPeriod(2000)
    // Arcs — flight paths (initially empty)
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
    // Labels
    .labelsData(AIRPORTS.filter((a) => a.claims >= medianClaims()))
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lon)
    .labelText((d) => d.code)
    .labelSize(0.6)
    .labelDotRadius(0)
    .labelColor(() => "rgba(255, 255, 255, 0.7)")
    .labelAltitude(0.01)
    .labelResolution(2);

  // Auto-rotate
  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.5;

  // Full-viewport sizing
  function handleResize() {
    globe.width(window.innerWidth);
    globe.height(window.innerHeight);
  }
  window.addEventListener("resize", handleResize);
  handleResize();

  // ------------------------------------------------------------------
  // Helpers
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

  function focusAirport(airport) {
    globe.pointOfView(
      { lat: airport.lat, lng: airport.lon, altitude: 1.5 },
      1000
    );
  }

  function truncateAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  // ------------------------------------------------------------------
  // Flight path animation
  // ------------------------------------------------------------------

  function selectAddress(address) {
    stopAnimation();
    state.selectedAddress = address;

    const claims = claimsByAddress[address];
    if (!claims || claims.length < 2) {
      state.flightArcs = [];
      globe.arcsData([]);
      document.getElementById("playback-controls").style.display = "none";
      updateURL();
      return;
    }

    // Build arcs from sequential claims
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
    state.animationStep = arcs.length; // show all by default
    globe.arcsData(arcs);

    // Stop auto-rotate when viewing a flight path
    globe.controls().autoRotate = false;

    // Focus on first airport
    if (arcs.length > 0) {
      const firstAirport = airportByCode[claims[0].airport];
      if (firstAirport) {
        globe.pointOfView(
          { lat: firstAirport.lat, lng: firstAirport.lon, altitude: 2 },
          1000
        );
      }
    }

    document.getElementById("playback-controls").style.display = "flex";
    updateURL();
    highlightTravelerRow(address);
  }

  function clearSelection() {
    stopAnimation();
    state.selectedAddress = null;
    state.flightArcs = [];
    globe.arcsData([]);
    globe.controls().autoRotate = true;
    document.getElementById("playback-controls").style.display = "none";
    document.getElementById("address-search").value = "";
    document.getElementById("clear-search").style.display = "none";
    updateURL();
    highlightTravelerRow(null);
  }

  function playAnimation() {
    if (state.flightArcs.length === 0) return;

    state.playing = true;
    state.animationStep = 0;
    globe.arcsData([]);

    const playBtn = document.getElementById("play-btn");
    playBtn.textContent = "Pause";

    stepAnimation();
  }

  function stepAnimation() {
    if (!state.playing || state.animationStep >= state.flightArcs.length) {
      if (state.animationStep >= state.flightArcs.length) {
        // Show all arcs when done
        globe.arcsData(state.flightArcs);
        state.playing = false;
        document.getElementById("play-btn").textContent = "Replay";
      }
      return;
    }

    const visibleArcs = state.flightArcs.slice(0, state.animationStep + 1);
    globe.arcsData(visibleArcs);

    // Pan to the destination of current arc
    const currentArc = state.flightArcs[state.animationStep];
    globe.pointOfView(
      { lat: currentArc.endLat, lng: currentArc.endLng, altitude: 2 },
      800
    );

    state.animationStep++;
    const speedIdx = parseInt(document.getElementById("speed-slider").value) - 1;
    const delay = state.speedMs[speedIdx] || 1500;
    state.playTimer = setTimeout(stepAnimation, delay);
  }

  function stopAnimation() {
    state.playing = false;
    if (state.playTimer) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    document.getElementById("play-btn").textContent = "Play";
  }

  function togglePlayback() {
    if (state.playing) {
      stopAnimation();
      // Show all arcs when pausing
      globe.arcsData(state.flightArcs);
    } else {
      playAnimation();
    }
  }

  // ------------------------------------------------------------------
  // Leaderboards
  // ------------------------------------------------------------------

  function renderLeaderboards() {
    renderAirportLeaderboard();
    renderTravelerLeaderboard();
    renderRegionLeaderboard();
  }

  function renderAirportLeaderboard() {
    const tbody = document.getElementById("lb-airports");
    tbody.innerHTML = LEADERBOARDS.airports
      .map(
        (a, i) => `
        <tr data-code="${a.code}">
          <td><span class="rank">${i + 1}</span></td>
          <td><span class="airport-code">${a.code}</span> ${a.name}</td>
          <td>${a.city}</td>
          <td><span class="continent-badge">${a.continent}</span></td>
          <td><span class="claims-badge">${a.claims}</span></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const code = row.dataset.code;
        const airport = airportByCode[code];
        if (airport) focusAirport(airport);
      });
    });
  }

  function renderTravelerLeaderboard() {
    const tbody = document.getElementById("lb-travelers");
    tbody.innerHTML = LEADERBOARDS.addresses
      .map(
        (a, i) => `
        <tr data-address="${a.address}">
          <td><span class="rank">${i + 1}</span></td>
          <td>${
            a.ens
              ? `<span class="ens-name">${a.ens}</span>`
              : `<span class="address-cell">${truncateAddress(a.address)}</span>`
          }</td>
          <td><span class="claims-badge">${a.airport_count}</span></td>
        </tr>`
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((row) => {
      row.addEventListener("click", () => {
        const address = row.dataset.address;
        selectAddress(address);
        document.getElementById("address-search").value =
          row.querySelector(".ens-name")?.textContent ||
          truncateAddress(address);
        document.getElementById("clear-search").style.display = "inline-flex";
      });
    });
  }

  function renderRegionLeaderboard() {
    const tbody = document.getElementById("lb-regions");
    tbody.innerHTML = LEADERBOARDS.regions
      .map(
        (r, i) => `
        <tr>
          <td><span class="rank">${i + 1}</span></td>
          <td><span class="continent-badge">${r.continent}</span></td>
          <td>${r.airport_count}</td>
          <td><span class="claims-badge">${r.claims}</span></td>
        </tr>`
      )
      .join("");
  }

  function highlightTravelerRow(address) {
    document.querySelectorAll("#lb-travelers tr").forEach((row) => {
      row.classList.toggle("selected", row.dataset.address === address);
    });
  }

  // ------------------------------------------------------------------
  // Stats summary
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
  // Tab switching
  // ------------------------------------------------------------------

  function setupTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".leaderboard-tab-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
      });
    });
  }

  // ------------------------------------------------------------------
  // Leaderboard panel toggle
  // ------------------------------------------------------------------

  function setupPanel() {
    const panel = document.getElementById("leaderboard-panel");
    const toggleBtn = document.getElementById("panel-toggle");
    const closeBtn = document.getElementById("panel-close");

    toggleBtn.addEventListener("click", () => {
      panel.classList.add("open");
      toggleBtn.classList.add("hidden");
    });

    closeBtn.addEventListener("click", () => {
      panel.classList.remove("open");
      toggleBtn.classList.remove("hidden");
    });
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------

  function setupSearch() {
    const input = document.getElementById("address-search");
    const clearBtn = document.getElementById("clear-search");

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = input.value.trim().toLowerCase();
        if (!query) return;

        // Search by ENS or address prefix
        const match = LEADERBOARDS.addresses.find(
          (a) =>
            a.ens.toLowerCase() === query ||
            a.address.toLowerCase().startsWith(query) ||
            a.address.toLowerCase() === query
        );

        if (match) {
          selectAddress(match.address);
          input.value = match.ens || truncateAddress(match.address);
          clearBtn.style.display = "inline-flex";

          // Open the panel and switch to travelers tab
          document.getElementById("leaderboard-panel").classList.add("open");
          document.getElementById("panel-toggle").classList.add("hidden");
          document.querySelector('[data-tab="travelers"]').click();
        }
      }
    });

    clearBtn.addEventListener("click", clearSelection);
  }

  // ------------------------------------------------------------------
  // URL state
  // ------------------------------------------------------------------

  function updateURL() {
    const params = new URLSearchParams();
    if (state.selectedAddress) {
      params.set("address", state.selectedAddress);
    }
    const qs = params.toString();
    const url = qs ? `?${qs}` : window.location.pathname;
    history.replaceState(null, "", url);
  }

  function restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const address = params.get("address");
    if (address && claimsByAddress[address]) {
      selectAddress(address);
      const addrData = LEADERBOARDS.addresses.find(
        (a) => a.address === address
      );
      document.getElementById("address-search").value =
        addrData?.ens || truncateAddress(address);
      document.getElementById("clear-search").style.display = "inline-flex";

      // Open panel and show travelers
      document.getElementById("leaderboard-panel").classList.add("open");
      document.getElementById("panel-toggle").classList.add("hidden");
      document.querySelector('[data-tab="travelers"]').click();
    }
  }

  // ------------------------------------------------------------------
  // Playback controls
  // ------------------------------------------------------------------

  function setupPlayback() {
    document
      .getElementById("play-btn")
      .addEventListener("click", togglePlayback);
  }

  function setupSpinToggle() {
    const btn = document.getElementById("spin-toggle");
    btn.addEventListener("click", () => {
      const controls = globe.controls();
      controls.autoRotate = !controls.autoRotate;
      btn.textContent = controls.autoRotate ? "Pause Spin" : "Resume Spin";
    });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  renderStats();
  renderLeaderboards();
  setupTabs();
  setupPanel();
  setupSearch();
  setupPlayback();
  setupSpinToggle();
  restoreFromURL();
})();
