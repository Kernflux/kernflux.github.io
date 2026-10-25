// Search engines and AI assistants: per-page metadata (description,
// canonical, hreflang, Open Graph, JSON-LD), the sitemap's language
// alternates, and the plain-text copies AI tools read (llms.txt,
// llms-full.txt, and each page as .md next to its HTML).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HeadConfig, PageData, SiteConfig, TransformContext } from 'vitepress'

export const site = 'https://kernflux.github.io'
export const repo = 'https://github.com/Kernflux/opendsec'
const root = fileURLToPath(new URL('../', import.meta.url))

// ---- pages ----------------------------------------------------------------------

// 'index.md' -> '/', 'docs/index.md' -> '/docs/', 'docs/cli.md' -> '/docs/cli'
export const urlOf = (rel: string) => '/' + rel.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
// The other language's page: 'docs/cli.md' <-> 'en/docs/cli.md'
const twinOf = (rel: string) => rel.startsWith('en/') ? rel.slice(3) : 'en/' + rel
const isEn = (rel: string) => rel.startsWith('en/')
// Where a page's plain-text copy is served: '/docs/' -> '/docs/index.md'
const mdUrlOf = (rel: string) => '/' + rel

// The front matter's top-level `key: value` lines, which is all the pages use.
export function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/)
  const fm: Record<string, string> = {}
  for (const line of m ? m[1].split('\n') : []) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/)
    if (kv) fm[kv[1]] = kv[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return fm
}

const body = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
const read = (rel: string) => existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null
// A pointer page saying the page exists only in the other language
// (scripts/sync-docs.mjs): kept out of the index and of hreflang.
const isStub = (rel: string) => frontmatter(read(rel) ?? '').stub === 'true'
const hasTwin = (rel: string) => read(twinOf(rel)) !== null && !isStub(twinOf(rel)) && !isStub(rel)

function titleOf(md: string) {
  return frontmatter(md).title || md.match(/^# (.+)$/m)?.[1]?.trim() || 'OpenDsec'
}

// ---- descriptions ----------------------------------------------------------------

// Markdown inline syntax to plain text.
function plain(s: string) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Cuts at a sentence end (or else a clause end) before max characters.
function clip(s: string, max: number) {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const end = Math.max(...['。', '！', '？', '. ', '; '].map(p => cut.lastIndexOf(p)))
  if (end > max * 0.5) return cut.slice(0, end + 1).trim()
  const soft = Math.max(...['，', '、', '：', ', ', ' '].map(p => cut.lastIndexOf(p)))
  return cut.slice(0, soft > max * 0.5 ? soft : max).trim() + '…'
}

// A page's description when its front matter has none: its first paragraph
// of prose, about as long as a search result shows (~160 characters in
// English, ~80 in Chinese).
export function summarize(md: string, en: boolean) {
  const text = body(md).replace(/```[\s\S]*?```/g, '').replace(/^:::[\s\S]*?^:::$/gm, '')
  for (const block of text.split(/\n\s*\n/)) {
    const b = block.trim()
    if (!b || /^(#|<|\||!\[|>|-{3}|([-*+]|\d+\.)\s)/.test(b)) continue
    const p = plain(b)
    if (p.length >= (en ? 60 : 24)) return clip(p, en ? 160 : 80)
  }
  return ''
}

export function transformPageData(pageData: PageData) {
  if (pageData.frontmatter.description || pageData.frontmatter.layout === 'home') return
  const md = read(pageData.relativePath)
  const d = md && summarize(md, isEn(pageData.relativePath))
  if (d) pageData.description = d
}

// ---- head -------------------------------------------------------------------------

const org = { '@type': 'Organization', '@id': `${site}/#org`, name: 'Kernflux', url: `${site}/`, logo: `${site}/logo.svg`, sameAs: ['https://github.com/Kernflux'] }
const software = (description: string) => ({
  '@type': 'SoftwareSourceCode', '@id': `${site}/#software`, name: 'OpenDsec', description, url: `${site}/`,
  codeRepository: repo, license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  programmingLanguage: ['Go', 'Python'], runtimePlatform: 'Linux', author: { '@id': org['@id'] },
  keywords: 'sandbox, Firecracker, microVM, reinforcement learning, AI agents, code execution, E2B',
})

function jsonld(rel: string, fm: Record<string, any>, title: string, description: string, lastUpdated?: number) {
  const url = site + urlOf(rel)
  const lang = isEn(rel) ? 'en' : 'zh-CN'
  const image = `${site}/${isEn(rel) ? 'og.png' : 'og-zh.png'}`
  if (fm.layout === 'home') {
    return { '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', '@id': `${site}/#website`, url: `${site}/`, name: 'OpenDsec', inLanguage: ['zh-CN', 'en'], publisher: { '@id': org['@id'] } },
      org, software(description),
    ] }
  }
  const modified = lastUpdated ? new Date(lastUpdated).toISOString() : undefined
  if (/(^|\/)blog\/posts\//.test(rel)) {
    return { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: fm.title ?? title, description, url,
      mainEntityOfPage: url, image, inLanguage: lang, datePublished: fm.date ? new Date(fm.date).toISOString().slice(0, 10) : undefined,
      dateModified: modified, author: { '@type': 'Organization', name: fm.author ?? 'Kernflux', url: `${site}/` },
      publisher: { '@id': org['@id'] }, about: { '@id': `${site}/#software` } }
  }
  if (/(^|\/)docs\//.test(rel)) {
    const docs = isEn(rel) ? '/en/docs/' : '/docs/'
    const crumbs = [
      { name: 'OpenDsec', item: site + (isEn(rel) ? '/en/' : '/') },
      { name: isEn(rel) ? 'Docs' : '文档', item: site + docs },
    ]
    if (urlOf(rel) !== docs) crumbs.push({ name: title, item: url })
    return { '@context': 'https://schema.org', '@graph': [
      { '@type': 'TechArticle', headline: title, description, url, inLanguage: lang, image, dateModified: modified,
        publisher: { '@id': org['@id'] }, about: { '@id': `${site}/#software` } },
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })) },
    ] }
  }
  return null
}

