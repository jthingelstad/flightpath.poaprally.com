/* Gauges page — Flight Path */
(function () {

  function buildAreaChart(data, container, opts) {
    opts = opts || {};
    const w = opts.width || 700, h = opts.height || 160;
    const padL = opts.padL || 0, padR = opts.padR || 0, padT = 10, padB = 4;
    const chartW = w - padL - padR, chartH = h - padT - padB;
    const maxVal = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));

    const points = data.map(function (d, i) {
      const x = padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
      const y = padT + chartH - (d.value / maxVal) * chartH;
      return { x: x, y: y, label: d.label, value: d.value };
    });

    const linePoints = points.map(function (p) { return p.x + "," + p.y; }).join(" ");
    const areaPoints = padL + "," + (padT + chartH) + " " + linePoints + " " + (padL + chartW) + "," + (padT + chartH);

    let gridLines = "";
    for (let g = 0; g <= 4; g++) {
      const gy = padT + (g / 4) * chartH;
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (padL + chartW) + '" y2="' + gy + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    }

    let svg = '<div class="gauge-line-chart">' +
      '<div class="gauge-value-label">' + (opts.valueLabel || data[data.length - 1].value) + '</div>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">' +
      gridLines +
      '<defs><linearGradient id="' + (opts.gradientId || "grad") + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + (opts.color || "#8076FA") + '" stop-opacity="0.3"/>' +
      '<stop offset="100%" stop-color="' + (opts.color || "#8076FA") + '" stop-opacity="0.02"/>' +
      '</linearGradient></defs>' +
      '<polygon points="' + areaPoints + '" fill="url(#' + (opts.gradientId || "grad") + ')"/>' +
      '<polyline points="' + linePoints + '" fill="none" stroke="' + (opts.color || "#8076FA") + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    points.forEach(function (p) {
      svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + (opts.color || "#8076FA") + '" stroke="#3A3A3A" stroke-width="1.5"/>';
    });
    svg += '</svg>';

    if (opts.axisLabels) {
      svg += '<div class="gauge-axis-labels">';
      opts.axisLabels.forEach(function (l) { svg += '<span>' + l + '</span>'; });
      svg += '</div>';
    }
    svg += '</div>';
    container.innerHTML = svg;
  }

  function buildBarChart(data, container, opts) {
    opts = opts || {};
    const maxVal = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    const colors = opts.colors || ["#8076FA", "#9289FF", "#F87588", "#0FCEAD", "#6db3f8", "#f0e6d3"];
    container.innerHTML = data.map(function (d, i) {
      const pct = (d.value / maxVal) * 100;
      const color = d.color || colors[i % colors.length];
      return '<div class="gauge-bar-row">' +
        '<span class="gauge-bar-label">' + d.label + '</span>' +
        '<div class="gauge-bar-track"><div class="gauge-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
        '<span class="gauge-bar-value">' + d.value + '</span></div>';
    }).join("");
  }

  // Cumulative
  const sorted = CLAIMS.slice().sort(function (a, b) { return a.created.localeCompare(b.created); });
  const dailyCumulative = []; let cumCount = 0; let lastDay = "";
  sorted.forEach(function (c) {
    const day = c.created.slice(0, 10);
    cumCount++;
    if (day !== lastDay) { dailyCumulative.push({ label: day, value: cumCount }); lastDay = day; }
    else { dailyCumulative[dailyCumulative.length - 1].value = cumCount; }
  });
  let data = dailyCumulative;
  if (data.length > 60) {
    const step = Math.ceil(data.length / 60), sampled = [];
    for (let i = 0; i < data.length; i += step) sampled.push(data[i]);
    if (sampled[sampled.length - 1] !== data[data.length - 1]) sampled.push(data[data.length - 1]);
    data = sampled;
  }
  buildAreaChart(data, document.getElementById("gauge-cumulative"), {
    color: "#8076FA", gradientId: "grad-cum",
    valueLabel: CLAIMS.length + " total claims",
    axisLabels: [data[0].label.slice(5), data[data.length - 1].label.slice(5)],
  });

  // By month
  const months = {};
  CLAIMS.forEach(function (c) { const k = c.created.slice(0, 7); months[k] = (months[k] || 0) + 1; });
  buildBarChart(Object.keys(months).sort().map(function (k) {
    const d = new Date(k + "-01");
    return { label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), value: months[k] };
  }), document.getElementById("gauge-by-month"), { colors: ["#8076FA", "#9289FF", "#7168DE", "#6db3f8"] });

  // By day
  const days = {}, dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  CLAIMS.forEach(function (c) { const d = new Date(c.created); days[d.getDay()] = (days[d.getDay()] || 0) + 1; });
  buildBarChart(dayNames.map(function (name, i) {
    return { label: name, value: days[i] || 0 };
  }), document.getElementById("gauge-by-day"), { colors: ["#F87588", "#9289FF", "#8076FA", "#7168DE", "#6db3f8", "#0FCEAD", "#F87588"] });

  // By region
  const regionColors = { "North America": "#8076FA", "Europe": "#9289FF", "Asia": "#F87588", "South America": "#0FCEAD", "Africa": "#6db3f8", "Oceania": "#f0e6d3" };
  buildBarChart(LEADERBOARDS.regions.map(function (r) {
    return { label: r.continent, value: r.claims, color: regionColors[r.continent] || "#8076FA" };
  }), document.getElementById("gauge-by-region"));

  // Top airports
  buildBarChart(LEADERBOARDS.airports.slice(0, 10).map(function (a) {
    return { label: a.code, value: a.claims };
  }), document.getElementById("gauge-top-airports"), { colors: ["#8076FA"] });

})();
