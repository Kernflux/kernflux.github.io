<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

// Date and author above a blog post, with a link back to the list.
const { frontmatter, lang, page } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
const isPost = computed(() => /(^|\/)blog\/posts\//.test(page.value.relativePath) && frontmatter.value.date)
const day = computed(() => new Date(frontmatter.value.date).toLocaleDateString(zh.value ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
</script>

<template>
  <div v-if="isPost" class="meta">
    <a :href="withBase(zh ? '/blog/' : '/en/blog/')">{{ zh ? '← 博客' : '← Blog' }}</a>
    <span>{{ day }} · {{ frontmatter.author }}</span>
  </div>
</template>

<style scoped>
.meta { display: flex; flex-wrap: wrap; gap: 8px 16px; justify-content: space-between; margin-bottom: 24px; font-size: 14px; color: var(--vp-c-text-2); }
.meta a { color: var(--vp-c-brand-1); text-decoration: none; }
</style>
