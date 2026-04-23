// FenceClaw — static-site fence-code lookup.
// Loads municipalities.json, routes a 5-digit ZIP through zip_map to one or
// more municipality records, and renders them. No framework, no build step.

const CONTACT_EMAIL = "george@remylawpllc.com";

let DATA = null;
let currentMunis = null; // remembered so the "Back" button can re-render the picker

async function loadData() {
  const res = await fetch("municipalities.json");
  if (!res.ok) throw new Error("Failed to load municipalities.json: " + res.status);
  return res.json();
}

function lookupZip(zip, data) {
  const slugs = data.zip_map[zip];
  if (!slugs) return null;
  return slugs.map((s) => data.municipalities[s]).filter(Boolean);
}

// ---------- helpers ----------

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function typeLabel(t) {
  return ({ city: "City", township: "Township", village: "Village" })[t] || (t || "");
}

function isMobile() {
  // Default to mobile if matchMedia is unavailable — this is a mobile-first
  // app and mobile has the safer section-collapse default.
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(max-width: 767px)").matches;
}

function statusBadge(status) {
  if (status === "verified") {
    return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Verified</span>';
  }
  if (status === "pending") {
    return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900">Pending</span>';
  }
  return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">Stub</span>';
}

// ---------- views ----------

function renderNotFound(zip) {
  const subject = encodeURIComponent("FenceClaw coverage request: " + zip);
  const body = encodeURIComponent(
    "Hi,\n\nPlease add fence code coverage for ZIP " + zip + ".\n\nThanks."
  );
  const mail = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  return `
    <div class="bg-white rounded-xl shadow p-6">
      <div class="text-amber-500 text-4xl leading-none mb-3" aria-hidden="true">⚠</div>
      <h2 class="text-xl font-bold mb-2">Not covered yet</h2>
      <p class="text-slate-700 mb-5">
        We don't have fence codes for <strong>${escapeHtml(zip)}</strong> yet.
      </p>
      <a href="${mail}"
         class="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-5 py-3 rounded-xl w-full sm:w-auto">
        Request coverage
      </a>
    </div>
  `;
}

function renderPicker(munis) {
  const cards = munis
    .map(
      (m) => `
    <button type="button" data-slug="${escapeHtml(m.slug)}"
            class="muni-picker w-full text-left bg-white rounded-xl shadow p-5 hover:shadow-md active:bg-slate-50 transition">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-lg font-bold text-slate-900">${escapeHtml(m.name)}</div>
          <div class="text-sm text-slate-500 mt-0.5">
            ${escapeHtml(m.county || "")} County · ${escapeHtml(typeLabel(m.type))}
          </div>
        </div>
        ${statusBadge(m.research_status)}
      </div>
      <div class="text-sm text-emerald-700 font-semibold mt-3">Tap to view codes →</div>
    </button>
  `
    )
    .join("");
  return `
    <div class="space-y-3">
      <h2 class="text-sm font-semibold text-slate-600 uppercase tracking-wider">
        ${munis.length} municipalities in this ZIP — which one?
      </h2>
      ${cards}
    </div>
  `;
}

function sectionWrap({ title, icon, body, defaultOpen }) {
  return `
    <details class="group border-t border-slate-200 py-4" ${defaultOpen ? "open" : ""}>
      <summary class="flex items-center justify-between cursor-pointer select-none py-1">
        <div class="flex items-center gap-2 text-base font-semibold">
          <span class="text-emerald-600" aria-hidden="true">${icon}</span>
          <span>${title}</span>
        </div>
        <span class="text-slate-400 group-open:rotate-180 transition-transform" aria-hidden="true">▾</span>
      </summary>
      <div class="mt-3">${body}</div>
    </details>
  `;
}

