<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

// Moving E2B code over: three environment variables, nothing else
// (docs/E2B.md); times are the measured ones on the home page.
const { lang } = useData()
const zh = computed(() => lang.value.startsWith('zh'))
</script>

<template>
  <figure class="hero-code">
    <figcaption>{{ zh ? '已有的 E2B 代码，只换三个环境变量' : 'Existing E2B code; only three variables change' }}</figcaption>
<pre><code><span class="c">$</span> export E2B_API_URL=https://sandbox.internal:7400
<span class="c">$</span> export E2B_SANDBOX_URL=https://sandbox.internal:7400
<span class="c">$</span> export E2B_API_KEY=dsk.…

<span class="k">from</span> e2b_code_interpreter <span class="k">import</span> Sandbox

sbx = Sandbox.create(<span class="s">"code-interpreter-v1"</span>)  <span class="c"># 280 ms</span>
sbx.run_code(<span class="s">"6 * 7"</span>).text                   <span class="c"># 42, 45 ms</span></code></pre>
  </figure>
</template>

<style scoped>
.hero-code {
  width: 100%;
  max-width: 520px;
  margin: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-alt);
  overflow: hidden;
}
figcaption {
  padding: 8px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 13px;
}
pre { margin: 0; padding: 14px; overflow-x: auto; }
code { font-family: var(--vp-font-family-mono); font-size: 12.5px; line-height: 1.7; color: var(--vp-c-text-1); }
.c { color: var(--vp-c-text-3); }
.k { color: var(--vp-c-brand-1); }
.s { color: var(--vp-c-text-2); }
</style>
