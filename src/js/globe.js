/* Globe page — Flight Path */
(function () {
  const airportByCode = {};
  AIRPORTS.forEach(function (a) { airportByCode[a.code] = a; });

  const claimsByAddress = {};
  CLAIMS.forEach(function (c) {
    if (!claimsByAddress[c.address]) claimsByAddress[c.address] = [];
    claimsByAddress[c.address].push(c);
  });
  Object.values(claimsByAddress).forEach(function (arr) {
    arr.sort(function (a, b) { return a.created.localeCompare(b.created); });
  });

  function truncateAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  const state = {
    selectedAddress: null,
    flightArcs: [],
    animationStep: 0,
    playing: false,
    playTimer: null,
    speedMs: [3000, 2000, 1500, 1000, 500],
    globe: null,
  };

  function mc() {
    return Math.max.apply(null, AIRPORTS.map(function (a) { return a.claims; }).concat([1]));
  }

  function medianClaims() {
    const sorted = AIRPORTS.map(function (a) { return a.claims; }).sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)] || 1;
  }

  function buildPointLabel(airport) {
    const imageHtml = airport.image_url
      ? '<img src="' + airport.image_url + '" style="width:64px;height:64px;border-radius:50%;border:2px solid #8076FA;display:block;margin:0 auto 8px;">'
      : "";
    const claimText = airport.claims === 0
      ? '<span style="color:#F87588;">Not yet claimed</span>'
      : airport.claims + " claim" + (airport.claims !== 1 ? "s" : "");
    return '<div style="font-family:Rubik,sans-serif;font-size:13px;line-height:1.4;padding:6px;text-align:center;min-width:120px;">' +
      imageHtml +
      '<div style="font-family:Comfortaa,sans-serif;font-weight:700;color:#8076FA;font-size:15px;">' + airport.code + '</div>' +
      '<div style="color:#e0e0e0;">' + airport.name + '</div>' +
      '<div style="color:#aab0d0;font-size:12px;">' + airport.city + ', ' + airport.country + '</div>' +
      '<div style="color:#aab0d0;font-size:12px;margin-top:4px;">' + claimText + '</div></div>';
  }

  function focusAirport(airport) {
    if (state.globe) {
      state.globe.pointOfView({ lat: airport.lat, lng: airport.lon, altitude: 1.5 }, 1000);
    }
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
        startLat: from.lat, startLng: from.lon,
        endLat: to.lat, endLng: to.lon,
        color: ["rgba(146,137,255,0.9)", "rgba(248,117,136,0.9)"],
        animateTime: 1500, order: i,
      });
    }

    state.flightArcs = arcs;
    state.animationStep = arcs.length;
    state.globe.arcsData(arcs);
    state.globe.controls().autoRotate = false;

    if (arcs.length > 0) {
      const firstAirport = airportByCode[claims[0].airport];
      if (firstAirport) {
        state.globe.pointOfView({ lat: firstAirport.lat, lng: firstAirport.lon, altitude: 2 }, 1000);
      }
    }

    document.getElementById("playback-controls").style.display = "flex";

    const traveler = LEADERBOARDS.addresses.find(function (a) { return a.address === address; });
    const gs = document.getElementById("globe-search");
    const gc = document.getElementById("globe-clear-search");
    if (traveler && gs) {
      gs.value = traveler.ens || truncateAddress(address);
      gc.style.display = "inline-flex";
    }
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
    document.getElementById("globe-search").value = "";
    document.getElementById("globe-clear-search").style.display = "none";
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
      state.globe.pointOfView({ lat: currentArc.endLat, lng: currentArc.endLng, altitude: 2 }, 800);
    }
    state.animationStep++;
    const speedIdx = parseInt(document.getElementById("speed-slider").value) - 1;
    const delay = state.speedMs[speedIdx] || 1500;
    state.playTimer = setTimeout(stepAnimation, delay);
  }

  function stopAnimation() {
    state.playing = false;
    if (state.playTimer) { clearTimeout(state.playTimer); state.playTimer = null; }
    const playBtn = document.getElementById("play-btn");
    if (playBtn) playBtn.textContent = "Play";
  }

  // Init globe
  const script = document.createElement("script");
  script.src = "https://unpkg.com/globe.gl";
  script.onload = function () {
    const container = document.getElementById("globe-container");
    const unclaimedAirports = AIRPORTS.filter(function (a) { return a.claims === 0; });
    const maxC = mc();

    const globe = Globe()(container)
      .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
      .backgroundColor("#0a0a2e")
      .atmosphereColor("#8076FA")
      .atmosphereAltitude(0.2)
      .pointsData(AIRPORTS)
      .pointLat(function (d) { return d.lat; })
      .pointLng(function (d) { return d.lon; })
      .pointAltitude(function (d) { return d.claims === 0 ? 0.01 : 0.01 + (d.claims / maxC) * 0.06; })
      .pointRadius(function (d) { return d.claims === 0 ? 0.35 : 0.3 + (d.claims / maxC) * 0.7; })
      .pointColor(function (d) { return d.claims === 0 ? "#F87588" : "#9289FF"; })
      .pointLabel(function (d) { return buildPointLabel(d); })
      .onPointClick(function (d) { focusAirport(d); })
      .ringsData(unclaimedAirports)
      .ringLat(function (d) { return d.lat; })
      .ringLng(function (d) { return d.lon; })
      .ringColor(function () { return function (t) { return "rgba(248,117,136," + (1 - t) + ")"; }; })
      .ringMaxRadius(2)
      .ringPropagationSpeed(1)
      .ringRepeatPeriod(2000)
      .arcsData([])
      .arcStartLat(function (d) { return d.startLat; })
      .arcStartLng(function (d) { return d.startLng; })
      .arcEndLat(function (d) { return d.endLat; })
      .arcEndLng(function (d) { return d.endLng; })
      .arcColor(function (d) { return d.color; })
      .arcDashLength(0.4).arcDashGap(0.2)
      .arcDashAnimateTime(function (d) { return d.animateTime || 1500; })
      .arcStroke(0.5).arcAltitudeAutoScale(0.4)
      .labelsData(AIRPORTS.filter(function (a) { return a.claims >= medianClaims(); }))
      .labelLat(function (d) { return d.lat; })
      .labelLng(function (d) { return d.lon; })
      .labelText(function (d) { return d.code; })
      .labelSize(0.6).labelDotRadius(0)
      .labelColor(function () { return "rgba(255,255,255,0.7)"; })
      .labelAltitude(0.01).labelResolution(2);

    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.5;
    state.globe = globe;

    function handleResize() {
      const panel = container.parentElement;
      globe.width(panel.clientWidth);
      globe.height(panel.clientHeight);
    }
    handleResize();
    window.addEventListener("resize", handleResize);

    // Check URL params for address/airport
    const params = new URLSearchParams(window.location.search);
    const addr = params.get("address");
    const airportCode = params.get("airport");
    if (addr) {
      state.selectedAddress = addr;
      applyGlobeSelection(addr);
    } else if (airportCode) {
      const ap = airportByCode[airportCode];
      if (ap) focusAirport(ap);
    }
  };
  document.head.appendChild(script);

  // Search
  const input = document.getElementById("globe-search");
  const clearBtn = document.getElementById("globe-clear-search");

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      const query = input.value.trim().toLowerCase();
      if (!query) return;
      const match = LEADERBOARDS.addresses.find(function (a) {
        return a.ens.toLowerCase() === query || a.address.toLowerCase().startsWith(query) || a.address.toLowerCase() === query;
      });
      if (match) {
        state.selectedAddress = match.address;
        applyGlobeSelection(match.address);
        input.value = match.ens || truncateAddress(match.address);
        clearBtn.style.display = "inline-flex";
      }
    }
  });

  clearBtn.addEventListener("click", clearSelection);

  // Controls
  document.getElementById("play-btn").addEventListener("click", function () {
    if (state.playing) { stopAnimation(); if (state.globe) state.globe.arcsData(state.flightArcs); }
    else { playAnimation(); }
  });

  document.getElementById("spin-toggle").addEventListener("click", function () {
    if (!state.globe) return;
    const controls = state.globe.controls();
    controls.autoRotate = !controls.autoRotate;
    this.textContent = controls.autoRotate ? "Pause Spin" : "Resume Spin";
  });
})();
