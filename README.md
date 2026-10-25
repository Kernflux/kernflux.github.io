# kernflux.github.io

Source of https://kernflux.github.io/, the website of [OpenDsec](https://github.com/Kernflux/opendsec). Built with [VitePress](https://vitepress.dev); pushing to `main` publishes it through `.github/workflows/deploy.yml`, which also rebuilds daily.

```sh
npm ci
git clone https://github.com/Kernflux/opendsec _opendsec   # full history: pages' "last updated"
npm run sync      # copy the reference docs from _opendsec
npm run dev       # http://localhost:5173
npm run build     # output in .vitepress/dist
```

- Chinese at the root, English under `en/`.
- `docs/`: the site's own pages (quick start, deployment, FAQ, license). The reference docs (`user-guide`, `operations`, `spec`, …) are written in the opendsec repository and copied in by `scripts/sync-docs.mjs`; edit them there.
- `blog/posts/` and `en/blog/posts/`: one Markdown file per post, with `title`, `date`, `author` and `description` in the front matter. The list pages and the RSS feeds (`/feed.xml`, `/en/feed.xml`) pick them up automatically.
- Navigation, sidebars and footer: `.vitepress/config.mts`. Brand colours: `.vitepress/theme/custom.css`.
- Search engines and AI assistants: `.vitepress/seo.ts` adds each page's description (its front matter's, else its first paragraph), canonical URL, hreflang, Open Graph tags and JSON-LD, the sitemap's language alternates, and at build time `llms.txt`, `llms-full.txt`, `llms-full.zh.txt` and a `.md` copy of every page. Give a page a `description` in its front matter when its first paragraph does not summarize it. `public/robots.txt` lets crawlers in.
- Link-preview images `public/og.png` and `public/og-zh.png`: `python3 scripts/og-card.py`.
