import { defineConfig } from 'vitepress'

const repo = 'https://github.com/Kernflux/opendsec'

export default defineConfig({
  title: 'OpenDsec',
  description: 'Open-source sandbox infrastructure for agentic RL training',
  cleanUrls: true,
  srcExclude: ['README.md'],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:title', content: 'OpenDsec' }],
    ['meta', { property: 'og:url', content: 'https://kernflux.github.io/' }],
    ['meta', { property: 'og:description', content: 'Open-source sandbox infrastructure for agentic RL training: Firecracker microVMs, containers, fork with memory, an E2B-compatible API.' }],
  ],
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
          { text: '快速开始', link: '/guide/quickstart' },
          { text: '部署', link: '/guide/deploy' },
          { text: '常见问题', link: '/guide/faq' },
          { text: '许可', link: '/guide/license' },
          { text: '更新日志', link: `${repo}/blob/main/CHANGELOG.md` },
        ],
        sidebar: {
          '/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/guide/quickstart' },
                { text: '部署方式', link: '/guide/deploy' },
                { text: '常见问题', link: '/guide/faq' },
                { text: '许可与商业授权', link: '/guide/license' },
              ],
            },
            {
              text: '仓库文档',
              items: [
                { text: '设计与实测（SPEC）', link: `${repo}/blob/main/docs/SPEC.md` },
                { text: '运维手册', link: `${repo}/blob/main/docs/OPERATIONS.md` },
                { text: '从 E2B 迁移', link: `${repo}/blob/main/docs/E2B.md` },
              ],
            },
          ],
        },
        outline: { label: '本页内容' },
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
          { text: 'Get started', link: '/en/guide/quickstart' },
          { text: 'Deploy', link: '/en/guide/deploy' },
          { text: 'FAQ', link: '/en/guide/faq' },
          { text: 'License', link: '/en/guide/license' },
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Get started', link: '/en/guide/quickstart' },
                { text: 'Deployment', link: '/en/guide/deploy' },
                { text: 'FAQ', link: '/en/guide/faq' },
                { text: 'License and commercial use', link: '/en/guide/license' },
              ],
            },
            {
              text: 'Repository docs',
              items: [
                { text: 'Operations', link: `${repo}/blob/main/docs/OPERATIONS.md` },
                { text: 'Migrating from E2B', link: `${repo}/blob/main/docs/E2B.md` },
                { text: 'Design (SPEC, Chinese)', link: `${repo}/blob/main/docs/SPEC.md` },
              ],
            },
          ],
        },
        footer: {
          message: 'Implements the paper DeepSeek Elastic Compute (DSec) (arXiv:2609.22978). An independent project, not affiliated with DeepSeek.',
          copyright: '© 2026 Yibo Zhou · Kernflux',
        },
      },
    },
  },
})