function renderHeight(h) {
  if (!h) return null;
  const card = (label, d) => {
    if (!d) return "";
    const val = d.max_ft != null ? `${d.max_ft} ft` : "—";
    return `
      <div class="bg-slate-50 rounded-xl p-4">
        <div class="text-xs font-semibold uppercase text-slate-500 tracking-wider">${label}</div>
        <div class="text-3xl font-bold text-slate-900 mt-1">${escapeHtml(val)}</div>
        ${d.notes ? `<div class="text-xs text-slate-600 mt-2 leading-snug">${escapeHtml(d.notes)}</div>` : ""}
      </div>
    `;
  };
  return `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      ${card("Front", h.front)}
      ${card("Side", h.side)}
      ${card("Rear", h.rear)}
    </div>
  `;
}

function renderSetback(s) {
  if (!s) return null;
  const yes = s.required === true;
  const dist = s.distance_in != null && s.distance_in > 0 ? ` · ${s.distance_in}"` : "";
  return `
    <div>
      <span class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold ${
        yes ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
      }">
        ${yes ? "Setback required" + dist : "No setback required"}
      </span>
      ${s.notes ? `<p class="text-sm text-slate-700 mt-3">${escapeHtml(s.notes)}</p>` : ""}
    </div>
  `;
}

function renderPermit(p) {
  if (!p) return null;
  const alwaysReq = p.required_always === true;
  const overReq = !alwaysReq && p.required_over_ft != null && p.required_over_ft > 0;
  let badge;
  if (alwaysReq) {
    badge = '<span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-red-600 text-white uppercase tracking-wide">Permit required</span>';
  } else if (overReq) {
    badge = `<span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-amber-500 text-white">Permit over ${p.required_over_ft} ft</span>`;
  } else {
    badge = '<span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-bold bg-emerald-600 text-white">No permit</span>';
  }
  return `
    <div class="flex flex-wrap items-center gap-3 mb-3">
      ${badge}
      ${p.fee_usd != null ? `<span class="text-3xl font-bold text-slate-900">$${escapeHtml(p.fee_usd)}</span>` : ""}
    </div>
    ${p.notes ? `<p class="text-sm text-slate-700">${escapeHtml(p.notes)}</p>` : ""}
  `;
}

function renderCornerLot(c) {
  if (!c) return null;
  if (!c.has_rule) {
    return '<p class="text-sm text-slate-500">No special corner-lot rule on record.</p>';
  }
  return `<p class="text-sm text-slate-700">${escapeHtml(c.notes || "Corner-lot visibility rule applies — contact permit office for the triangle dimensions.")}</p>`;
}

function renderPool(p) {
  if (!p) return null;
  if (!p.has_rule) {
    return '<p class="text-sm text-slate-500">No special pool-barrier rule on record.</p>';
  }
  return `<p class="text-sm text-slate-700">${escapeHtml(p.notes || "Pool-barrier rule applies — follows Michigan Residential Code.")}</p>`;
}

function renderMaterials(mat) {
  if (!mat) return null;
  const list = Array.isArray(mat.prohibited) ? mat.prohibited : [];
  const chips = list
    .map((x) => `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">✗ ${escapeHtml(x)}</span>`)
    .join(" ");
  return `
    ${chips ? `<div class="flex flex-wrap gap-2 mb-3">${chips}</div>` : '<p class="text-sm text-slate-500 mb-2">No prohibited materials listed.</p>'}
    ${mat.notes ? `<p class="text-sm text-slate-700">${escapeHtml(mat.notes)}</p>` : ""}
  `;
}

function renderPermitOffice(o) {
  if (!o) return "";
  const phoneRaw = o.phone ? o.phone.replace(/[^0-9+]/g, "") : "";
  return `
    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mt-6">
      <div class="text-xs font-semibold uppercase text-emerald-800 tracking-wider mb-2">Permit office</div>
      <div class="text-lg font-bold">${escapeHtml(o.name || "")}</div>
      ${o.address ? `<div class="text-sm text-slate-700 mt-1">${escapeHtml(o.address)}</div>` : ""}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
        ${o.phone ? `
          <a href="tel:${escapeHtml(phoneRaw)}"
             class="flex items-center justify-center gap-2 bg-white text-emerald-900 font-semibold py-3 px-4 rounded-xl border border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200">
            <span aria-hidden="true">📞</span><span>${escapeHtml(o.phone)}</span>
          </a>` : ""}
        ${o.email ? `
          <a href="mailto:${escapeHtml(o.email)}"
             class="flex items-center justify-center gap-2 bg-white text-emerald-900 font-semibold py-3 px-4 rounded-xl border border-emerald-300 hover:bg-emerald-100 active:bg-emerald-200 break-all">
            <span aria-hidden="true">✉</span><span>Email</span>
          </a>` : ""}
        ${o.portal_url ? `
          <a href="${escapeHtml(o.portal_url)}" target="_blank" rel="noopener noreferrer"
             class="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl">
            <span>Portal</span><span aria-hidden="true">↗</span>
          </a>` : ""}
      </div>
    </div>
  `;
}

