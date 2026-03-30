/* Stats page — Flight Path */
(function () {
  if (typeof CLAIMS === "undefined") return;

  var C = {
    purple: "#8076FA", purpleLight: "#9289FF", purpleDeep: "#7168DE",
    pink: "#F87588", teal: "#0FCEAD", gold: "#FFE44D", goldDark: "#D4BE00",
    blue: "#6db3f8", cream: "#f0e6d3",
    cardBg: "#3A3A3A", cardBgHover: "#474747",
    muted: "rgba(255,255,255,0.35)", faint: "rgba(255,255,255,0.08)",
    region: {
      "North America": "#8076FA", "Europe": "#9289FF", "Asia": "#F87588",
      "South America": "#0FCEAD", "Africa": "#6db3f8", "Oceania": "#f0e6d3"
    }
  };

  var gameStart = new Date(GAME_START);
  var gameEnd = new Date(GAME_END);
  var now = new Date(LAST_UPDATED);
  var dayOfYear = Math.floor((now - gameStart) / 86400000) + 1;
  var totalDays = 365;
  var sorted = CLAIMS.slice().sort(function (a, b) { return a.created.localeCompare(b.created); });

  var airportByCode = {};
  AIRPORTS.forEach(function (a) { airportByCode[a.code] = a; });

  /* ============================================================
     Helpers
     ============================================================ */

  function el(id) { return document.getElementById(id); }

  function svg(w, h, content) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;">' + content + '</svg>';
  }

  function daysBetween(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
  }

  function monthLabel(m) {
    return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m];
  }

  function dateToYearFraction(d) {
    return (new Date(d) - gameStart) / (gameEnd - gameStart);
  }

  /* ============================================================
     Section 1: Year Progress
     ============================================================ */

  var pct = Math.min(100, (dayOfYear / totalDays) * 100);
  var fillEl = el("year-fill");
  var markerEl = el("year-marker");
  if (fillEl) fillEl.style.width = pct + "%";
  if (markerEl) markerEl.style.left = pct + "%";

  var statDays = el("stat-days");
  if (statDays) statDays.textContent = dayOfYear + " / " + totalDays;

  var velClaims = el("vel-claims");
  if (velClaims) velClaims.textContent = (CLAIMS.length / dayOfYear).toFixed(1) + " / day";

  var velTravelers = el("vel-travelers");
  if (velTravelers) velTravelers.textContent = (LEADERBOARDS.addresses.length / dayOfYear).toFixed(1) + " / day";

  /* ============================================================
     Section 2: Growth Trajectory — triple area chart
     ============================================================ */

  (function () {
    var container = el("gauge-trajectory");
    if (!container) return;

    // Build cumulative series
    var cumClaims = [], cumAirports = [], cumTravelers = [];
    var seenAirports = {}, seenAddrs = {}, aC = 0, aA = 0, aT = 0;
    var lastDay = "", dayPoints = [];

    sorted.forEach(function (c) {
      var day = c.created.slice(0, 10);
      aC++;
      if (!seenAirports[c.airport]) { seenAirports[c.airport] = true; aA++; }
      if (!seenAddrs[c.address]) { seenAddrs[c.address] = true; aT++; }
      if (day !== lastDay) {
        dayPoints.push({ day: day, claims: aC, airports: aA, travelers: aT });
        lastDay = day;
      } else {
        dayPoints[dayPoints.length - 1] = { day: day, claims: aC, airports: aA, travelers: aT };
      }
    });

    // Downsample if too many points
    var pts = dayPoints;
    if (pts.length > 80) {
      var step = Math.ceil(pts.length / 80), sampled = [];
      for (var i = 0; i < pts.length; i += step) sampled.push(pts[i]);
      if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }

    var w = 700, h = 200, padL = 36, padR = 16, padT = 14, padB = 24;
    var chartW = w - padL - padR, chartH = h - padT - padB;
    var maxVal = pts[pts.length - 1].claims;

    // Today line position
    var todayX = padL + dateToYearFraction(now) * chartW;

    // Future zone
    var content = '';
    content += '<rect x="' + todayX + '" y="' + padT + '" width="' + (w - padR - todayX) + '" height="' + chartH + '" fill="rgba(255,255,255,0.02)"/>';

    // Grid lines
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * chartH;
      var gVal = Math.round(maxVal * (1 - g / 4));
      content += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '" stroke="' + C.faint + '" stroke-width="1"/>';
      content += '<text x="' + (padL - 4) + '" y="' + (gy + 3) + '" fill="' + C.muted + '" font-size="8" text-anchor="end" font-family="Roboto Mono,monospace">' + gVal + '</text>';
    }

    // Month labels on x-axis
    for (var m = 0; m < 12; m++) {
      var mDate = new Date(2026, m, 15);
      var mx = padL + dateToYearFraction(mDate) * chartW;
      content += '<text x="' + mx + '" y="' + (h - 4) + '" fill="' + C.muted + '" font-size="8" text-anchor="middle" font-family="Roboto Mono,monospace">' + monthLabel(m) + '</text>';
    }

    // Today dashed line
    content += '<line x1="' + todayX + '" y1="' + padT + '" x2="' + todayX + '" y2="' + (padT + chartH) + '" stroke="' + C.gold + '" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>';

    // Draw series
    var series = [
      { key: "claims", color: C.purple, label: "Claims" },
      { key: "travelers", color: C.pink, label: "Travelers" },
      { key: "airports", color: C.teal, label: "Airports" }
    ];

    series.forEach(function (s, si) {
      var sMax = pts[pts.length - 1][s.key];
      var lineP = [], areaP = "";

      pts.forEach(function (p) {
        var x = padL + dateToYearFraction(p.day) * chartW;
        var y = padT + chartH - (p[s.key] / maxVal) * chartH;
        lineP.push(x + "," + y);
      });

      areaP = padL + "," + (padT + chartH) + " " + lineP.join(" ") + " " + lineP[lineP.length - 1].split(",")[0] + "," + (padT + chartH);

      var gid = "tg-" + si;
      content += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">';
      content += '<stop offset="0%" stop-color="' + s.color + '" stop-opacity="0.25"/>';
      content += '<stop offset="100%" stop-color="' + s.color + '" stop-opacity="0.02"/>';
      content += '</linearGradient></defs>';
      content += '<polygon points="' + areaP + '" fill="url(#' + gid + ')"/>';
      content += '<polyline points="' + lineP.join(" ") + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

      // End value label
      var lastPt = lineP[lineP.length - 1].split(",");
      content += '<text x="' + (parseFloat(lastPt[0]) + 4) + '" y="' + (parseFloat(lastPt[1]) + 3) + '" fill="' + s.color + '" font-size="9" font-weight="600" font-family="Roboto Mono,monospace">' + sMax + '</text>';
    });

    container.innerHTML = svg(w, h, content);

    // Legend
    var legend = el("trajectory-legend");
    if (legend) {
      legend.innerHTML = series.map(function (s) {
        return '<span class="gauges-legend-item"><span class="gauges-legend-dot" style="background:' + s.color + '"></span>' + s.label + '</span>';
      }).join("");
    }
  })();

  /* ============================================================
     Section 3a: Monthly Claims (all 12 months)
     ============================================================ */

  (function () {
    var container = el("gauge-monthly");
    if (!container) return;

    var months = {};
    CLAIMS.forEach(function (c) {
      var k = c.created.slice(0, 7);
      months[k] = (months[k] || 0) + 1;
    });

    var currentMonth = now.toISOString().slice(0, 7);
    var currentDayOfMonth = now.getDate();
    var daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var allMonths = [];
    for (var m = 0; m < 12; m++) {
      var key = "2026-" + String(m + 1).padStart(2, "0");
      var val = months[key] || 0;
      var isCurrent = key === currentMonth;
      var isFuture = key > currentMonth;
      var projected = isCurrent ? Math.round(val * daysInCurrentMonth / currentDayOfMonth) : 0;
      allMonths.push({ label: monthLabel(m), value: val, projected: projected, isCurrent: isCurrent, isFuture: isFuture });
    }

    var maxVal = Math.max.apply(null, allMonths.map(function (d) {
      return Math.max(d.value, d.projected);
    }).concat([1]));

    container.innerHTML = allMonths.map(function (d) {
      var pct = (d.value / maxVal) * 100;
      var projPct = d.projected ? (d.projected / maxVal) * 100 : 0;
      var cls = d.isFuture ? " gauge-bar-row--ghost" : (d.isCurrent ? " gauge-bar-row--current" : "");
      var bar = '<div class="gauge-bar-fill" style="width:' + pct + '%;background:' + C.purple + '"></div>';
      if (d.isCurrent && projPct > pct) {
        bar += '<div class="gauge-bar-projected" style="left:' + pct + '%;width:' + (projPct - pct) + '%"></div>';
      }
      return '<div class="gauge-bar-row' + cls + '">' +
        '<span class="gauge-bar-label">' + d.label + '</span>' +
        '<div class="gauge-bar-track">' + bar + '</div>' +
        '<span class="gauge-bar-value">' + (d.isFuture ? "" : d.value) + '</span></div>';
    }).join("");
  })();

  /* ============================================================
     Section 3b: Activity Heatmap
     ============================================================ */

  (function () {
    var container = el("gauge-heatmap");
    if (!container) return;

    // Count claims per day
    var dayCounts = {};
    CLAIMS.forEach(function (c) {
      var d = c.created.slice(0, 10);
      dayCounts[d] = (dayCounts[d] || 0) + 1;
    });

    var maxCount = 0;
    Object.keys(dayCounts).forEach(function (k) { if (dayCounts[k] > maxCount) maxCount = dayCounts[k]; });
    if (maxCount < 1) maxCount = 1;

    // Build grid: 53 weeks x 7 days
    var cellSize = 10, gap = 2, totalCell = cellSize + gap;
    var weeks = 53, days = 7;
    var labelW = 20;
    var svgW = labelW + weeks * totalCell, svgH = days * totalCell + 20;
    var content = '';

    // Day labels
    var dayLabels = ["M", "", "W", "", "F", "", "S"];
    dayLabels.forEach(function (l, i) {
      if (l) content += '<text x="' + (labelW - 4) + '" y="' + (i * totalCell + cellSize) + '" fill="' + C.muted + '" font-size="7" text-anchor="end" font-family="Roboto Mono,monospace">' + l + '</text>';
    });

    // Month labels at top
    for (var m = 0; m < 12; m++) {
      var firstOfMonth = new Date(2026, m, 1);
      var startOfYear = new Date(2026, 0, 1);
      var dayOfYearForMonth = Math.floor((firstOfMonth - startOfYear) / 86400000);
      var weekIdx = Math.floor(dayOfYearForMonth / 7);
      content += '<text x="' + (labelW + weekIdx * totalCell) + '" y="' + (svgH - 4) + '" fill="' + C.muted + '" font-size="7" font-family="Roboto Mono,monospace">' + monthLabel(m) + '</text>';
    }

    // Cells
    var jan1DayOfWeek = new Date(2026, 0, 1).getDay(); // 0=Sun
    // Shift to Mon=0: (day+6)%7
    var startOffset = (jan1DayOfWeek + 6) % 7;

    for (var d = 0; d < 365; d++) {
      var date = new Date(2026, 0, d + 1);
      var dayIdx = (startOffset + d) % 7;
      var weekCol = Math.floor((startOffset + d) / 7);
      var dateStr = date.toISOString().slice(0, 10);
      var count = dayCounts[dateStr] || 0;
      var isFuture = date > now;

      var fill, opacity;
      if (isFuture) {
        fill = "none";
        opacity = 1;
      } else if (count === 0) {
        fill = C.cardBg;
        opacity = 1;
      } else {
        var intensity = Math.min(count / maxCount, 1);
        if (intensity < 0.33) { fill = C.purpleDeep; opacity = 0.5 + intensity; }
        else if (intensity < 0.66) { fill = C.purple; opacity = 0.6 + intensity * 0.4; }
        else { fill = C.gold; opacity = 0.7 + intensity * 0.3; }
      }

      var x = labelW + weekCol * totalCell;
      var y = dayIdx * totalCell;
      var stroke = isFuture ? C.faint : "none";
      content += '<rect x="' + x + '" y="' + y + '" width="' + cellSize + '" height="' + cellSize + '" rx="2" fill="' + fill + '" opacity="' + opacity + '" stroke="' + stroke + '" stroke-width="0.5">';
      content += '<title>' + dateStr + ': ' + count + ' claim' + (count !== 1 ? 's' : '') + '</title></rect>';
    }

    container.innerHTML = '<div class="gauges-heatmap-wrap">' + svg(svgW, svgH, content) + '</div>';
  })();

  /* ============================================================
     Section 4: Airport Affinity Matrix
     ============================================================ */

  (function () {
    var container = el("gauge-matrix");
    if (!container) return;

    // Build address -> airports map
    var addrAirports = {};
    CLAIMS.forEach(function (c) {
      if (!addrAirports[c.address]) addrAirports[c.address] = [];
      addrAirports[c.address].push(c.airport);
    });

    // Get top N airports by claims
    var topN = 15;
    var topAirports = LEADERBOARDS.airports.slice(0, topN).map(function (a) { return a.code; });

    // Build pair counts
    var matrix = {};
    topAirports.forEach(function (a) {
      matrix[a] = {};
      topAirports.forEach(function (b) { matrix[a][b] = 0; });
    });

    var topSet = {};
    topAirports.forEach(function (a) { topSet[a] = true; });

    Object.keys(addrAirports).forEach(function (addr) {
      var aps = addrAirports[addr].filter(function (a) { return topSet[a]; });
      for (var i = 0; i < aps.length; i++) {
        matrix[aps[i]][aps[i]]++; // diagonal = self count
        for (var j = i + 1; j < aps.length; j++) {
          matrix[aps[i]][aps[j]]++;
          matrix[aps[j]][aps[i]]++;
        }
      }
    });

    // Find max off-diagonal value for color scaling
    var maxShared = 1;
    topAirports.forEach(function (a) {
      topAirports.forEach(function (b) {
        if (a !== b && matrix[a][b] > maxShared) maxShared = matrix[a][b];
      });
    });

    var cellSz = 28, labelSz = 36, pad = 2;
    var gridSz = topN * (cellSz + pad);
    var svgW = labelSz + gridSz + pad, svgH = labelSz + gridSz + pad;
    var content = '';

    // Column labels (top)
    topAirports.forEach(function (code, i) {
      var x = labelSz + i * (cellSz + pad) + cellSz / 2;
      content += '<text x="' + x + '" y="' + (labelSz - 4) + '" fill="' + C.gold + '" font-size="7" font-weight="600" text-anchor="middle" font-family="Roboto Mono,monospace" transform="rotate(-45 ' + x + ' ' + (labelSz - 4) + ')">' + code + '</text>';
    });

    // Row labels (left) + cells
    topAirports.forEach(function (rowCode, ri) {
      var y = labelSz + ri * (cellSz + pad);
      content += '<text x="' + (labelSz - 4) + '" y="' + (y + cellSz / 2 + 3) + '" fill="' + C.gold + '" font-size="7" font-weight="600" text-anchor="end" font-family="Roboto Mono,monospace">' + rowCode + '</text>';

      topAirports.forEach(function (colCode, ci) {
        var x = labelSz + ci * (cellSz + pad);
        var val = matrix[rowCode][colCode];
        var isDiag = rowCode === colCode;
        var fill, textColor;

        if (isDiag) {
          fill = C.purpleDeep;
          textColor = "#fff";
        } else if (val === 0) {
          fill = C.faint;
          textColor = "transparent";
        } else {
          var intensity = val / maxShared;
          var r = Math.round(128 + 127 * intensity);
          var g = Math.round(118 + 109 * intensity);
          var b = Math.round(250 - 173 * intensity);
          fill = "rgba(" + r + "," + g + "," + b + "," + (0.2 + intensity * 0.8) + ")";
          textColor = intensity > 0.4 ? "#fff" : C.muted;
        }

        content += '<rect x="' + x + '" y="' + y + '" width="' + cellSz + '" height="' + cellSz + '" rx="3" fill="' + fill + '">';
        content += '<title>' + rowCode + ' × ' + colCode + ': ' + val + (isDiag ? ' collectors' : ' shared') + '</title></rect>';
        if (val > 0) {
          content += '<text x="' + (x + cellSz / 2) + '" y="' + (y + cellSz / 2 + 3) + '" fill="' + textColor + '" font-size="8" font-weight="500" text-anchor="middle" font-family="Roboto Mono,monospace">' + val + '</text>';
        }
      });
    });

    container.innerHTML = '<div class="gauges-matrix-wrap">' + svg(svgW, svgH, content) + '</div>';
  })();

  /* ============================================================
     Section 5a: Collector Depth — Engagement Tiers
     ============================================================ */

  (function () {
    var container = el("gauge-tiers");
    if (!container) return;

    var tiers = [
      { label: "6+ airports", min: 6, max: 999, color: C.gold },
      { label: "4–5 airports", min: 4, max: 5, color: C.teal },
      { label: "3 airports", min: 3, max: 3, color: C.pink },
      { label: "2 airports", min: 2, max: 2, color: C.purple },
      { label: "1 airport", min: 1, max: 1, color: C.purpleDeep }
    ];

    tiers.forEach(function (t) { t.count = 0; });
    LEADERBOARDS.addresses.forEach(function (a) {
      tiers.forEach(function (t) {
        if (a.airport_count >= t.min && a.airport_count <= t.max) t.count++;
      });
    });

    var maxCount = Math.max.apply(null, tiers.map(function (t) { return t.count; }));

    container.innerHTML = tiers.map(function (t) {
      var pct = (t.count / maxCount) * 100;
      var totalPct = Math.round((t.count / LEADERBOARDS.addresses.length) * 100);
      return '<div class="gauge-bar-row">' +
        '<span class="gauge-bar-label">' + t.label + '</span>' +
        '<div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:' + pct + '%;background:' + t.color + '"></div></div>' +
        '<span class="gauge-bar-value">' + t.count + ' <span class="gauge-bar-pct">(' + totalPct + '%)</span></span></div>';
    }).join("");
  })();

  /* ============================================================
     Section 5b: Geographic Reach
     ============================================================ */

  (function () {
    var container = el("gauge-reach");
    if (!container) return;

    // Count continents per collector
    var addrContinents = {};
    CLAIMS.forEach(function (c) {
      var ap = airportByCode[c.airport];
      if (!ap) return;
      if (!addrContinents[c.address]) addrContinents[c.address] = {};
      addrContinents[c.address][ap.continent] = true;
    });

    var buckets = [
      { label: "1 continent", sublabel: "Homebodies", count: 0, color: C.purpleDeep },
      { label: "2 continents", sublabel: "Roamers", count: 0, color: C.purple },
      { label: "3+ continents", sublabel: "Globetrotters", count: 0, color: C.gold }
    ];

    Object.keys(addrContinents).forEach(function (addr) {
      var n = Object.keys(addrContinents[addr]).length;
      if (n >= 3) buckets[2].count++;
      else if (n === 2) buckets[1].count++;
      else buckets[0].count++;
    });

    var total = LEADERBOARDS.addresses.length;

    // Stacked horizontal bar
    var w = 400, h = 80, padL = 0, barH = 24, barY = 8;
    var content = '';

    var xOff = 0;
    buckets.forEach(function (b) {
      var bw = (b.count / total) * w;
      content += '<rect x="' + xOff + '" y="' + barY + '" width="' + bw + '" height="' + barH + '" rx="' + (xOff === 0 ? 6 : 0) + '" fill="' + b.color + '">';
      content += '<title>' + b.label + ': ' + b.count + ' (' + Math.round(b.count / total * 100) + '%)</title></rect>';
      if (bw > 30) {
        content += '<text x="' + (xOff + bw / 2) + '" y="' + (barY + barH / 2 + 4) + '" fill="#fff" font-size="9" font-weight="600" text-anchor="middle" font-family="Roboto Mono,monospace">' + Math.round(b.count / total * 100) + '%</text>';
      }
      xOff += bw;
    });

    // Legend below
    var legendY = barY + barH + 16;
    buckets.forEach(function (b, i) {
      var lx = i * 140;
      content += '<rect x="' + lx + '" y="' + legendY + '" width="8" height="8" rx="2" fill="' + b.color + '"/>';
      content += '<text x="' + (lx + 12) + '" y="' + (legendY + 8) + '" fill="' + C.muted + '" font-size="8" font-family="Rubik,sans-serif">' + b.sublabel + ' (' + b.count + ')</text>';
    });

    container.innerHTML = svg(w, legendY + 20, content);
  })();

  /* ============================================================
     Section 6: Continental Race
     ============================================================ */

  (function () {
    var container = el("gauge-continents");
    if (!container) return;

    // Count total airports per continent
    var continentTotal = {};
    AIRPORTS.forEach(function (a) {
      continentTotal[a.continent] = (continentTotal[a.continent] || 0) + 1;
    });

    // Build per-continent time series
    var continentTimeSeries = {};
    var continentCumul = {};
    LEADERBOARDS.regions.forEach(function (r) {
      continentTimeSeries[r.continent] = {};
      continentCumul[r.continent] = 0;
    });

    sorted.forEach(function (c) {
      var ap = airportByCode[c.airport];
      if (!ap) return;
      var day = c.created.slice(0, 10);
      continentCumul[ap.continent] = (continentCumul[ap.continent] || 0) + 1;
      continentTimeSeries[ap.continent][day] = continentCumul[ap.continent];
    });

    // Sort regions by claims desc
    var regions = LEADERBOARDS.regions.slice().sort(function (a, b) { return b.claims - a.claims; });
    var maxClaims = regions[0] ? regions[0].claims : 1;

    container.innerHTML = regions.map(function (r) {
      var total = continentTotal[r.continent] || 1;
      var claimed = r.airport_count;
      var coverPct = Math.round((claimed / total) * 100);
      var claimPct = (r.claims / maxClaims) * 100;
      var color = C.region[r.continent] || C.purple;

      // Mini sparkline
      var ts = continentTimeSeries[r.continent] || {};
      var days = Object.keys(ts).sort();
      var sparkSvg = "";
      if (days.length > 1) {
        var sparkW = 80, sparkH = 20;
        var sparkMax = ts[days[days.length - 1]];
        var sparkPts = days.map(function (d, i) {
          var x = (i / (days.length - 1)) * sparkW;
          var y = sparkH - (ts[d] / sparkMax) * sparkH;
          return x + "," + y;
        }).join(" ");
        sparkSvg = '<svg viewBox="0 0 ' + sparkW + ' ' + sparkH + '" class="gauges-continent-spark"><polyline points="' + sparkPts + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      }

      return '<div class="gauges-continent-row">' +
        '<span class="gauges-continent-name" style="color:' + color + '">' + r.continent + '</span>' +
        '<div class="gauges-continent-bar-wrap">' +
          '<div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:' + claimPct + '%;background:' + color + '"></div></div>' +
        '</div>' +
        '<span class="gauges-continent-claims">' + r.claims + '</span>' +
        sparkSvg +
        '<span class="gauges-continent-coverage">' + claimed + '/' + total + ' <span class="gauge-bar-pct">(' + coverPct + '%)</span></span>' +
      '</div>';
    }).join("");
  })();

  /* ============================================================
     Section 7: Team Snapshot
     ============================================================ */

  (function () {
    var teamsList = (TEAMS && TEAMS.teams) ? TEAMS.teams : [];
    // Filter out hidden types
    var visible = teamsList.filter(function (t) { return t.type !== "month_started"; });

    function buildTeamBars(containerId, sortKey, label) {
      var ctn = el(containerId);
      if (!ctn) return;
      var sorted = visible.slice().sort(function (a, b) { return (b[sortKey] || 0) - (a[sortKey] || 0); });
      var top10 = sorted.slice(0, 10);
      var maxVal = top10[0] ? top10[0][sortKey] : 1;

      var badgeLabels = { ens_regex: "ENS", poap_holders: "POAP", anon: "ANON", first_airport: "HOME" };

      ctn.innerHTML = top10.map(function (t) {
        var pct = (t[sortKey] / maxVal) * 100;
        var badge = badgeLabels[t.type] || t.type;
        return '<div class="gauge-bar-row gauge-bar-row--team">' +
          '<span class="gauge-bar-label gauge-bar-label--wide"><a href="/teams/' + t.id + '/">' + t.name + '</a> <span class="board-badge board-badge--' + t.type + '">' + badge + '</span></span>' +
          '<div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:' + pct + '%;background:' + C.purple + '"></div></div>' +
          '<span class="gauge-bar-value">' + t[sortKey] + '</span></div>';
      }).join("");
    }

    buildTeamBars("gauge-teams-claims", "total_claims", "claims");
    buildTeamBars("gauge-teams-coverage", "unique_airports", "airports");
  })();

  /* ============================================================
     Section 8: Milestones Timeline
     ============================================================ */

  (function () {
    var container = el("gauge-milestones");
    if (!container) return;

    // Walk claims to find milestone dates — fewer, more significant milestones
    var milestones = [];
    var claimTargets = [50, 100, 200, 250];
    var airportTargets = [25, 50];
    var travelerTargets = [50, 100];

    var seenAirports = {}, seenAddrs = {}, aC = 0, aA = 0, aT = 0;
    sorted.forEach(function (c) {
      aC++;
      var newAirport = !seenAirports[c.airport];
      var newTraveler = !seenAddrs[c.address];
      if (newAirport) { seenAirports[c.airport] = true; aA++; }
      if (newTraveler) { seenAddrs[c.address] = true; aT++; }

      claimTargets.forEach(function (t) {
        if (aC === t) milestones.push({ label: t + " claims", date: c.created.slice(0, 10), type: "claim" });
      });
      if (newAirport) airportTargets.forEach(function (t) {
        if (aA === t) milestones.push({ label: t + (t > 1 ? " airports" : " airport"), date: c.created.slice(0, 10), type: "airport" });
      });
      if (newTraveler) travelerTargets.forEach(function (t) {
        if (aT === t) milestones.push({ label: t + (t > 1 ? " travelers" : " traveler"), date: c.created.slice(0, 10), type: "traveler" });
      });
    });

    // Project future milestones
    var velocity = CLAIMS.length / dayOfYear;
    var apVelocity = Object.keys(seenAirports).length / dayOfYear;
    var trVelocity = Object.keys(seenAddrs).length / dayOfYear;

    var futureClaims = [500, 1000];
    var futureAirports = [75, 100];
    var futureTravelers = [200, 300];

    function projectDate(current, target, vel) {
      if (vel <= 0) return null;
      var daysNeeded = (target - current) / vel;
      var d = new Date(now.getTime() + daysNeeded * 86400000);
      if (d > gameEnd) return null;
      return d.toISOString().slice(0, 10);
    }

    futureClaims.forEach(function (t) {
      if (aC < t) {
        var d = projectDate(aC, t, velocity);
        if (d) milestones.push({ label: t + " claims", date: d, type: "claim", projected: true });
      }
    });
    futureAirports.forEach(function (t) {
      if (aA < t) {
        var d = projectDate(aA, t, apVelocity);
        if (d) milestones.push({ label: t + " airports", date: d, type: "airport", projected: true });
      }
    });
    futureTravelers.forEach(function (t) {
      if (aT < t) {
        var d = projectDate(aT, t, trVelocity);
        if (d) milestones.push({ label: t + " travelers", date: d, type: "traveler", projected: true });
      }
    });

    milestones.sort(function (a, b) { return a.date.localeCompare(b.date); });

    // Draw timeline — taller with more label room
    var w = 700, h = 140, padL = 16, padR = 16;
    var lineY = 70, dotR = 5;
    var chartW = w - padL - padR;
    var content = '';

    // Base line
    content += '<line x1="' + padL + '" y1="' + lineY + '" x2="' + (w - padR) + '" y2="' + lineY + '" stroke="' + C.faint + '" stroke-width="2"/>';

    // Elapsed portion
    var todayX = padL + dateToYearFraction(now) * chartW;
    content += '<line x1="' + padL + '" y1="' + lineY + '" x2="' + todayX + '" y2="' + lineY + '" stroke="' + C.purple + '" stroke-width="2"/>';

    // Month ticks
    for (var m = 0; m < 12; m++) {
      var mx = padL + dateToYearFraction(new Date(2026, m, 1)) * chartW;
      content += '<line x1="' + mx + '" y1="' + (lineY - 3) + '" x2="' + mx + '" y2="' + (lineY + 3) + '" stroke="' + C.muted + '" stroke-width="1"/>';
      content += '<text x="' + mx + '" y="' + (lineY + 16) + '" fill="' + C.muted + '" font-size="7" text-anchor="middle" font-family="Roboto Mono,monospace">' + monthLabel(m) + '</text>';
    }

    // Milestone dots — collision-aware label placement
    // Assign labels above/below, using 2 tiers per side to avoid overlap
    var typeColors = { claim: C.purple, airport: C.teal, traveler: C.pink };
    var minLabelSpacing = 50; // min px between labels on same tier
    var tiers = [
      { y: lineY - 16, dateY: lineY - 26, lastX: -999 },  // above close
      { y: lineY - 36, dateY: lineY - 46, lastX: -999 },  // above far
      { y: lineY + 28, dateY: lineY + 38, lastX: -999 },  // below close
      { y: lineY + 48, dateY: lineY + 58, lastX: -999 }   // below far
    ];

    milestones.forEach(function (ms) {
      var x = padL + dateToYearFraction(ms.date) * chartW;
      var color = typeColors[ms.type] || C.purple;

      // Find best tier — prefer alternating above/below, pick first with enough spacing
      var bestTier = null;
      for (var t = 0; t < tiers.length; t++) {
        if (x - tiers[t].lastX >= minLabelSpacing) {
          bestTier = t;
          break;
        }
      }
      if (bestTier === null) bestTier = 0; // fallback

      var tier = tiers[bestTier];
      tier.lastX = x;

      // Connector line from dot to label
      var isAbove = bestTier < 2;
      var connEnd = isAbove ? tier.y + 8 : tier.y - 10;
      content += '<line x1="' + x + '" y1="' + (isAbove ? lineY - dotR : lineY + dotR) + '" x2="' + x + '" y2="' + connEnd + '" stroke="' + (ms.projected ? C.faint : "rgba(255,255,255,0.12)") + '" stroke-width="1"/>';

      // Dot
      if (ms.projected) {
        content += '<circle cx="' + x + '" cy="' + lineY + '" r="' + dotR + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="2,2"/>';
      } else {
        content += '<circle cx="' + x + '" cy="' + lineY + '" r="' + dotR + '" fill="' + color + '"/>';
      }

      // Label
      content += '<text x="' + x + '" y="' + tier.y + '" fill="' + (ms.projected ? C.muted : color) + '" font-size="7" font-weight="600" text-anchor="middle" font-family="Rubik,sans-serif">' + ms.label + '</text>';

      // Date
      var shortDate = new Date(ms.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      content += '<text x="' + x + '" y="' + tier.dateY + '" fill="' + C.muted + '" font-size="6" text-anchor="middle" font-family="Roboto Mono,monospace">' + shortDate + '</text>';
    });

    container.innerHTML = svg(w, h, content);
  })();

  /* ============================================================
     Section 9: Unclaimed Frontiers
     ============================================================ */

  (function () {
    var container = el("gauge-frontiers");
    if (!container) return;

    var unclaimed = {};
    AIRPORTS.forEach(function (a) {
      if (a.claims === 0) {
        if (!unclaimed[a.continent]) unclaimed[a.continent] = [];
        unclaimed[a.continent].push(a);
      }
    });

    var continents = Object.keys(unclaimed).sort(function (a, b) {
      return unclaimed[b].length - unclaimed[a].length;
    });

    container.innerHTML = continents.map(function (cont) {
      var aps = unclaimed[cont].sort(function (a, b) { return a.code.localeCompare(b.code); });
      var color = C.region[cont] || C.purple;
      return '<div class="gauges-frontier-group">' +
        '<div class="gauges-frontier-label" style="color:' + color + '">' + cont + ' <span class="gauge-bar-pct">(' + aps.length + ')</span></div>' +
        '<div class="gauges-frontier-codes">' +
        aps.map(function (a) {
          return '<a href="/airports/' + a.code.toLowerCase() + '/" class="gauges-frontier-badge" title="' + a.name + ', ' + a.city + '">' + a.code + '</a>';
        }).join("") +
        '</div></div>';
    }).join("");
  })();

})();
