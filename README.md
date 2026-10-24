# kernflux.github.io

Source of https://kernflux.github.io/, the homepage of [OpenDsec](https://github.com/Kernflux/opendsec). Built with [VitePress](https://vitepress.dev); pushing to `main` publishes it through `.github/workflows/deploy.yml`.

```sh
npm ci
npm run dev       # http://localhost:5173
npm run build     # output in .vitepress/dist
```

Pages: Chinese at the root (`index.md`, `guide/`), English under `en/`. Navigation and footer are in `.vitepress/config.mts`; brand colours in `.vitepress/theme/custom.css`.
