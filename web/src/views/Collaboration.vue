<template>
  <div class="page" v-loading="loading">
    <div class="page-head"><div><h1>企业协作授权</h1><div class="sub">管理当前企业的只读成员与机构协作权限</div></div></div>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <template v-else-if="store.enterpriseId">
      <div class="card card-pad" style="margin-bottom:18px">
        <div class="spread"><h3>企业成员</h3><el-button type="primary" @click="memberOpen=true">添加只读成员</el-button></div>
        <el-table :data="data.members"><el-table-column prop="name" label="姓名"/><el-table-column prop="phone" label="账号"/><el-table-column label="权限"><template #default="{row}">{{ row.role==='owner'?'负责人':'只读成员' }}</template></el-table-column><el-table-column label="状态"><template #default="{row}">{{ row.revoked_at?'已撤销':'有效' }}</template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button v-if="row.role!=='owner'" text type="danger" @click="setMember(row.phone,!row.revoked_at)">{{ row.revoked_at?'恢复':'撤销' }}</el-button></template></el-table-column></el-table>
      </div>
      <div class="card card-pad"><div class="spread"><h3>授权机构</h3><el-button type="primary" @click="grantOpen=true">授权机构</el-button></div>
        <p class="muted">只读允许查看企业事项；协作允许处理材料和监测。撤销后机构将失去本次授权。</p>
        <el-table :data="data.grants" empty-text="尚未授权机构"><el-table-column prop="name" label="机构"/><el-table-column label="权限"><template #default="{row}">{{ row.perm==='write'?'协作':'只读' }}</template></el-table-column><el-table-column prop="note" label="授权说明"/><el-table-column label="状态"><template #default="{row}">{{ row.revoked_at?'已撤销':'有效' }}</template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button text type="danger" @click="setGrant({...row,revoked:!row.revoked_at})">{{ row.revoked_at?'恢复':'撤销' }}</el-button></template></el-table-column></el-table>
      </div>
    </template><el-empty v-else description="请先创建或选择企业"/>
    <el-dialog v-model="memberOpen" title="添加只读成员" width="440px"><el-form label-position="top"><el-form-item label="已注册成员的手机号"><el-input v-model="phone" maxlength="20"/></el-form-item></el-form><template #footer><el-button @click="memberOpen=false">取消</el-button><el-button type="primary" :loading="saving" @click="setMember(phone,false)">添加成员</el-button></template></el-dialog>
    <el-dialog v-model="grantOpen" title="授权机构" width="480px"><el-form label-position="top"><el-form-item label="机构"><el-select v-model="grant.org_id" style="width:100%"><el-option v-for="o in data.orgs" :key="o.id" :value="o.id" :label="o.name"/></el-select></el-form-item><el-form-item label="权限"><el-radio-group v-model="grant.perm"><el-radio value="read">只读</el-radio><el-radio value="write">协作</el-radio></el-radio-group></el-form-item><el-form-item label="授权说明"><el-input v-model="grant.note" type="textarea" maxlength="200" show-word-limit/></el-form-item></el-form><template #footer><el-button @click="grantOpen=false">取消</el-button><el-button type="primary" :loading="saving" @click="setGrant(grant)">确认授权</el-button></template></el-dialog>
  </div>
</template>
<script setup>
import {ref,onMounted,watch} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const data=ref({members:[],grants:[],orgs:[]}),error=ref(''),loading=ref(false),saving=ref(false),memberOpen=ref(false),grantOpen=ref(false),phone=ref(''),grant=ref({org_id:null,perm:'read',note:''})
async function load(){error.value='';if(!store.enterpriseId)return;loading.value=true;try{data.value=await api.collaboration(store.enterpriseId)}catch(e){error.value=e.message}finally{loading.value=false}}
async function setMember(phone,revoked){if(revoked){try{await ElMessageBox.confirm('撤销此成员的企业访问权限？','撤销成员',{type:'warning'})}catch{return}}saving.value=true;try{await api.enterpriseMember(store.enterpriseId,{phone,revoked});memberOpen.value=false;await load();ElMessage.success('成员权限已更新')}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
async function setGrant(body){if(body.revoked){try{await ElMessageBox.confirm('撤销该机构的企业访问及协作权限？','撤销授权',{type:'warning'})}catch{return}}saving.value=true;try{await api.enterpriseGrant(store.enterpriseId,body);grantOpen.value=false;await load();ElMessage.success('机构授权已更新')}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
onMounted(load);watch(()=>store.enterpriseId,load)
</script>
