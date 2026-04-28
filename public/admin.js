// FenceClaw admin — pick a municipality, edit, save → POST /api/save → git commit → auto-deploy.
// Password lives only in sessionStorage (cleared on tab close).

const PW_KEY = "fenceclaw_admin_pw";
const TYPE_VALUES = ["city", "charter_township", "general_law_township", "township", "village"];

let DATA = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

window.addEventListener("DOMContentLoaded", () => {
  const stored = sessionStorage.getItem(PW_KEY);
  if (stored) tryUnlock(stored);

  $("#auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = $("#auth-pw").value.trim();
    if (!pw) return;
    tryUnlock(pw);
  });

  $("#muni-form").addEventListener("submit", onSave);
  $("#btn-reset").addEventListener("click", () => populateForm(null));
  $("#btn-load").addEventListener("click", loadSelected);
  $("#muni-picker").addEventListener("change", loadSelected);

  // Auto-suggest slug from name when slug is empty.
  $("[name='name']").addEventListener("input", (e) => {
    const slugInput = $("[name='slug']");
    if (!slugInput.value || slugInput.dataset.auto === "1") {
      slugInput.value = slugify(e.target.value);
      slugInput.dataset.auto = "1";
    }
  });
  $("[name='slug']").addEventListener("input", (e) => {
    e.target.dataset.auto = "0";
  });
});

async function tryUnlock(pw) {
  try {
    const probe = await fetch("/api/save", {
      method: "GET",
      headers: { Authorization: `Bearer ${pw}` },
    });
    if (probe.status === 401) {
      sessionStorage.removeItem(PW_KEY);
      $("#auth-error").textContent = "Wrong password.";
      $("#auth-error").classList.remove("hidden");
      return;
    }
    if (!probe.ok) {
      $("#auth-error").textContent = `Server returned ${probe.status}. Is the admin endpoint deployed?`;
      $("#auth-error").classList.remove("hidden");
      return;
    }
    sessionStorage.setItem(PW_KEY, pw);
    $("#auth-error").classList.add("hidden");
    $("#auth-gate").classList.add("hidden");
    $("#editor").classList.remove("hidden");
    await loadData();
  } catch (err) {
    $("#auth-error").textContent = "Couldn't reach server: " + err.message;
    $("#auth-error").classList.remove("hidden");
  }
}

async function loadData() {
  // Fetch with cache-busting so a recent save shows immediately.
  const res = await fetch("municipalities.json?_=" + Date.now());
  DATA = await res.json();
  const picker = $("#muni-picker");
  picker.innerHTML = '<option value="__new__">+ New municipality</option>';
  const entries = Object.entries(DATA.municipalities || {})
    .sort(([, a], [, b]) => (a.name || "").localeCompare(b.name || ""));
  for (const [slug, m] of entries) {
    const opt = document.createElement("option");
    opt.value = slug;
    opt.textContent = `${m.name || slug}  [${m.research_status || "?"}]`;
    picker.appendChild(opt);
  }
}

function loadSelected() {
  const slug = $("#muni-picker").value;
  if (slug === "__new__") {
    populateForm(null);
    return;
  }
  populateForm(DATA.municipalities[slug]);
}

function populateForm(m) {
  // Clear everything
  $$("#muni-form input, #muni-form select, #muni-form textarea").forEach((el) => {
    if (el.type === "checkbox") el.checked = false;
    else el.value = "";
  });
  $("[name='slug']").dataset.auto = "0";

  if (!m) {
    $("[name='research_status']").value = "pending";
    $("[name='type']").value = "city";
    setStatus("New municipality — fill in fields and Save.");
    return;
  }

  setField("slug", m.slug);
  setField("name", m.name);
  setField("type", TYPE_VALUES.includes(m.type) ? m.type : "city");
  setField("county", m.county);
  setField("zips", Array.isArray(m.zips) ? m.zips.join(", ") : "");
  setField("research_status", m.research_status || "pending");

  if (m.ordinance) {
    setField("ordinance.chapter", m.ordinance.chapter);
    setField("ordinance.title", m.ordinance.title);
    setField("ordinance.url", m.ordinance.url);
    setField("ordinance.last_verified", m.ordinance.last_verified);
  }

  for (const part of ["front", "side", "rear"]) {
    if (m.height && m.height[part]) {
      setField(`height.${part}.max_ft`, m.height[part].max_ft);
      setField(`height.${part}.notes`, m.height[part].notes);
    }
  }

  if (m.opacity) {
    setField("opacity.front_max_pct", m.opacity.front_max_pct);
    setField("opacity.middle_max_pct", m.opacity.middle_max_pct);
    setField("opacity.rear_max_pct", m.opacity.rear_max_pct);
    setField("opacity.notes", m.opacity.notes);
  }

  if (m.setback) {
    setField("setback.required", !!m.setback.required, true);
    setField("setback.distance_in", m.setback.distance_in);
    setField("setback.notes", m.setback.notes);
  }

  if (m.permit) {
    setField("permit.required_always", !!m.permit.required_always, true);
    setField("permit.required_over_ft", m.permit.required_over_ft);
    setField("permit.fee_usd", m.permit.fee_usd);
    setField("permit.notes", m.permit.notes);
  }

  if (m.corner_lot) {
    setField("corner_lot.has_rule", !!m.corner_lot.has_rule, true);
    setField("corner_lot.notes", m.corner_lot.notes);
  }

  if (m.pool_barrier) {
    setField("pool_barrier.has_rule", !!m.pool_barrier.has_rule, true);
    setField("pool_barrier.notes", m.pool_barrier.notes);
  }

  if (m.materials) {
    setField("materials.prohibited", Array.isArray(m.materials.prohibited) ? m.materials.prohibited.join("\n") : "");
    setField("materials.notes", m.materials.notes);
  }

  if (m.permit_office) {
    setField("permit_office.name", m.permit_office.name);
    setField("permit_office.address", m.permit_office.address);
    setField("permit_office.phone", m.permit_office.phone);
    setField("permit_office.email", m.permit_office.email);
    setField("permit_office.portal_url", m.permit_office.portal_url);
  }

  if (m.flags) {
    setField("flags.historic_district", !!m.flags.historic_district, true);
    setField("flags.floodplain_review", !!m.flags.floodplain_review, true);
    setField("flags.hoa_common", !!m.flags.hoa_common, true);
  }

  setField("sources", Array.isArray(m.sources) ? m.sources.join("\n") : "");
  setField("research_notes", m.research_notes);

  setStatus(`Loaded ${m.name || m.slug}.`);
}