function renderSources(srcs) {
  if (!Array.isArray(srcs) || srcs.length === 0) return "";
  return `
    <details class="mt-4 border-t border-slate-200 pt-4">
      <summary class="text-sm text-slate-600 cursor-pointer select-none">Sources (${srcs.length})</summary>
      <ul class="mt-2 space-y-1 text-xs">
        ${srcs
          .map(
            (s) =>
              `<li><a href="${escapeHtml(s)}" target="_blank" rel="noopener noreferrer" class="text-emerald-700 underline break-all">${escapeHtml(s)}</a></li>`
          )
          .join("")}
      </ul>
    </details>
  `;
}

function renderStub(m) {
  return `
    <article class="bg-white rounded-xl shadow p-6">
      <header class="mb-4">
        <div class="mb-2">${statusBadge(m.research_status || "stub")}</div>
        <h2 class="text-2xl font-bold">${escapeHtml(m.name)}</h2>
        <div class="text-sm text-slate-500 mt-1">
          ${escapeHtml(m.county || "")} County · ${escapeHtml(typeLabel(m.type))}
        </div>
      </header>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div class="font-semibold text-amber-900 mb-1">Data coming soon</div>
        <p class="text-sm text-amber-900/90">
          Fence code data for ${escapeHtml(m.name)} is not yet verified.
          Call the permit office or visit the municipality's website before
          quoting setbacks, heights, or fees.
        </p>
      </div>
    </article>
  `;
}

function renderFull(m) {
  const mobile = isMobile();
  const ord = m.ordinance || {};
  const lv = ord.last_verified || m.last_verified;

  // Build section list; skip sections where we'd have nothing to say.
  const specs = [
    { title: "Height limits",           icon: "📏", body: renderHeight(m.height),       defaultOpen: true },
    { title: "Setback",                  icon: "↔",  body: renderSetback(m.setback),     defaultOpen: true },
    { title: "Permit",                   icon: "📝", body: renderPermit(m.permit),       defaultOpen: !mobile },
    { title: "Corner lot / visibility",  icon: "⊿",  body: renderCornerLot(m.corner_lot), defaultOpen: !mobile },
    { title: "Pool / barrier",           icon: "🏊", body: renderPool(m.pool_barrier),   defaultOpen: !mobile },
    { title: "Materials",                icon: "🪵", body: renderMaterials(m.materials), defaultOpen: !mobile },
  ].filter((s) => s.body != null);

  const sections = specs.map(sectionWrap).join("");

  return `
    <article class="bg-white rounded-xl shadow p-6">
      <header class="mb-2">
        <div class="flex flex-wrap items-center gap-2">
          ${statusBadge(m.research_status)}
          ${lv ? `<span class="text-xs text-slate-500">Verified ${escapeHtml(lv)}</span>` : ""}
        </div>
        <h2 class="text-2xl font-bold mt-2">${escapeHtml(m.name)}</h2>
        <div class="text-sm text-slate-500 mt-1">
          ${escapeHtml(m.county || "")} County · ${escapeHtml(typeLabel(m.type))}
        </div>
      </header>

      ${sections}

      ${renderPermitOffice(m.permit_office)}
      ${renderSources(m.sources)}

      ${ord.url ? `
        <a href="${escapeHtml(ord.url)}" target="_blank" rel="noopener noreferrer"
           class="mt-5 inline-flex items-center justify-center w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-xl">
          Open full ordinance →
        </a>` : ""}
    </article>
  `;
}

