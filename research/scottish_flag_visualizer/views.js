"use strict";

(() => {
  const storageKey = "scottish-flag-visible-views-v1";
  const targets = {
    parameters: "parameters-view",
    spectrum: "spectrum-view",
    momentum: "momentum-view",
    explanation: "explanation-view",
    contour: "contour-view",
    surface: "surface-view",
    branch: "branch-view",
    projections: "projections-view",
  };
  const defaults = new Set(["parameters", "spectrum", "momentum"]);
  let selected = new Set(defaults);

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.every((name) => Object.hasOwn(targets, name))) selected = new Set(saved);
  } catch (_) {
    selected = new Set(defaults);
  }

  function applyViews(save = true) {
    Object.entries(targets).forEach(([name, id]) => {
      document.getElementById(id).hidden = !selected.has(name);
    });

    const coreCount = ["parameters", "spectrum", "momentum"].filter((name) => selected.has(name)).length;
    document.querySelector(".tiled-workspace").dataset.visibleCount = String(coreCount);

    const sideVisible = selected.has("branch") || selected.has("projections");
    document.getElementById("curve-side-stack").hidden = !sideVisible;
    const curveGridCount = Number(selected.has("surface")) + Number(sideVisible);
    const curveGrid = document.getElementById("curve-grid");
    curveGrid.hidden = curveGridCount === 0;
    curveGrid.dataset.visibleCount = String(curveGridCount);

    const curveVisible = selected.has("explanation") || selected.has("contour") || curveGridCount > 0;
    document.getElementById("curve-lab").hidden = !curveVisible;
    document.getElementById("view-count").textContent = `${selected.size} view${selected.size === 1 ? "" : "s"}`;

    document.querySelectorAll("[data-view-toggle]").forEach((checkbox) => {
      checkbox.checked = selected.has(checkbox.dataset.viewToggle);
    });
    if (save) {
      try { localStorage.setItem(storageKey, JSON.stringify([...selected])); } catch (_) { /* local file storage may be unavailable */ }
    }
    window.dispatchEvent(new CustomEvent("sf-view-change", { detail: { visible: [...selected] } }));
  }

  document.querySelectorAll("[data-view-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const name = checkbox.dataset.viewToggle;
      if (checkbox.checked) selected.add(name);
      else selected.delete(name);
      applyViews();
    });
  });

  applyViews(false);
})();
