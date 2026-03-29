/* Traveler search — Flight Path */
(function () {
  var input = document.getElementById("address-search");
  var clearBtn = document.getElementById("clear-search");
  var rows = document.querySelectorAll("#lb-travelers tr");

  if (!input) return;

  function filter(query) {
    query = query.toLowerCase().trim();
    rows.forEach(function (row) {
      if (!query) { row.style.display = ""; return; }
      var ens = row.getAttribute("data-ens") || "";
      var addr = row.getAttribute("data-address") || "";
      row.style.display = (ens.indexOf(query) !== -1 || addr.indexOf(query) !== -1) ? "" : "none";
    });
  }

  input.addEventListener("input", function () {
    var val = input.value;
    clearBtn.style.display = val ? "inline-flex" : "none";
    filter(val);
  });

  clearBtn.addEventListener("click", function () {
    input.value = "";
    clearBtn.style.display = "none";
    filter("");
  });
})();