function renderMunicipality(m) {
  if (!m) return "";
  const isStub = m.research_status === "stub" || !m.height;
  return isStub ? renderStub(m) : renderFull(m);
}

// ---------- controllers ----------

function showResults(munis) {
  const root = document.getElementById("results");
  if (!munis || munis.length === 0) {
    root.innerHTML = "";
    return;
  }
  currentMunis = munis;
  if (munis.length === 1) {
    root.innerHTML = renderMunicipality(munis[0]);
    return;
  }
  root.innerHTML = renderPicker(munis);
  root.querySelectorAll(".muni-picker").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.dataset.slug;
      const m = DATA.municipalities[slug];
      root.innerHTML = `
        <button id="back-btn" type="button" class="mb-4 inline-flex items-center gap-1 text-sm text-emerald-700 font-semibold">
          <span aria-hidden="true">←</span><span>Back to list</span>
        </button>
        ${renderMunicipality(m)}
      `;
      document.getElementById("back-btn").addEventListener("click", () => {
        showResults(currentMunis);
      });
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    });
  });
}

function handleZip(zip) {
  const root = document.getElementById("results");
  if (!zip || zip.length !== 5) {
    root.innerHTML = "";
    return;
  }
  const munis = lookupZip(zip, DATA);
  if (!munis) {
    root.innerHTML = renderNotFound(zip);
    return;
  }
  showResults(munis);
}

function openCoverageModal() {
  const modal = document.getElementById("coverage-modal");
  const listEl = document.getElementById("coverage-list");
  const zips = Object.keys(DATA.zip_map).sort();
  listEl.innerHTML = `
    <p class="text-xs text-slate-500 mb-3">${zips.length} ZIPs covered. Tap one to look it up.</p>
    <div class="grid grid-cols-3 gap-2">
      ${zips
        .map(
          (z) =>
            `<button type="button" data-zip="${escapeHtml(z)}"
               class="coverage-zip bg-slate-100 hover:bg-emerald-100 active:bg-emerald-200 py-3 px-3 rounded-lg font-semibold text-slate-900">
               ${escapeHtml(z)}
             </button>`
        )
        .join("")}
    </div>
  `;
  listEl.querySelectorAll(".coverage-zip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const zip = btn.dataset.zip;
      document.getElementById("zip-input").value = zip;
      closeCoverageModal();
      handleZip(zip);
      window.scrollTo({ top: 0 });
    });
  });
  modal.classList.remove("hidden");
}

function closeCoverageModal() {
  document.getElementById("coverage-modal").classList.add("hidden");
}

async function init() {
  try {
    DATA = await loadData();
  } catch (e) {
    document.getElementById("results").innerHTML = `
      <div class="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl">
        Failed to load fence code data. Refresh and try again.
      </div>`;
    console.error(e);
    return;
  }

  const meta = DATA._meta || {};
  document.getElementById("version").textContent = meta.version || "";
  document.getElementById("last-updated").textContent = meta.last_updated || "";

  const zipCount = Object.keys(DATA.zip_map).length;
  document.getElementById("coverage-summary-text").textContent =
    `${zipCount} ZIPs in Washtenaw, western Wayne, SE Livingston`;

  const input = document.getElementById("zip-input");
  input.addEventListener("input", (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
    if (raw !== e.target.value) e.target.value = raw;
    if (raw.length === 5) handleZip(raw);
    else if (raw.length === 0) document.getElementById("results").innerHTML = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const zip = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
      if (zip.length === 5) {
        input.blur();
        handleZip(zip);
      }
    }
  });

  document.getElementById("coverage-link").addEventListener("click", openCoverageModal);
  document.getElementById("coverage-close").addEventListener("click", closeCoverageModal);
  document.getElementById("coverage-modal").addEventListener("click", (e) => {
    if (e.target.id === "coverage-modal") closeCoverageModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCoverageModal();
  });
}

document.addEventListener("DOMContentLoaded", init);
