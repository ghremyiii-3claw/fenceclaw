# FenceClaw

Mobile-first fence-code reference for contractors working in Washtenaw, western Wayne, and southeast Livingston counties, Michigan. Type a ZIP, see every municipality that ZIP touches, and pull the numbers that matter on a job site: height limits, setback, permit requirements, corner-lot rules, pool-fence rules, material restrictions, and permit office contact info.

Pure static site — HTML + Tailwind (CDN) + vanilla JS. No build step, no backend, no login.

## Coverage

Currently 23 ZIPs across Washtenaw, western Wayne, and southeast Livingston counties, Michigan. The list is in [`public/municipalities.json`](public/municipalities.json) under `zip_map`.

Most entries are **stubs** (name + county only, `research_status: "stub"`) and render a "data coming soon" card so nobody quotes a fabricated setback. The City of Ann Arbor is the first **verified** entry with full height / setback / permit / office data.

## Run locally

```bash
python3 -m http.server 8000 --directory public
# open http://localhost:8000
```

## Update data

All data lives in [`public/municipalities.json`](public/municipalities.json):

1. Edit the JSON.
2. `git commit -am "update <muni> fence code"`
3. `git push` — the GitHub Actions workflow redeploys Cloudflare Pages in ~30 s.

## Add a municipality

1. Copy the `ann-arbor-city` entry under `municipalities` as a template.
2. Change `slug`, `name`, `type` (`city` / `township` / `village`), `county`, and fill in `height` / `setback` / `permit` / `corner_lot` / `pool_barrier` / `materials` / `permit_office`.
3. Add the slug to every ZIP that touches that municipality in `zip_map`.
4. Set `research_status: "verified"` once you've confirmed against the ordinance and fill in `sources` with the URLs you pulled from (critical for trust — the UI shows them).
5. Commit and push.

If you only have name + county and haven't done the research yet, write a minimal stub like `{ "slug": "...", "name": "...", "type": "township", "county": "...", "research_status": "stub" }`. The UI will handle it.

## Cloudflare Pages setup

The site auto-deploys via Cloudflare Pages' GitHub integration. Settings:

- **Production branch:** `main`
- **Framework preset:** None
- **Build command:** *(empty)*
- **Build output directory:** `public`

Every push to `main` triggers a deploy.

## Disclaimer

Fence codes change. Always verify with the municipality before permit application. FenceClaw is a reference tool, not legal advice.

## License

MIT — see [`LICENSE`](LICENSE).
