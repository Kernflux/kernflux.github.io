// Copies the reference docs from a checkout of Kernflux/opendsec into this
// site, so they are written once (in the product repository) and published
// here on every build. Usage: node scripts/sync-docs.mjs [opendsec checkout]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'

const src = process.argv[2] || '_opendsec'
const repo = 'https://github.com/Kernflux/opendsec'

// repository path -> site page (without .md); the page file is <page>.md
export const pages = {
  'docs/CONCEPTS.md': '/docs/concepts',
  'docs/INSTALL.md': '/docs/install',
  'docs/CLUSTER.md': '/docs/cluster',
  'docs/PYTHON_SDK.md': '/docs/python-sdk',
  'docs/CLI.md': '/docs/cli',
  'docs/IMAGES.md': '/docs/images',
  'docs/NETWORK.md': '/docs/network',
  'docs/IAM.md': '/docs/iam',
  'docs/CONFIGURATION.md': '/docs/configuration',
  'docs/MONITORING.md': '/docs/monitoring',
  'docs/TROUBLESHOOTING.md': '/docs/troubleshooting',
  'docs/SECURITY_MODEL.md': '/docs/security',
  'docs/USER_GUIDE.md': '/docs/user-guide',
  'docs/OPERATIONS.md': '/docs/operations',
  'docs/SLO.md': '/docs/slo',
  'docs/COMPONENTS.md': '/docs/components',
  'docs/SPEC.md': '/docs/spec',
  'docs/E2B.md': '/en/docs/e2b',
  'docs/VERSIONING.md': '/en/docs/versioning',
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

for (const [from, page] of Object.entries(pages)) {
  let md = readFileSync(join(src, from), 'utf8')
  md = md.replace(/\]\(([^)\s]+)\)/g, (_, t) => `](${link(from, t)})`)
  const out = join(page.slice(1) + '.md')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `---\nsource: ${from}\n---\n\n` + md)
  console.log(`${from} -> ${out}`)

  // The language switcher links to the same path in the other language;
  // these docs exist in one language only, so leave a pointer there.
  const title = md.match(/^# (.+)$/m)?.[1] ?? page
  const en = page.startsWith('/en/')
  const other = en ? page.slice(3) : '/en' + page
  const stub = en
    ? `# ${title}\n\n这一页只有英文版：[${title}](${page})\n`
    : `# ${title}\n\nThis page is only available in Chinese: [${title}](${page})\n`
  mkdirSync(dirname(other.slice(1)), { recursive: true })
  writeFileSync(other.slice(1) + '.md', `---\nsource: ${from}\nsearch: false\n---\n\n` + stub)
}
