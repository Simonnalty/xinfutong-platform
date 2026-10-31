<template>
  <div class="page" v-loading="loading">
    <div class="page-head"><div><h1>机构协作工作台</h1><div class="sub">查看获授权企业的信用事项、逾期任务和监测结果</div></div><el-button @click="load">刷新</el-button></div>
    <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
    <template v-else>
      <div class="kpi-grid" style="margin-bottom:18px"><div class="card kpi"><div class="label">授权企业</div><div class="value">{{ data.enterprises.length }}</div></div><div class="card kpi"><div class="label">信用事项</div><div class="value">{{ data.cases.length }}</div></div><div class="card kpi"><div class="label">逾期任务</div><div class="value">{{ data.cases.reduce((n,c)=>n+Number(c.overdue),0) }}</div></div></div>
      <div class="card card-pad" style="margin-bottom:18px"><div class="spread"><h3>企业事项</h3><el-button type="primary" :loading="running" :disabled="!selected.length" @click="batch">批量复查（{{ selected.length }}）</el-button></div>
        <el-input v-model="search" placeholder="搜索企业或事项" clearable style="max-width:360px;margin:12px 0"/>
        <el-table :data="filtered" row-key="id" @selection-change="selected=$event"><el-table-column type="selection" width="45" :selectable="writable"/><el-table-column prop="enterprise_name" label="企业" min-width="180"/><el-table-column prop="event" label="事项" min-width="180"/><el-table-column label="进度" width="130"><template #default="{row}">{{stages[row.stage]||row.stage}}</template></el-table-column><el-table-column prop="overdue" label="逾期任务" width="100"/><el-table-column label="权限" width="90"><template #default="{row}">{{ writable(row)?'协作':'只读' }}</template></el-table-column><el-table-column label="操作" width="100"><template #default="{row}"><el-button text type="primary" @click="$router.push('/app/case/'+row.id)">查看事项</el-button></template></el-table-column></el-table>
        <el-alert v-if="results.length" :title="`本批 ${results.filter(r=>r.ok).length}/${results.length} 个事项完成复查操作`" type="info" :closable="false" style="margin-top:14px"/>
        <div v-for="r in results" :key="r.id" class="tiny" style="margin-top:8px">{{ r.id }}：{{ r.ok?'已执行；请到事项监测页查看各渠道状态':r.error }}</div>
      </div>
      <div class="card card-pad"><h3>机构成员</h3><div class="spread"><el-select v-model="orgId" placeholder="选择您管理的机构" @change="membersLoad"><el-option v-for="o in managed" :key="o.id" :value="o.id" :label="o.name"/></el-select><el-button :disabled="!orgId" @click="memberOpen=true">添加机构成员</el-button></div><el-table :data="members"><el-table-column prop="name" label="姓名"/><el-table-column prop="phone" label="账号"/><el-table-column label="角色"><template #default="{row}">{{ row.role==='owner'?'负责人':'成员' }}</template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button v-if="row.role!=='owner'" text type="danger" @click="memberChange(row.phone,true)">移除</el-button></template></el-table-column></el-table></div>
      <el-dialog v-model="memberOpen" title="添加机构成员" width="440px"><p class="muted">成员需已注册，并由运营人员确认为机构账号。</p><el-input v-model="phone" placeholder="成员手机号"/><template #footer><el-button @click="memberOpen=false">取消</el-button><el-button type="primary" @click="memberChange(phone,false)">添加成员</el-button></template></el-dialog>
    </template>
  </div>
</template>
<script setup>
import {ref,computed,onMounted} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const data=ref({enterprises:[],cases:[],orgs:[]}),loading=ref(false),error=ref(''),search=ref(''),selected=ref([]),running=ref(false),results=ref([]),orgId=ref(null),members=ref([]),memberOpen=ref(false),phone=ref('')
const stages={draft:'待准备',materials_ready:'材料就绪',submitted:'已提交',accepted:'已受理',reviewing:'审核中',rejected:'待补正',repaired:'已修复'}
const filtered=computed(()=>data.value.cases.filter(c=>`${c.enterprise_name} ${c.event}`.includes(search.value)))
const managed=computed(()=>data.value.orgs.filter(o=>o.member_role==='owner'||store.user?.role==='admin'))
function writable(c){const e=data.value.enterprises.find(e=>e.id===c.enterprise_id);return store.user?.role==='admin'||e?.relation==='owner'||e?.perm==='write'}
async function load(){loading.value=true;try{data.value=await api.orgWorkspace();error.value=''}catch(e){error.value=e.message}finally{loading.value=false}}
async function batch(){running.value=true;try{results.value=(await api.batchMonitor(selected.value.map(c=>c.id))).results;await load()}catch(e){ElMessage.error(e.message)}finally{running.value=false}}
async function membersLoad(){try{members.value=(await api.orgMembers(orgId.value)).items}catch(e){ElMessage.error(e.message)}}
async function memberChange(phone,revoked){if(revoked){try{await ElMessageBox.confirm('移除此机构成员？','移除成员',{type:'warning'})}catch{return}}try{await api.orgMember(orgId.value,{phone,revoked});memberOpen.value=false;await membersLoad();ElMessage.success('机构成员已更新')}catch(e){ElMessage.error(e.message)}}
onMounted(load)
</script>
