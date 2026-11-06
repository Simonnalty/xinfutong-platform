<template>
  <div class="page knowledge-page" v-loading="loading">
    <div class="page-head"><div><div class="library-caption">信用服务 / 法规与指引</div><h1>合规知识库</h1><div class="sub">查阅已复核的政策、办理指引与案例，沿来源链接核对原文</div></div><span class="muted tiny">本次检索 {{ items.length }} 篇</span></div>
    <div class="library-toolbar">
      <el-input v-model="q" aria-label="搜索标题或正文" placeholder="搜索标题或正文" clearable @keyup.enter="load" />
      <el-select v-model="category" aria-label="内容分类" @change="load"><el-option label="全部分类" value=""/><el-option label="法规政策" value="policy"/><el-option label="办理指引" value="guide"/><el-option label="典型案例" value="case"/></el-select>
      <el-button type="primary" @click="load">搜索</el-button>
    </div>
    <div class="library-layout">
      <section class="library-results" aria-label="检索结果">
        <el-alert v-if="error" :title="error" type="error" :closable="false"/>
        <el-empty v-else-if="!items.length" description="暂无匹配的已复核内容，请调整搜索条件或等待运营维护"/>
        <article v-for="p in items" :key="p.id" class="library-article">
          <div class="article-heading"><span class="library-symbol"><el-icon :size="24"><Document /></el-icon></span><div><span class="article-category">{{ categories[p.category] }}</span><h2>{{ p.title }}</h2></div></div>
          <div class="article-meta">来源：{{ p.issuer }}<br />生效日期：{{ date(p.effective_at) }} · 平台复核：{{ date(p.created_at) }}</div>
          <p class="article-body">{{ p.body }}</p>
          <a :href="p.source_url" target="_blank" rel="noopener noreferrer">查看来源原文 ↗</a>
        </article>
      </section>
      <aside class="library-note"><span class="library-caption">查阅说明</span><h2>办理前，先核对。</h2><p>确认决定机关、失信类型和适用规则，再按官方入口准备与提交材料。</p><p>对声称“包过”“内部渠道”的宣传保持警惕。</p><div class="note-divider"></div><p>平台材料和状态说明供核对使用，实际结果以有权机关、银行或招标方的审核为准。</p></aside>
    </div>
  </div>
</template>
<script setup>
import {onMounted,ref} from 'vue'
import {api} from '../api.js'
const q=ref(''),category=ref(''),items=ref([]),loading=ref(false),error=ref('')
const categories={policy:'法规政策',guide:'办理指引',case:'典型案例'}
const date=value=>value?String(value).slice(0,10):'未指定'
async function load(){loading.value=true;try{items.value=(await api.kb({q:q.value,category:category.value})).items;error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load)
</script>
<style scoped>
.library-caption { font-size: 12px; color: var(--muted); letter-spacing: 1px; margin-bottom: 8px; }
.library-toolbar { display: flex; flex-wrap: wrap; gap: 10px; padding: 18px 0; border-block: 1px solid var(--line); margin: 24px 0 28px; }
.library-toolbar .el-input { max-width: 420px; }
.library-toolbar .el-select { width: 150px; }
.library-layout { display: grid; grid-template-columns: minmax(0,1fr) 245px; gap: 42px; align-items: start; }
.library-results { min-width: 0; }
.library-article { padding: 0 0 30px; margin-bottom: 30px; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
.article-heading { display: flex; align-items: flex-start; gap: 16px; }
.library-symbol { width: 40px; height: 50px; border: 1px solid var(--line); background: #edf1e8; display: grid; place-items: center; flex-shrink: 0; color: var(--teal); }
.article-category { font-size: 12px; color: var(--teal); }
h2 { font: 600 22px/1.6 var(--serif); margin: 4px 0 12px; }
.article-meta { font-size: 12px; color: var(--muted); line-height: 1.9; margin-top: 12px; }
.article-body { font-size: 15px; line-height: 2; white-space: pre-wrap; margin: 18px 0; }
.library-article > a { font-size: 14px; text-decoration: underline; text-underline-offset: 5px; }
.library-note { padding: 24px 20px; background: #eef1e7; border-top: 2px solid var(--teal); font-size: 14px; line-height: 1.9; }
.library-note p { color: var(--muted); }
.note-divider { border-top: 1px solid var(--line); margin: 20px 0; }
@media(max-width:980px) { .library-layout { grid-template-columns: minmax(0,1fr); gap: 24px; } .library-note { padding: 20px; } }
@media(max-width:680px) { .library-toolbar .el-input { max-width: none; width: 100%; } .library-toolbar .el-select { flex: 1; } h2 { font-size: 20px; } .article-body { font-size: 15px; } }
</style>
