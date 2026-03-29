/* Detail map — Leaflet-based airport map for team/traveler pages */
(function () {
  const container = document.getElementById("detail-map");
  if (!container) return;

  let airportCodes, airportClaims;
  try {
    airportCodes = JSON.parse(container.getAttribute("data-airports") || "[]");
    airportClaims = JSON.parse(container.getAttribute("data-claims") || "{}");
  } catch (e) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.4);font-size:0.85rem;">Map data unavailable</div>';
    return;
  }

  const allAirports = window.DETAIL_MAP_AIRPORTS || [];

  const airportByCode = {};
  allAirports.forEach(function (a) { airportByCode[a.code] = a; });

  const points = [];
  airportCodes.forEach(function (code) {
    const ap = airportByCode[code];
    if (ap && ap.lat && ap.lon) {
      points.push({ airport: ap, claims: airportClaims[code] || 0 });
    }
  });

  if (points.length === 0) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.4);font-size:0.85rem;">No airports to display</div>';
    return;
  }

  const map = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: true,
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
  }).addTo(map);

  const maxClaims = Math.max.apply(null, points.map(function (p) { return p.claims; }).concat([1]));

  points.forEach(function (p) {
    const radius = 6 + (p.claims / maxClaims) * 14;
    const marker = L.circleMarker([p.airport.lat, p.airport.lon], {
      radius: radius,
      fillColor: "#8076FA",
      fillOpacity: 0.7,
      color: "#9289FF",
      weight: 1.5,
    }).addTo(map);

    const imageHtml = p.airport.image_url
      ? '<img src="' + p.airport.image_url + '" style="width:48px;height:48px;border-radius:50%;border:2px solid #8076FA;display:block;margin:0 auto 6px;">'
      : '';
    marker.bindPopup(
      '<div style="font-family:Rubik,sans-serif;font-size:12px;text-align:center;min-width:100px;">' +
      imageHtml +
      '<div style="font-family:Comfortaa,sans-serif;font-weight:700;color:#8076FA;font-size:14px;">' + p.airport.code + '</div>' +
      '<div>' + p.airport.name + '</div>' +
      '<div style="color:#888;font-size:11px;">' + p.airport.city + ', ' + p.airport.country + '</div>' +
      '<div style="margin-top:4px;font-weight:600;color:#FFE44D;">' + p.claims + ' claim' + (p.claims !== 1 ? 's' : '') + '</div>' +
      '</div>'
    );
  });

  if (points.length === 1) {
    map.setView([points[0].airport.lat, points[0].airport.lon], 5);
  } else {
    const bounds = L.latLngBounds(points.map(function (p) { return [p.airport.lat, p.airport.lon]; }));
    map.fitBounds(bounds, { padding: [30, 30] });
  }
})();
