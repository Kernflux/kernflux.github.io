<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { data as posts } from './posts.data'

const { lang } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
const list = computed(() => posts.filter((p) => p.lang === (zh.value ? 'zh' : 'en')))
const day = (d: string) => new Date(d).toLocaleDateString(zh.value ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
</script>

<template>
  <ul class="posts">
    <li v-for="p in list" :key="p.url">
      <time :datetime="p.date">{{ day(p.date) }}</time>
      <a :href="withBase(p.url)" class="title">{{ p.title }}</a>
      <p>{{ p.description }}</p>
    </li>
  </ul>
</template>

<style scoped>
.posts { list-style: none; padding: 0; margin: 24px 0 0; }
.posts li { padding: 20px 0; border-top: 1px solid var(--vp-c-divider); margin: 0; }
.posts time { display: block; font-size: 14px; color: var(--vp-c-text-2); }
.posts .title { display: inline-block; margin-top: 4px; font-size: 20px; font-weight: 600; line-height: 1.4; text-decoration: none; color: var(--vp-c-text-1); }
.posts .title:hover { color: var(--vp-c-brand-1); }
.posts p { margin: 8px 0 0; color: var(--vp-c-text-2); line-height: 1.6; }
</style>
