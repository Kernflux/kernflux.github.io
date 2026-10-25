import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createContentLoader, defineConfig, type SiteConfig } from 'vitepress'
import { Feed } from 'feed'
import { llms, repo, site, sitemapItems, transformHead, transformPageData } from './seo'

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
    // Google Search Console ownership of https://kernflux.github.io/
    ['meta', { name: 'google-site-verification', content: 'Wuz-gXvUEA5T-kL7cw0hJBFV9hOAURFTNQPaE-e4Es4' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'OpenDsec 博客', href: '/feed.xml' }],
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'OpenDsec blog', href: '/en/feed.xml' }],
  ],
  // Per-page description, canonical, hreflang, Open Graph and JSON-LD; the
  // sitemap with language alternates; llms.txt and Markdown copies (seo.ts).
  transformPageData,
  transformHead,
  sitemap: { hostname: site, transformItems: sitemapItems },
  async buildEnd(config) {
    await feeds(config)
    llms(config)
  },
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
                { text: '核心概念', link: '/docs/concepts' },
                { text: '常见问题', link: '/docs/faq' },
                { text: '与 E2B、Daytona、Modal 对比', link: '/docs/compare' },
              ],
            },
            {
              text: '部署',
              items: [
                { text: '部署方式', link: '/docs/deploy' },
                { text: '单机安装详解', link: '/docs/install' },
                { text: '多机集群部署', link: '/docs/cluster' },
              ],
            },
            {
              text: '使用',
              items: [
                { text: '接入指南', link: '/docs/user-guide' },
                { text: 'Python SDK 参考', link: '/docs/python-sdk' },
                { text: '命令行参考', link: '/docs/cli' },
                { text: '镜像与快照', link: '/docs/images' },
                { text: '网络策略', link: '/docs/network' },
                { text: '项目、身份与权限', link: '/docs/iam' },
                { text: '从 E2B 迁移', link: '/docs/e2b' },
              ],
            },
            {
              text: '运维',
              items: [
                { text: '集群配置参考', link: '/docs/configuration' },
                { text: '运维手册', link: '/docs/operations' },
                { text: '监控与告警', link: '/docs/monitoring' },
                { text: '故障排查', link: '/docs/troubleshooting' },
                { text: '安全模型', link: '/docs/security' },
                { text: '服务目标（SLO）', link: '/docs/slo' },
                { text: '版本与兼容', link: '/docs/versioning' },
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
                { text: 'Concepts', link: '/en/docs/concepts' },
                { text: 'FAQ', link: '/en/docs/faq' },
                { text: 'vs E2B, Daytona, Modal', link: '/en/docs/compare' },
              ],
            },
            {
              text: 'Deployment',
              items: [
                { text: 'Deployment options', link: '/en/docs/deploy' },
                { text: 'Single-node install', link: '/en/docs/install' },
                { text: 'Cluster deployment', link: '/en/docs/cluster' },
              ],
            },
            {
              text: 'Using OpenDsec',
              items: [
                { text: 'Caller guide', link: '/en/docs/user-guide' },
                { text: 'Python SDK reference', link: '/en/docs/python-sdk' },
                { text: 'CLI reference', link: '/en/docs/cli' },
                { text: 'Images and snapshots', link: '/en/docs/images' },
                { text: 'Network policy', link: '/en/docs/network' },
                { text: 'Projects and permissions', link: '/en/docs/iam' },
                { text: 'Migrating from E2B', link: '/en/docs/e2b' },
              ],
            },
            {
              text: 'Operations',
              items: [
                { text: 'Configuration reference', link: '/en/docs/configuration' },
                { text: 'Operations manual', link: '/en/docs/operations' },
                { text: 'Monitoring and alerts', link: '/en/docs/monitoring' },
                { text: 'Troubleshooting', link: '/en/docs/troubleshooting' },
                { text: 'Security model', link: '/en/docs/security' },
                { text: 'Service levels (SLO)', link: '/en/docs/slo' },
                { text: 'Versioning', link: '/en/docs/versioning' },
              ],
            },
            {
              text: 'Internals',
              items: [
                { text: 'How the components work', link: '/en/docs/components' },
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