export function transformHead(ctx: TransformContext): HeadConfig[] {
  const { pageData, title, description } = ctx
  const rel = pageData.relativePath
  if (!rel || pageData.isNotFound) return [['meta', { name: 'robots', content: 'noindex' }]]
  const url = site + urlOf(rel)
  const en = isEn(rel)
  const image = `${site}/${en ? 'og.png' : 'og-zh.png'}`
  const head: HeadConfig[] = []
  if (isStub(rel)) {
    // Points at the page in the other language: index that one instead.
    head.push(['meta', { name: 'robots', content: 'noindex, follow' }])
    head.push(['link', { rel: 'canonical', href: site + urlOf(twinOf(rel)) }])
  } else {
    head.push(['link', { rel: 'canonical', href: url }])
  }
  if (hasTwin(rel)) {
    const zhUrl = site + urlOf(en ? twinOf(rel) : rel), enUrl = site + urlOf(en ? rel : twinOf(rel))
    head.push(['link', { rel: 'alternate', hreflang: 'zh-CN', href: zhUrl }])
    head.push(['link', { rel: 'alternate', hreflang: 'en', href: enUrl }])
    head.push(['link', { rel: 'alternate', hreflang: 'x-default', href: enUrl }])
  }
  const article = /(^|\/)(docs|blog\/posts)\//.test(rel)
  head.push(
    ['meta', { property: 'og:type', content: article ? 'article' : 'website' }],
    ['meta', { property: 'og:site_name', content: 'OpenDsec' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: url }],
    ['meta', { property: 'og:locale', content: en ? 'en_US' : 'zh_CN' }],
    ['meta', { property: 'og:image', content: image }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: en ? 'OpenDsec: open-source sandboxes for RL rollouts and AI agents' : 'OpenDsec：开源的强化学习与 AI 智能体 sandbox' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: image }],
  )
  if (hasMarkdownCopy(rel)) {
    head.push(['link', { rel: 'alternate', type: 'text/markdown', href: site + mdUrlOf(rel) }])
  }
  const ld = jsonld(rel, pageData.frontmatter, pageData.title || title, description, pageData.lastUpdated)
  if (ld) head.push(['script', { type: 'application/ld+json' }, JSON.stringify(ld)])
  return head
}

// ---- sitemap ----------------------------------------------------------------------

// sitemap.url is '' for the home page, 'docs/' for an index, 'docs/cli'.
const relOfUrl = (u: string) => (u === '' || u.endsWith('/')) ? u + 'index.md' : u + '.md'

