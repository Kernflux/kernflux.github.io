import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import HeroTrace from './HeroTrace.vue'
import BlogIndex from './BlogIndex.vue'
import PostMeta from './PostMeta.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: () => h(DefaultTheme.Layout, null, {
    'home-hero-image': () => h(HeroTrace),
    'doc-before': () => h(PostMeta),
  }),
  enhanceApp({ app }) {
    app.component('BlogIndex', BlogIndex)
  },
} satisfies Theme
