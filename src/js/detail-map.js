/* Detail map — Leaflet-based airport map for team/traveler/airport pages */
(function () {
  const container = document.getElementById("detail-map");
  if (!container) return;

  var airportCodes, airportClaims, focalCode;
  try {
    airportCodes = JSON.parse(container.getAttribute("data-airports") || "[]");
    airportClaims = JSON.parse(container.getAttribute("data-claims") || "{}");
    focalCode = container.getAttribute("data-focal") || null;
  } catch (e) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.4);font-size:0.85rem;">Map data unavailable</div>';
    return;
  }

  var allAirports = window.DETAIL_MAP_AIRPORTS || [];

  var airportByCode = {};
  allAirports.forEach(function (a) { airportByCode[a.code] = a; });

  /* In affinity mode, include the focal airport in the points list */
  var isAffinity = !!focalCode;
  var codes = airportCodes.slice();
  if (isAffinity && codes.indexOf(focalCode) === -1) {
    codes.unshift(focalCode);
  }

  var points = [];
  codes.forEach(function (code) {
    var ap = airportByCode[code];
    if (ap && ap.lat && ap.lon) {
      points.push({ airport: ap, claims: airportClaims[code] || 0, isFocal: code === focalCode });
    }
  });

  if (points.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.4);font-size:0.85rem;">No airports to display</div>';
    return;
  }

  var map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
  }).addTo(map);

  var maxClaims = Math.max.apply(null, points.map(function (p) { return p.claims; }).concat([1]));

  points.forEach(function (p) {
    var radius, fillColor, borderColor, opacity;

    if (p.isFocal) {
      /* Focal airport — gold, prominent */
      radius = 12;
      fillColor = "#FFE44D";
      borderColor = "#D4BE00";
      opacity = 1;
    } else if (isAffinity) {
      /* Affinity markers — purple, sized by shared count */
      radius = 5 + (p.claims / maxClaims) * 13;
      fillColor = "#8076FA";
      borderColor = "#9289FF";
      opacity = 0.35 + (p.claims / maxClaims) * 0.5;
    } else {
      /* Default mode (teams/travelers) */
      radius = 6 + (p.claims / maxClaims) * 14;
      fillColor = "#8076FA";
      borderColor = "#9289FF";
      opacity = 0.7;
    }

    var marker = L.circleMarker([p.airport.lat, p.airport.lon], {
      radius: radius,
      fillColor: fillColor,
      fillOpacity: opacity,
      color: borderColor,
      weight: p.isFocal ? 2.5 : 1.5,
    }).addTo(map);

    var imageHtml = p.airport.image_url
      ? '<img src="' + p.airport.image_url + '" style="width:48px;height:48px;border-radius:50%;border:2px solid ' + fillColor + ';display:block;margin:0 auto 6px;">'
      : '';
    var valueLabel = isAffinity && !p.isFocal
      ? p.claims + ' shared collector' + (p.claims !== 1 ? 's' : '')
      : p.claims + ' claim' + (p.claims !== 1 ? 's' : '');
    marker.bindPopup(
      '<div style="font-family:Rubik,sans-serif;font-size:12px;text-align:center;min-width:100px;">' +
      imageHtml +
      '<div style="font-family:Comfortaa,sans-serif;font-weight:700;color:' + fillColor + ';font-size:14px;">' + p.airport.code + '</div>' +
      '<div>' + p.airport.name + '</div>' +
      '<div style="color:#888;font-size:11px;">' + p.airport.city + ', ' + p.airport.country + '</div>' +
      '<div style="margin-top:4px;font-weight:600;color:#FFE44D;">' + valueLabel + '</div>' +
      '</div>'
    );
  });

  if (points.length === 1) {
    map.setView([points[0].airport.lat, points[0].airport.lon], 5);
  } else {
    var bounds = L.latLngBounds(points.map(function (p) { return [p.airport.lat, p.airport.lon]; }));
    map.fitBounds(bounds, { padding: [30, 30] });
  }
})();
