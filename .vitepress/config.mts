import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createContentLoader, defineConfig, type SiteConfig } from 'vitepress'
import { Feed } from 'feed'

const site = 'https://kernflux.github.io'
const repo = 'https://github.com/Kernflux/opendsec'

// Docs synced from the product repository (scripts/sync-docs.mjs) are edited
// there. VitePress sends this function to the browser as source text, so it
// must not use variables from this module.
const edit = (pageData: { filePath: string, frontmatter: Record<string, any> }) => pageData.frontmatter.source
  ? `https://github.com/Kernflux/opendsec/edit/main/${pageData.frontmatter.source}`
  : `https://github.com/Kernflux/kernflux.github.io/edit/main/${pageData.filePath}`

// RSS for each blog language: /feed.xml (Chinese) and /en/feed.xml.
async function feeds(config: SiteConfig) {
  for (const [dir, lang, title, description] of [
    ['blog', 'zh-CN', 'OpenDsec 博客', 'OpenDsec 的发布说明、设计取舍和测试记录'],
    ['en/blog', 'en', 'OpenDsec blog', 'Release notes, design decisions and test reports from OpenDsec'],
  ]) {
    const posts = await createContentLoader(`${dir}/posts/*.md`, { excerpt: true, render: true }).load()
    posts.sort((a, b) => +new Date(b.frontmatter.date) - +new Date(a.frontmatter.date))
    const feed = new Feed({
      title, description, id: `${site}/${dir}/`, link: `${site}/${dir}/`, language: lang,
      copyright: '© 2026 Yibo Zhou · Kernflux', favicon: `${site}/logo.svg`,
    })
    for (const p of posts) {
      feed.addItem({
        title: p.frontmatter.title, id: `${site}${p.url}`, link: `${site}${p.url}`,
        description: p.frontmatter.description, content: p.html, date: new Date(p.frontmatter.date),
        author: [{ name: p.frontmatter.author }],
      })
    }
    const out = join(config.outDir, dir === 'blog' ? '' : 'en')
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'feed.xml'), feed.rss2())
  }
}

export default defineConfig({
  title: 'OpenDsec',
  description: 'Open-source sandbox infrastructure for agentic RL training',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['README.md', '_opendsec/**', 'scripts/**'],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'OpenDsec 博客', href: '/feed.xml' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'OpenDsec blog', href: '/en/feed.xml' }],
    ['meta', { property: 'og:title', content: 'OpenDsec' }],
    ['meta', { property: 'og:url', content: `${site}/` }],
    ['meta', { property: 'og:description', content: 'Open-source sandbox infrastructure for agentic RL training: Firecracker microVMs, containers, fork with memory, an E2B-compatible API.' }],
  ],
  buildEnd: feeds,
  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [{ icon: 'github', link: repo }],
    search: { provider: 'local' },
  },
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh-CN',
      description: '面向智能体强化学习训练的开源 sandbox 基础设施',
      themeConfig: {
        nav: [
          { text: '文档', link: '/docs/', activeMatch: '^/docs/' },
          { text: '博客', link: '/blog/', activeMatch: '^/blog/' },
          { text: '商业授权', link: '/docs/license' },
          { text: '更新日志', link: `${repo}/blob/main/CHANGELOG.md` },
        ],
        sidebar: {
          '/docs/': [
            {
              text: '入门',
              items: [
                { text: '文档首页', link: '/docs/' },
                { text: '快速开始', link: '/docs/quickstart' },
                { text: '部署方式', link: '/docs/deploy' },
                { text: '常见问题', link: '/docs/faq' },
              ],
            },
            {
              text: '使用',
              items: [
                { text: '接入指南', link: '/docs/user-guide' },
                { text: '从 E2B 迁移（英文）', link: '/en/docs/e2b' },
              ],
            },
            {
              text: '运维',
              items: [
                { text: '运维手册', link: '/docs/operations' },
                { text: '服务目标（SLO）', link: '/docs/slo' },
                { text: '版本与兼容（英文）', link: '/en/docs/versioning' },
              ],
            },
            {
              text: '原理',
              items: [
                { text: '组件实现', link: '/docs/components' },
                { text: '设计与实测（SPEC）', link: '/docs/spec' },
              ],
            },
            { text: '许可与商业授权', link: '/docs/license' },
          ],
        },
        editLink: { text: '在 GitHub 上编辑此页', pattern: edit },
        lastUpdated: { text: '最后更新' },
        outline: { label: '本页内容', level: [2, 3] },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '回到顶部',
        langMenuLabel: '切换语言',
        footer: {
          message: '基于论文 DeepSeek Elastic Compute (DSec)（arXiv:2609.22978）实现。本项目独立开发，与 DeepSeek 没有关系。',
          copyright: '© 2026 Yibo Zhou · Kernflux',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      description: 'Open-source sandbox infrastructure for agentic RL training',
      themeConfig: {
        nav: [
          { text: 'Docs', link: '/en/docs/', activeMatch: '^/en/docs/' },
          { text: 'Blog', link: '/en/blog/', activeMatch: '^/en/blog/' },
          { text: 'Commercial', link: '/en/docs/license' },
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
        ],
        sidebar: {
          '/en/docs/': [
            {
              text: 'Getting started',
              items: [
                { text: 'Overview', link: '/en/docs/' },
                { text: 'Get started', link: '/en/docs/quickstart' },
                { text: 'Deployment', link: '/en/docs/deploy' },
                { text: 'FAQ', link: '/en/docs/faq' },
              ],
            },
            {
              text: 'Using it',
              items: [
                { text: 'Migrating from E2B', link: '/en/docs/e2b' },
                { text: 'Caller guide (Chinese)', link: '/docs/user-guide' },
              ],
            },
            {
              text: 'Operations',
              items: [
                { text: 'Versioning', link: '/en/docs/versioning' },
                { text: 'Operations manual (Chinese)', link: '/docs/operations' },
                { text: 'SLO (Chinese)', link: '/docs/slo' },
              ],
            },
            {
              text: 'Internals',
              items: [
                { text: 'Components (Chinese)', link: '/docs/components' },
                { text: 'Design and measurements (Chinese)', link: '/docs/spec' },
              ],
            },
            { text: 'License and commercial use', link: '/en/docs/license' },
          ],
        },
        editLink: { text: 'Edit this page on GitHub', pattern: edit },
        footer: {
          message: 'Implements the paper DeepSeek Elastic Compute (DSec) (arXiv:2609.22978). An independent project, not affiliated with DeepSeek.',
          copyright: '© 2026 Yibo Zhou · Kernflux',
        },
      },
    },
  },
})
