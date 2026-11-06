<template>
 <div class="card card-pad" v-loading="busy">
  <div class="card-title"><span class="bar"></span>任务拆解与协作</div>
  <div v-for="t in tasks" :key="t.id" style="padding:12px 0;border-bottom:1px dashed var(--line)">
   <div class="spread"><strong>{{t.name}}</strong><el-tag :type="t.status==='done'?'success':overdue(t)?'danger':'info'">{{labels[t.status]}}</el-tag></div>
   <p class="muted tiny">{{t.owner||'待分配'}} · 截止 {{t.due_date||'待设定'}} <span v-if="overdue(t)" style="color:var(--bad)">已逾期</span><span v-if="t.depends_on"> · 前置任务 #{{t.depends_on}}</span></p>
   <el-button v-if="writable" size="small" @click="edit(t)">分配 / 更新 / 关联附件</el-button>
   <div v-for="ev in events.filter(e=>e.task_id===t.id).slice(0,3)" :key="ev.id" class="tiny muted" style="margin-top:6px">{{ev.created_at}} · {{ev.note}} <span v-if="ev.evidence_id">· 已关联附件</span></div>
  </div>
  <el-dialog v-model="opened" title="更新办理任务" width="min(560px,94vw)">
   <el-form label-position="top">
    <el-form-item label="负责人 / 部门"><el-input v-model="form.owner" maxlength="50" /></el-form-item>
    <el-form-item label="截止日期"><el-date-picker v-model="form.due_date" value-format="YYYY-MM-DD" /></el-form-item>
    <el-form-item label="办理状态"><el-select v-model="form.status"><el-option v-for="(l,k) in labels" :key="k" :label="l" :value="k" /></el-select></el-form-item>
    <el-form-item label="相关附件（可选）"><el-select v-model="form.evidence_id" clearable><el-option v-for="f in files" :key="f.id" :value="f.id" :label="f.filename" /></el-select></el-form-item>
    <el-form-item label="完成 / 补正 / 分配说明"><el-input v-model="form.note" type="textarea" maxlength="500" /></el-form-item>
   </el-form>
   <template #footer><el-button @click="opened=false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存任务记录</el-button></template>
  </el-dialog>
 </div>
</template>
<script setup>
import {ref,computed} from 'vue'
import {ElMessage} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const props=defineProps({caseId:String,enterpriseId:Number,tasks:Array,events:{type:Array,default:()=>[]}}),emit=defineEmits(['changed'])
const busy=ref(false),opened=ref(false),form=ref({}),files=ref([]),labels={todo:'待办',doing:'办理中',done:'已完成'}
const writable=computed(()=>{const e=store.enterprises.find(e=>e.id===props.enterpriseId);return store.user?.role==='admin'||e?.relation==='owner'||e?.perm==='write'})
function overdue(t){return t.status!=='done'&&t.due_date&&t.due_date<new Date().toISOString().slice(0,10)}
async function edit(t){try{files.value=(await api.evidence(props.caseId)).items.filter(f=>!f.archived);form.value={...t,note:'',evidence_id:null};opened.value=true}catch(e){ElMessage.error(e.message)}}
async function save(){busy.value=true;try{await api.updateTask(form.value.id,form.value);opened.value=false;emit('changed');ElMessage.success('任务记录已保存')}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
</script>
