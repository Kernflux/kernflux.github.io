// Copies the reference docs from a checkout of Kernflux/opendsec into this
// site, so they are written once (in the product repository) and published
// here on every build. Usage: node scripts/sync-docs.mjs [opendsec checkout]
//
// Chinese docs are docs/<NAME>.md there and /docs/<page> here; English docs
// are docs/en/<NAME>.md there and /en/docs/<page> here. A page that exists in
// one language only gets a short pointer page in the other, because the
// language switcher links to the same path in the other language.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

const src = process.argv[2] || '_opendsec'
const repo = 'https://github.com/Kernflux/opendsec'

// site page -> [Chinese source, English source] in the repository
const docs = {
  'concepts': ['docs/CONCEPTS.md', 'docs/en/CONCEPTS.md'],
  'install': ['docs/INSTALL.md', 'docs/en/INSTALL.md'],
  'cluster': ['docs/CLUSTER.md', 'docs/en/CLUSTER.md'],
  'python-sdk': ['docs/PYTHON_SDK.md', 'docs/en/PYTHON_SDK.md'],
  'cli': ['docs/CLI.md', 'docs/en/CLI.md'],
  'images': ['docs/IMAGES.md', 'docs/en/IMAGES.md'],
  'network': ['docs/NETWORK.md', 'docs/en/NETWORK.md'],
  'iam': ['docs/IAM.md', 'docs/en/IAM.md'],
  'configuration': ['docs/CONFIGURATION.md', 'docs/en/CONFIGURATION.md'],
  'monitoring': ['docs/MONITORING.md', 'docs/en/MONITORING.md'],
  'troubleshooting': ['docs/TROUBLESHOOTING.md', 'docs/en/TROUBLESHOOTING.md'],
  'security': ['docs/SECURITY_MODEL.md', 'docs/en/SECURITY_MODEL.md'],
  'user-guide': ['docs/USER_GUIDE.md', 'docs/en/USER_GUIDE.md'],
  'operations': ['docs/OPERATIONS.md', 'docs/en/OPERATIONS.md'],
  'slo': ['docs/SLO.md', 'docs/en/SLO.md'],
  'components': ['docs/COMPONENTS.md', 'docs/en/COMPONENTS.md'],
  'spec': ['docs/SPEC.md', null],
  'e2b': ['docs/E2B.md', 'docs/en/E2B.md'],
  'versioning': ['docs/VERSIONING.md', 'docs/en/VERSIONING.md'],
}

// repository path -> site path, for rewriting links
const pages = {}
for (const [page, [zh, en]] of Object.entries(docs)) {
  if (zh) pages[zh] = '/docs/' + page
  if (en) pages[en] = '/en/docs/' + page
}

// Rewrites a relative link found in repository file `from`.
function link(from, target) {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target
  const [path, hash] = target.split('#')
  const resolved = posix.normalize(posix.join(posix.dirname(from), path))
  const anchor = hash ? '#' + hash : ''
  if (pages[resolved]) return pages[resolved] + anchor
  return `${repo}/blob/main/${resolved}${anchor}`
}

// stub: the page exists only in the other language, and this one points
// there (kept out of search indexes and hreflang, .vitepress/seo.ts).
// description: for pages whose first paragraph does not summarize them.
// lastUpdated: the source's last commit there (this repository has no
// history for synced files), for the page, the sitemap and JSON-LD.
function write(file, source, body, stub = false, description = '') {
  mkdirSync(dirname(file), { recursive: true })
  const fm = `source: ${source}\n` + (stub ? 'stub: true\n' : '') + (description ? `description: ${JSON.stringify(description)}\n` : '') +
    (committed(source) ? `lastUpdated: ${committed(source)}\n` : '')
  writeFileSync(file, `---\n${fm}---\n\n` + body)
}

function committed(path) {
  try {
    return execFileSync('git', ['-C', src, 'log', '-1', '--format=%cI', '--', path], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const descriptions = {
  'docs/spec.md': 'OpenDsec 的设计规划和实测记录：各组件的设计、microVM 与容器后端、fork 与快照、规模测试和生产验证的数据。',
}

function load(from) {
  const md = readFileSync(join(src, from), 'utf8')
  return md.replace(/\]\(([^)\s]+)\)/g, (_, t) => `](${link(from, t)})`)
}

const title = (md, page) => md.match(/^# (.+)$/m)?.[1] ?? page

for (const [page, [zh, en]] of Object.entries(docs)) {
  const zhFile = `docs/${page}.md`, enFile = `en/docs/${page}.md`
  const zhMd = zh && existsSync(join(src, zh)) ? load(zh) : null
  const enMd = en && existsSync(join(src, en)) ? load(en) : null
  if (!zhMd && !enMd) throw new Error(`${page}: no source in ${src}`)
  if (zhMd) write(zhFile, zh, zhMd, false, descriptions[zhFile])
  else write(zhFile, en, `# ${title(enMd, page)}\n\n这一页只有英文版：[${title(enMd, page)}](/en/docs/${page})\n`, true)
  if (enMd) write(enFile, en, enMd, false, descriptions[enFile])
  else write(enFile, zh, `# ${title(zhMd, page)}\n\nThis page is only available in Chinese: [${title(zhMd, page)}](/docs/${page})\n`, true)
  console.log(`${page}: ${zhMd ? zh : 'stub'} | ${enMd ? en : 'stub'}`)
}
