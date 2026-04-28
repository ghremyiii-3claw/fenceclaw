// POST /api/save
// Auth: Authorization: Bearer <ADMIN_PASSWORD>
// Body: { municipality: { slug, name, ... } }
//
// Upserts the municipality into public/municipalities.json on GitHub via the
// Contents API. Cloudflare Pages' Git integration redeploys on the resulting
// commit, so saved data is live within ~30s of a successful response.
//
// GET /api/save with the same Bearer token returns 200 — used by the admin
// page to verify the password before showing the editor.

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_PASSWORD || auth !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return json({ error: "unauthorized" }, 401);
  }
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_PASSWORD || auth !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return json({ error: "unauthorized" }, 401);
  }

  if (!env.GITHUB_TOKEN) return json({ error: "server missing GITHUB_TOKEN" }, 500);

  const repo = env.GITHUB_REPO || "ghremyiii-3claw/fenceclaw";
  const branch = env.GITHUB_BRANCH || "main";
  const path = "public/municipalities.json";

  let body;
  try { body = await request.json(); } catch { return json({ error: "invalid json body" }, 400); }

  const muni = body && body.municipality;
  if (!muni || typeof muni !== "object") return json({ error: "missing municipality" }, 400);
  if (!muni.slug || !/^[a-z0-9-]+$/.test(muni.slug)) return json({ error: "slug must be lowercase letters, digits, dashes" }, 400);
  if (!muni.name) return json({ error: "name required" }, 400);

  const ghHeaders = {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fenceclaw-admin",
  };

  // Fetch current file
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const getRes = await fetch(getUrl, { headers: ghHeaders });
  if (!getRes.ok) {
    const t = await getRes.text();
    return json({ error: "github fetch failed", status: getRes.status, detail: t.slice(0, 400) }, 502);
  }
  const fileData = await getRes.json();
  const sha = fileData.sha;

  let data;
  try {
    data = JSON.parse(b64ToUtf8(fileData.content));
  } catch (e) {
    return json({ error: "current municipalities.json is invalid", detail: String(e) }, 500);
  }

  data.municipalities = data.municipalities || {};
  data.zip_map = data.zip_map || {};
  data._meta = data._meta || {};

  const isNew = !(muni.slug in data.municipalities);
  const previousZips = (data.municipalities[muni.slug] && data.municipalities[muni.slug].zips) || [];
  data.municipalities[muni.slug] = muni;

  // Update zip_map: add new ZIPs, remove this slug from ZIPs it no longer claims.
  const newZips = Array.isArray(muni.zips) ? muni.zips.filter((z) => /^\d{5}$/.test(z)) : [];
  for (const zip of newZips) {
    const list = data.zip_map[zip] || [];
    if (!list.includes(muni.slug)) list.push(muni.slug);
    data.zip_map[zip] = list;
  }
  for (const zip of previousZips) {
    if (newZips.includes(zip)) continue;
    const list = data.zip_map[zip] || [];
    const filtered = list.filter((s) => s !== muni.slug);
    if (filtered.length) data.zip_map[zip] = filtered;
    else delete data.zip_map[zip];
  }

  data._meta.last_updated = new Date().toISOString().slice(0, 10);

  const newContent = JSON.stringify(data, null, 2) + "\n";
  const putUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
  const message = `${isNew ? "Add" : "Update"} ${muni.slug} via admin`;

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { ...ghHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToB64(newContent),
      sha,
      branch,
    }),
  });

  if (!putRes.ok) {
    const t = await putRes.text();
    return json({ error: "github commit failed", status: putRes.status, detail: t.slice(0, 400) }, 502);
  }

  const result = await putRes.json();
  return json({ ok: true, slug: muni.slug, isNew, commit: result.commit && result.commit.sha });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function b64ToUtf8(b64) {
  const clean = b64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