function setField(name, val, isCheckbox = false) {
  const el = $(`[name='${name}']`);
  if (!el) return;
  if (isCheckbox) {
    el.checked = !!val;
  } else {
    el.value = val == null ? "" : val;
  }
}

function readForm() {
  const get = (name) => {
    const el = $(`[name='${name}']`);
    return el ? el.value.trim() : "";
  };
  const getNum = (name) => {
    const v = get(name);
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const getBool = (name) => {
    const el = $(`[name='${name}']`);
    return el ? !!el.checked : false;
  };
  const getList = (name) => {
    const v = get(name);
    if (!v) return [];
    return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  };
  const orNull = (s) => (s ? s : null);

  const m = {
    slug: get("slug"),
    name: get("name"),
    type: get("type"),
    county: get("county"),
    zips: getList("zips"),
    ordinance: {
      chapter: orNull(get("ordinance.chapter")),
      title: orNull(get("ordinance.title")),
      url: orNull(get("ordinance.url")),
      last_verified: orNull(get("ordinance.last_verified")),
    },
    height: {
      front: { max_ft: getNum("height.front.max_ft"), notes: orNull(get("height.front.notes")) },
      side: { max_ft: getNum("height.side.max_ft"), notes: orNull(get("height.side.notes")) },
      rear: { max_ft: getNum("height.rear.max_ft"), notes: orNull(get("height.rear.notes")) },
    },
    opacity: {
      front_max_pct: getNum("opacity.front_max_pct"),
      middle_max_pct: getNum("opacity.middle_max_pct"),
      rear_max_pct: getNum("opacity.rear_max_pct"),
      notes: orNull(get("opacity.notes")),
    },
    setback: {
      required: getBool("setback.required"),
      distance_in: getNum("setback.distance_in"),
      notes: orNull(get("setback.notes")),
    },
    permit: {
      required_always: getBool("permit.required_always"),
      required_over_ft: getNum("permit.required_over_ft"),
      fee_usd: getNum("permit.fee_usd"),
      notes: orNull(get("permit.notes")),
    },
    corner_lot: {
      has_rule: getBool("corner_lot.has_rule"),
      notes: orNull(get("corner_lot.notes")),
    },
    pool_barrier: {
      has_rule: getBool("pool_barrier.has_rule"),
      notes: orNull(get("pool_barrier.notes")),
    },
    materials: {
      prohibited: getList("materials.prohibited"),
      notes: orNull(get("materials.notes")),
    },
    permit_office: {
      name: orNull(get("permit_office.name")),
      address: orNull(get("permit_office.address")),
      phone: orNull(get("permit_office.phone")),
      email: orNull(get("permit_office.email")),
      portal_url: orNull(get("permit_office.portal_url")),
    },
    flags: {
      historic_district: getBool("flags.historic_district"),
      floodplain_review: getBool("flags.floodplain_review"),
      hoa_common: getBool("flags.hoa_common"),
    },
    sources: getList("sources"),
    research_notes: orNull(get("research_notes")),
    research_status: get("research_status") || "pending",
  };
  return m;
}

async function onSave(e) {
  e.preventDefault();
  const pw = sessionStorage.getItem(PW_KEY);
  if (!pw) { setStatus("Not signed in.", true); return; }

  const muni = readForm();
  if (!muni.slug) { setStatus("Slug is required.", true); return; }
  if (!muni.name) { setStatus("Name is required.", true); return; }

  const btn = $("#btn-save");
  btn.disabled = true;
  setStatus("Saving…");

  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${pw}` },
      body: JSON.stringify({ municipality: muni }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(`Save failed: ${result.error || res.status} — ${result.detail || ""}`, true);
      return;
    }
    setStatus(`Saved. Commit ${(result.commit || "").slice(0, 7)} — Cloudflare will redeploy in ~30s.`);
    await loadData();
    $("#muni-picker").value = muni.slug;
  } catch (err) {
    setStatus("Save failed: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function setStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.className = "text-sm flex-1 " + (isError ? "text-rose-700" : "text-slate-600");
}

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
