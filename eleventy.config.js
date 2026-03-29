module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/.nojekyll");

  eleventyConfig.addFilter("formatDate", (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  });

  eleventyConfig.addFilter("shortDate", (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  eleventyConfig.addFilter("relativeDate", (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return diffDays + "d ago";
    if (diffDays < 30) return Math.floor(diffDays / 7) + "w ago";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  eleventyConfig.addFilter("truncateAddress", (addr) => {
    if (!addr) return "";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  });

  eleventyConfig.addFilter("displayName", (item) => {
    return item.ens || (item.address ? item.address.slice(0, 6) + "..." + item.address.slice(-4) : "");
  });

  eleventyConfig.addFilter("teamBadgeLabel", (type) => {
    const labels = {
      ens_regex: "ENS",
      poap_holders: "POAP",
      anon: "ANON",
      first_airport: "HOME",
      month_started: "MONTH",
    };
    return labels[type] || type;
  });

  eleventyConfig.addFilter("filterHiddenTeams", (teams) => {
    const hidden = { month_started: true };
    return (teams || []).filter((t) => !hidden[t.type]);
  });

  eleventyConfig.addFilter("limit", (arr, n) => {
    return (arr || []).slice(0, n);
  });

  eleventyConfig.addFilter("sortByCreatedDesc", (arr) => {
    return (arr || []).slice().sort((a, b) => b.created.localeCompare(a.created));
  });

  eleventyConfig.addFilter("claimedAirports", (airports) => {
    return (airports || []).filter((a) => a.claims > 0);
  });

  eleventyConfig.addFilter("countUnique", (arr, key) => {
    return new Set((arr || []).map((item) => item[key])).size;
  });

  eleventyConfig.addFilter("findByCode", (airports, code) => {
    return (airports || []).find((a) => a.code === code);
  });

  eleventyConfig.addFilter("findByAddress", (addresses, addr) => {
    return (addresses || []).find((a) => a.address === addr);
  });

  eleventyConfig.addFilter("claimsForAddress", (claims, addr) => {
    return (claims || []).filter((c) => c.address === addr).sort((a, b) => a.created.localeCompare(b.created));
  });

  eleventyConfig.addFilter("claimsForAirport", (claims, code) => {
    return (claims || []).filter((c) => c.airport === code).sort((a, b) => b.created.localeCompare(a.created));
  });

  eleventyConfig.addFilter("teamsForAddress", (teams, addr) => {
    const hidden = { month_started: true };
    return (teams || []).filter(
      (t) => !hidden[t.type] && t.members.some((m) => m.address === addr)
    );
  });

  eleventyConfig.addFilter("countriesForAddress", (claims, airports, addr) => {
    const addrClaims = (claims || []).filter((c) => c.address === addr);
    const airportMap = {};
    (airports || []).forEach((a) => (airportMap[a.code] = a));
    const countries = new Set();
    addrClaims.forEach((c) => {
      const ap = airportMap[c.airport];
      if (ap && ap.country) countries.add(ap.country);
    });
    return countries.size;
  });

  eleventyConfig.addFilter("continentsForAddress", (claims, airports, addr) => {
    const addrClaims = (claims || []).filter((c) => c.address === addr);
    const airportMap = {};
    (airports || []).forEach((a) => (airportMap[a.code] = a));
    const continents = new Set();
    addrClaims.forEach((c) => {
      const ap = airportMap[c.airport];
      if (ap && ap.continent) continents.add(ap.continent);
    });
    return continents.size;
  });

  eleventyConfig.addFilter("percentage", (part, whole) => {
    if (!whole) return 0;
    return Math.round((part / whole) * 100);
  });

  eleventyConfig.addFilter("cacheBust", (url) => {
    const meta = require("./_data/meta.json");
    const v = meta.data_hash || Date.now();
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "v=" + v;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      data: "../_data",
    },
  };
};
