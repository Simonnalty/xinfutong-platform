<template>
  <div class="page" v-loading="loading">
    <div class="page-head"><div><h1>合规知识库</h1><div class="sub">查阅已复核的政策、办理指引与案例，沿来源链接核对原文</div></div></div>
    <div class="card card-pad" style="margin-bottom:18px"><div style="display:flex;gap:12px;flex-wrap:wrap"><el-input v-model="q" placeholder="搜索标题或正文" clearable style="max-width:360px" @keyup.enter="load"/><el-select v-model="category" style="width:150px" @change="load"><el-option label="全部分类" value=""/><el-option label="法规政策" value="policy"/><el-option label="办理指引" value="guide"/><el-option label="典型案例" value="case"/></el-select><el-button type="primary" @click="load">搜索</el-button></div></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false"/>
    <el-empty v-else-if="!items.length" description="暂无匹配的已复核内容，请调整搜索条件或等待运营维护"/>
    <article v-for="p in items" :key="p.id" class="card card-pad" style="margin-bottom:14px"><div class="spread"><h3>{{ p.title }}</h3><el-tag effect="plain">{{ {policy:'法规政策',guide:'办理指引',case:'典型案例'}[p.category] }}</el-tag></div><div class="muted tiny" style="margin:10px 0">来源：{{ p.issuer }} · 生效日期：{{ p.effective_at||'未指定' }} · 平台复核：{{ p.created_at }}</div><p style="white-space:pre-wrap;line-height:1.9">{{ p.body }}</p><a :href="p.source_url" target="_blank" rel="noopener noreferrer">查看来源原文 ↗</a></article>
    <div class="card card-pad"><h3>办理前先核对</h3><p class="muted">确认决定机关、失信类型和适用规则，再按官方入口准备与提交材料。对声称“包过”“内部渠道”的宣传保持警惕。平台材料和状态说明供核对使用，实际结果以有权机关、银行或招标方的审核为准。</p></div>
  </div>
</template>
<script setup>
import {onMounted,ref} from 'vue'
import {api} from '../api.js'
const q=ref(''),category=ref(''),items=ref([]),loading=ref(false),error=ref('')
async function load(){loading.value=true;try{items.value=(await api.kb({q:q.value,category:category.value})).items;error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
onMounted(load)
</script>
