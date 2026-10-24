<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

// One microVM's life, with typical measured times (docs/SPEC.md).
const { lang } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
const rows = computed(() => zh.value
  ? [
      ['create', '冷启动到可执行命令', '~100 ms'],
      ['pause', '拍快照后结束进程，内存释放', ''],
      ['resume', '从快照恢复，进程原样继续', '~50 ms'],
      ['fork ×8', '连同内存复制，源 VM 只停顿', '~10 ms'],
      ['restore ×64', '同节点并发恢复，共享内存页', '~0.2 s'],
    ]
  : [
      ['create', 'cold boot to first command', '~100 ms'],
      ['pause', 'snapshot, then exit; memory freed', ''],
      ['resume', 'restore; processes carry on', '~50 ms'],
      ['fork ×8', 'copies with memory; source pauses', '~10 ms'],
      ['restore ×64', 'concurrent on one node, shared pages', '~0.2 s'],
    ])
</script>

<template>
  <div class="trace">
    <div class="bar">
      <span class="dot" /><span class="dot" /><span class="dot" />
      <span class="title">{{ zh ? '一个 microVM 的生命周期' : 'One microVM, start to fork' }}</span>
    </div>
    <table>
      <tr v-for="r in rows" :key="r[0]">
        <td class="op">{{ r[0] }}</td>
        <td class="what">{{ r[1] }}</td>
        <td class="t">{{ r[2] }}</td>
      </tr>
    </table>
    <div class="foot">{{ zh ? 'python:3.12 · 2 vCPU · 裸金属实测典型值' : 'python:3.12 · 2 vCPU · typical, measured on bare metal' }}</div>
  </div>
</template>

<style scoped>
.trace {
  width: 100%;
  max-width: 460px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
}
.bar { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--vp-c-divider); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--vp-c-default-3); }
.title { margin-left: 8px; color: var(--vp-c-text-2); font-family: var(--vp-font-family-base); }
table { width: 100%; border-collapse: collapse; margin: 0; display: table; }
td { padding: 10px 14px; border: 0; border-bottom: 1px dashed var(--vp-c-divider); vertical-align: baseline; }
tr:last-child td { border-bottom: 0; }
.op { color: var(--vp-c-text-1); white-space: nowrap; }
.what { color: var(--vp-c-text-2); font-family: var(--vp-font-family-base); }
.t { color: var(--vp-c-brand-1); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.foot { padding: 10px 14px; border-top: 1px solid var(--vp-c-divider); color: var(--vp-c-text-3); font-family: var(--vp-font-family-base); font-size: 12px; }
</style>
