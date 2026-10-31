<template>
  <div>
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap">
      <el-button v-if="canWrite && !editing" size="small" @click="begin">编辑正文</el-button>
      <template v-if="editing">
        <el-button size="small" type="primary" :loading="busy" @click="save">保存草稿</el-button>
        <el-button size="small" @click="editing=false">取消编辑</el-button>
      </template>
      <el-button size="small" @click="history">版本历史</el-button>
      <el-button size="small" :disabled="editing" @click="download('word')">导出 Word</el-button>
    </div>
    <el-alert v-if="editing" title="点击正文修改；金色字段来自企业和事项档案。缺失事实请返回档案补齐，未完成内容会阻止导出。" type="info" :closable="false" style="margin-bottom:12px" />
    <div v-if="editing" ref="editor" class="paper editing-paper" contenteditable="true" aria-label="材料正文编辑器"></div>
    <div v-else class="paper" v-html="doc?.html"></div>
    <el-dialog v-model="showHistory" title="材料版本历史" width="min(620px,94vw)">
      <el-empty v-if="!versions.length" description="尚无保存的版本" />
      <div v-for="v in versions" :key="v.version" class="spread" style="padding:12px 0;border-bottom:1px solid var(--line)">
        <span>版本 {{ v.version }} · {{ sources[v.source] || v.source }} · {{ String(v.created_at).slice(0,19) }}</span>
        <el-button size="small" @click="historyHtml=v.html;historyPreview=true">查看</el-button>
        <el-button v-if="canWrite" size="small" :loading="busy" @click="restore(v.version)">恢复为新版本</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="historyPreview" title="历史正文（只读）" width="min(800px,94vw)"><div class="paper" v-html="historyHtml"></div></el-dialog>
  </div>
</template>
<script setup>
import {ref,nextTick,watch,computed} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const props=defineProps({caseId:String,enterpriseId:Number,doc:Object})
const emit=defineEmits(['saved'])
const editing=ref(false),busy=ref(false),editor=ref(null),showHistory=ref(false),versions=ref([])
const historyHtml=ref(''),historyPreview=ref(false)
const sources={manual:'手工编辑',ai:'AI 润色',template:'恢复模板',restore:'恢复历史版本'}
const canWrite=computed(()=>{const e=store.enterprises.find(e=>e.id===props.enterpriseId);return store.user?.role==='admin'||e?.relation==='owner'||(e?.relation==='org'&&e?.perm==='write')})
watch(()=>props.doc?.key,()=>{editing.value=false})
async function begin(){editing.value=true;await nextTick();editor.value.innerHTML=props.doc?.html||'';editor.value.querySelectorAll('.lock').forEach(e=>e.contentEditable='false')}
async function save(){busy.value=true;try{const r=await api.saveDoc(props.caseId,props.doc.key,editor.value.innerHTML);emit('saved',r.docs);editing.value=false;ElMessage.success('草稿已保存，导出前需通过校验')}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
async function history(){try{versions.value=(await api.docVersions(props.caseId,props.doc.key)).items;showHistory.value=true}catch(e){ElMessage.error(e.message)}}
async function restore(version){try{await ElMessageBox.confirm('恢复会新增版本，并保留现有记录，继续？','恢复历史');busy.value=true;const r=await api.restoreDoc(props.caseId,props.doc.key,version);emit('saved',r.docs);editing.value=false;await history();ElMessage.success('已恢复为新版本')}catch(e){if(e!=='cancel'&&e!=='close')ElMessage.error(e.message)}finally{busy.value=false}}
async function download(format){try{const r=await api.docCheck(props.caseId,props.doc.key);if(!r.check.valid){ElMessage.warning('校验未通过，请先补齐材料并纠正事实字段');return}window.open(`/api/${format}/doc?case=${encodeURIComponent(props.caseId)}&key=${props.doc.key}`,'_blank')}catch(e){ElMessage.error(e.message)}}
</script>
<style scoped>.editing-paper{outline:2px solid #1fa69b;min-height:420px}.editing-paper :deep(.lock){background:#fff8df;cursor:not-allowed}</style>
