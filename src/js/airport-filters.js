/* Airport filter — Flight Path */
(function () {
  var container = document.getElementById("airport-filters");
  var rows = document.querySelectorAll("#lb-airports tr");
  if (!container) return;

  container.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-filter]");
    if (!btn) return;

    container.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");

    var filter = btn.dataset.filter;
    rows.forEach(function (row) {
      if (filter === "all") { row.style.display = ""; return; }
      row.style.display = (row.getAttribute("data-continent") === filter) ? "" : "none";
    });
  });
})();
