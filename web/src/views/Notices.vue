<template>
 <div class="page" v-loading="loading"><div class="page-head"><div><h1>合规提醒</h1><div class="sub">企业复查、政策更新与逾期任务的站内提醒</div></div><el-button @click="load">刷新</el-button></div><el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <template v-else-if="store.enterpriseId"><div class="card card-pad" style="margin-bottom:18px"><h3>提醒设置</h3><el-form label-position="top" :disabled="!writable"><el-form-item label="接收站内提醒"><el-switch v-model="form.enabled"/></el-form-item><el-form-item label="接收已复核政策更新"><el-switch v-model="form.policy_updates"/></el-form-item><el-form-item label="定期复查间隔（天）"><el-input-number v-model="form.repeat_days" :min="1" :max="90"/></el-form-item><el-button type="primary" :loading="saving" @click="save">保存提醒设置</el-button></el-form><p class="muted tiny">启用后由后台定期生成；通知仅在平台内展示。只读成员可查看提醒，设置由企业负责人或获协作权限的机构修改。</p></div>
 <el-empty v-if="!items.length" description="暂无提醒，启用设置后会自动检查"/><div v-for="n in items" :key="n.id" class="card card-pad" style="margin-bottom:12px"><div class="spread"><h3>{{ n.title }}</h3><el-tag :type="n.read_at?'info':'warning'">{{ n.read_at?'已读':'未读' }}</el-tag></div><div class="muted tiny">{{ n.created_at }}</div><p style="white-space:pre-wrap;line-height:1.8">{{ n.body }}</p><div style="display:flex;gap:16px;align-items:center"><a v-if="n.source_url" :href="n.source_url" target="_blank" rel="noopener noreferrer">查看来源</a><el-button v-if="n.case_id" text @click="$router.push('/app/case/'+n.case_id)">查看事项</el-button><el-button v-if="!n.read_at" text @click="read(n)">标为已读</el-button></div></div></template><el-empty v-else description="请先选择企业"/></div>
</template>
<script setup>
import {ref,onMounted,watch,computed} from 'vue'
import {ElMessage} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const items=ref([]),loading=ref(false),saving=ref(false),error=ref(''),form=ref({enabled:false,policy_updates:true,repeat_days:30})
const writable=computed(()=>{const e=store.enterprises.find(e=>e.id===store.enterpriseId);return store.user?.role==='admin'||e?.relation==='owner'||e?.perm==='write'})
async function load(){if(!store.enterpriseId)return;loading.value=true;try{const [r,n]=await Promise.all([api.reminderSettings(store.enterpriseId),api.notices(store.enterpriseId)]);form.value={...r.settings,enabled:!!r.settings.enabled,policy_updates:!!r.settings.policy_updates};items.value=n.items;error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
async function save(){saving.value=true;try{await api.configureReminders(store.enterpriseId,form.value);ElMessage.success('提醒设置已保存')}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
async function read(n){try{await api.readNotice(n.id);await load()}catch(e){ElMessage.error(e.message)}}
onMounted(load);watch(()=>store.enterpriseId,load)
</script>