export function sitemapItems(items: { url: string, links?: { lang: string, url: string }[] }[]) {
  return items.filter(i => read(relOfUrl(i.url)) !== null && !isStub(relOfUrl(i.url))).map(i => {
    const rel = relOfUrl(i.url)
    // VitePress links every locale's page at the same path, pointer pages
    // included: only real translations are alternates.
    if (!hasTwin(rel)) return { ...i, links: undefined }
    const zh = isEn(rel) ? twinOf(rel) : rel, en = isEn(rel) ? rel : twinOf(rel)
    return { ...i, links: [
      { lang: 'zh-CN', url: site + urlOf(zh) },
      { lang: 'en', url: site + urlOf(en) },
      { lang: 'x-default', url: site + urlOf(en) },
    ] }
  })
}

// ---- llms.txt and the pages as Markdown -------------------------------------------

// Pages that are prose: not the home pages and blog indexes (layouts and
// Vue components), nor pointer pages.
function hasMarkdownCopy(rel: string) {
  const md = read(rel)
  if (!md || isStub(rel)) return false
  const fm = frontmatter(md)
  return fm.layout !== 'home' && !/<BlogIndex/.test(md)
}

// The docs in sidebar order, then the blog posts, newest first.
function sections(siteConfig: SiteConfig, en: boolean) {
  const locale = siteConfig.userConfig.locales?.[en ? 'en' : 'root']
  const prefix = en ? '/en/docs/' : '/docs/'
  const docs: string[] = []
  const walk = (items: any[]) => {
    for (const it of items) {
      if (it.link?.startsWith(prefix)) {
        const rel = relOfUrl(it.link.slice(1))
        if (!docs.includes(rel) && hasMarkdownCopy(rel)) docs.push(rel)
      }
      if (it.items) walk(it.items)
    }
  }
  walk((locale?.themeConfig?.sidebar as any)?.[prefix] ?? [])
  const dir = en ? 'en/blog/posts' : 'blog/posts'
  const posts = readdirSync(join(root, dir)).filter(f => f.endsWith('.md')).map(f => `${dir}/${f}`)
    .sort((a, b) => +new Date(frontmatter(read(b)!).date) - +new Date(frontmatter(read(a)!).date))
  return { docs, posts }
}

function entry(rel: string, en: boolean) {
  const md = read(rel)!
  const d = frontmatter(md).description || summarize(md, en)
  return `- [${titleOf(md)}](${site}${mdUrlOf(rel)})${d ? ': ' + d : ''}`
}

function full(rels: string[]) {
  return rels.map(rel => `<!-- ${site}${urlOf(rel)} -->\n\n${body(read(rel)!)}\n`).join('\n---\n\n')
}

export function llms(siteConfig: SiteConfig) {
  const out = siteConfig.outDir
  for (const rel of siteConfig.pages) {
    if (!hasMarkdownCopy(rel)) continue
    const file = join(out, mdUrlOf(rel))
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `<!-- ${site}${urlOf(rel)} -->\n\n${body(read(rel)!)}\n`)
  }

  const home = frontmatter(read('en/index.md')!)
  const features = [...read('en/index.md')!.matchAll(/- title: (.+)\n\s+details: (.+)/g)].map(m => `- ${m[1]}: ${m[2]}`)
  const en = sections(siteConfig, true), zh = sections(siteConfig, false)
  const txt = [
    '# OpenDsec',
    '',
    `> ${home.description}`,
    '',
    'OpenDsec is open source (AGPL-3.0) and implements the paper DeepSeek Elastic Compute (DSec), arXiv:2609.22978. It is an independent project, not affiliated with DeepSeek. Source code: ' + repo + '. Every page below is also served as Markdown at the linked .md URL; the documentation exists in English and Chinese.',
    '',
    'Highlights:',
    '',
    ...features,
    '',
    '## Docs',
    '',
    ...en.docs.map(r => entry(r, true)),
    '',
    '## Blog',
    '',
    ...en.posts.map(r => entry(r, true)),
    '',
    '## 中文文档 (Chinese docs)',
    '',
    ...zh.docs.map(r => entry(r, false)),
    '',
    '## Optional',
    '',
    `- [All English docs and posts in one file](${site}/llms-full.txt)`,
    `- [全部中文文档和博客（一个文件）](${site}/llms-full.zh.txt)`,
    `- [Source code and changelog](${repo})`,
    '',
  ].join('\n')
  writeFileSync(join(out, 'llms.txt'), txt)
  writeFileSync(join(out, 'llms-full.txt'), `# OpenDsec documentation (English)\n\n> ${home.description}\n\n` + full([...en.docs, ...en.posts]))
  writeFileSync(join(out, 'llms-full.zh.txt'), `# OpenDsec 文档（中文）\n\n> ${frontmatter(read('index.md')!).description}\n\n` + full([...zh.docs, ...zh.posts]))
}
