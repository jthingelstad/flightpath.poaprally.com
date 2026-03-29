/* Airport filter — Flight Path */
(function () {
  const container = document.getElementById("airport-filters");
  const rows = document.querySelectorAll("#lb-airports tr");
  if (!container) return;

  container.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;

    container.querySelectorAll("[data-filter]").forEach(function (b) {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");

    const filter = btn.dataset.filter;
    rows.forEach(function (row) {
      if (filter === "all") { row.style.display = ""; return; }
      row.style.display = (row.getAttribute("data-continent") === filter) ? "" : "none";
    });
  });
})();
