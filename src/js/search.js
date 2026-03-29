/* Traveler search — Flight Path */
(function () {
  const input = document.getElementById("address-search");
  const clearBtn = document.getElementById("clear-search");
  const rows = document.querySelectorAll("#lb-travelers tr");

  if (!input || !clearBtn) return;

  let debounceTimer;

  function filter(query) {
    query = query.toLowerCase().trim();
    rows.forEach(function (row) {
      if (!query) { row.style.display = ""; return; }
      const ens = row.getAttribute("data-ens") || "";
      const addr = row.getAttribute("data-address") || "";
      row.style.display = (ens.includes(query) || addr.includes(query)) ? "" : "none";
    });
  }

  input.addEventListener("input", function () {
    const val = input.value;
    clearBtn.style.display = val ? "inline-flex" : "none";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { filter(val); }, 150);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    clearBtn.style.display = "none";
    filter("");
  });
})();
