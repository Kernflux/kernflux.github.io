# kernflux.github.io

Source of https://kernflux.github.io/, the website of [OpenDsec](https://github.com/Kernflux/opendsec). Built with [VitePress](https://vitepress.dev); pushing to `main` publishes it through `.github/workflows/deploy.yml`, which also rebuilds daily.

```sh
npm ci
git clone --depth 1 https://github.com/Kernflux/opendsec _opendsec
npm run sync      # copy the reference docs from _opendsec
npm run dev       # http://localhost:5173
npm run build     # output in .vitepress/dist
```

- Chinese at the root, English under `en/`.
- `docs/`: the site's own pages (quick start, deployment, FAQ, license). The reference docs (`user-guide`, `operations`, `spec`, …) are written in the opendsec repository and copied in by `scripts/sync-docs.mjs`; edit them there.
- `blog/posts/` and `en/blog/posts/`: one Markdown file per post, with `title`, `date`, `author` and `description` in the front matter. The list pages and the RSS feeds (`/feed.xml`, `/en/feed.xml`) pick them up automatically.
- Navigation, sidebars and footer: `.vitepress/config.mts`. Brand colours: `.vitepress/theme/custom.css`.
