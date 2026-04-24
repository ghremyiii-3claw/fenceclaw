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

// ---------- launch state ----------

function renderLaunch() {
  const muniEntries = Object.values(DATA.municipalities);
  const verified = muniEntries.filter((m) => m.research_status === "verified");
  const stubCount = muniEntries.length - verified.length;
  const zipCount = Object.keys(DATA.zip_map).length;
  // Normalise "Wayne/Oakland" → "Wayne" + "Oakland" for the county count.
  const counties = new Set();
  muniEntries.forEach((m) => {
    if (!m.county) return;
    m.county.split("/").forEach((c) => counties.add(c.trim()));
  });

  const verifiedList = verified
    .map(
      (m) => `
        <button type="button" data-slug="${escapeHtml(m.slug)}"
                class="launch-muni w-full text-left bg-white rounded-xl ring-1 ring-slate-200 p-4 hover:ring-emerald-400 hover:shadow-sm active:bg-slate-50 transition flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-bold text-slate-900 truncate">${escapeHtml(m.name)}</div>
            <div class="text-xs text-slate-500 mt-0.5">
              ${escapeHtml(m.county || "")} County · ${escapeHtml(typeLabel(m.type))}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            ${statusBadge("verified")}
            <span class="text-slate-400 text-lg" aria-hidden="true">→</span>
          </div>
        </button>
      `
    )
    .join("");

  const tile = (value, label) => `
    <div class="bg-white rounded-xl p-4 ring-1 ring-slate-200 text-center">
      <div class="text-3xl font-bold text-slate-900 tabular-nums">${escapeHtml(value)}</div>
      <div class="text-[10px] sm:text-xs uppercase tracking-widest text-slate-500 mt-1 font-semibold">${escapeHtml(label)}</div>
    </div>
  `;

  return `
    <section class="relative overflow-hidden bg-gradient-to-br from-white to-emerald-50 rounded-2xl ring-1 ring-slate-200 shadow-sm p-8 sm:p-10 mb-6">
      <svg viewBox="0 0 120 80" aria-hidden="true" class="absolute -right-4 -bottom-4 w-48 h-32 text-emerald-600/10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 30 L14 24 L18 30 L18 70 L10 70 Z" fill="currentColor" />
        <path d="M28 26 L32 20 L36 26 L36 70 L28 70 Z" fill="currentColor" />
        <path d="M46 30 L50 24 L54 30 L54 70 L46 70 Z" fill="currentColor" />
        <path d="M64 26 L68 20 L72 26 L72 70 L64 70 Z" fill="currentColor" />
        <path d="M82 30 L86 24 L90 30 L90 70 L82 70 Z" fill="currentColor" />
        <path d="M100 26 L104 20 L108 26 L108 70 L100 70 Z" fill="currentColor" />
        <rect x="6" y="42" width="108" height="4" fill="currentColor" />
      </svg>
      <div class="relative">
        <div class="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-3">Fence code reference</div>
        <h1 class="text-3xl sm:text-4xl font-bold text-slate-900 leading-[1.1] tracking-tight">
          Every code.<br/>Every ZIP.<br/>One tap.
        </h1>
        <p class="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed max-w-md">
          Heights, setbacks, permit fees, and the office to call — for every municipality in your service area.
        </p>
        <div class="mt-6 inline-flex items-center gap-2 text-sm text-slate-500">
          <span class="text-emerald-600" aria-hidden="true">↑</span>
          <span>Type a ZIP above, or pick a municipality below.</span>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-3 gap-2 sm:gap-3 mb-8">
      ${tile(zipCount, "ZIPs")}
      ${tile(muniEntries.length, "Munis")}
      ${tile(counties.size, "Counties")}
    </section>

    ${verified.length ? `
    <section class="mb-8">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xs font-semibold uppercase tracking-widest text-slate-500">Verified · ready now</h2>
        <span class="text-xs text-slate-400">${verified.length} of ${muniEntries.length}</span>
      </div>
      <div class="space-y-2">${verifiedList}</div>
    </section>
    ` : ""}

    ${stubCount > 0 ? `
    <section class="mb-4">
      <div class="bg-white rounded-xl ring-1 ring-slate-200 p-5">
        <div class="flex items-start gap-3">
          <div class="shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-lg" aria-hidden="true">◷</div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-900">${stubCount} more municipalities pending</div>
            <p class="text-sm text-slate-600 mt-1">
              Coverage area is mapped; full fence codes are being verified one municipality at a time. Tap any ZIP below to see what's covered.
            </p>
            <button id="launch-browse" type="button" class="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
              Browse all ZIPs <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </section>
    ` : ""}
  `;
}

function showLaunch() {
  const root = document.getElementById("results");
  root.innerHTML = renderLaunch();
  currentMunis = null;
  root.querySelectorAll(".launch-muni").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slug = btn.dataset.slug;
      const m = DATA.municipalities[slug];
      root.innerHTML = `
        <button id="home-btn" type="button" class="mb-4 inline-flex items-center gap-1 text-sm text-emerald-700 font-semibold">
          <span aria-hidden="true">←</span><span>Home</span>
        </button>
        ${renderMunicipality(m)}
      `;
      document.getElementById("home-btn").addEventListener("click", () => {
        document.getElementById("zip-input").value = "";
        showLaunch();
      });
      window.scrollTo({ top: 0 });
    });
  });
  const browseBtn = document.getElementById("launch-browse");
  if (browseBtn) browseBtn.addEventListener("click", openCoverageModal);
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
    showLaunch();
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
    else if (raw.length === 0) showLaunch();
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

  // Render the home view now that data is loaded.
  showLaunch();

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
