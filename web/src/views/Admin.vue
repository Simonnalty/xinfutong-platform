<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>平台运营</h1>
        <div class="sub">规则参数、机构、审计与用量 —— 只对平台运营账号可见</div>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="card kpi"><div class="label">入驻企业</div><div class="value">{{ stats.enterprises || 0 }}</div><div class="foot">家</div></div>
      <div class="card kpi"><div class="label">失信案件</div><div class="value">{{ stats.cases || 0 }}</div><div class="foot">已修复 {{ stats.repaired || 0 }} 件</div></div>
      <div class="card kpi"><div class="label">进度记录</div><div class="value">{{ stats.certificates || 0 }}</div><div class="foot">被核对 {{ stats.scans || 0 }} 次</div></div>
      <div class="card kpi"><div class="label">AI 调用</div><div class="value">{{ stats.aiCalls || 0 }}</div><div class="foot">次文书润色</div></div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="知识内容" name="knowledge"><KnowledgeAdmin /></el-tab-pane>
      <el-tab-pane label="适用规则版本" name="versions"><RuleVersions /></el-tab-pane>
      <el-tab-pane label="规则参数" name="rules">
        <div class="card card-pad">
          <el-alert title="法定参数集中管理：法规修订时改这里，不必改代码。当前值为演示默认值，正式使用前须由法律专业人员逐条校准。" type="warning" :closable="false" show-icon style="margin-bottom:14px" />
          <el-table :data="rules" size="small">
            <el-table-column prop="pkey" label="参数键" width="220" />
            <el-table-column prop="note" label="说明" min-width="240" />
            <el-table-column label="取值" width="220">
              <template #default="{ row }">
                <el-input v-model="row.pvalue" size="small" @change="saveRule(row)" />
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="机构" name="orgs">
        <div class="card card-pad">
          <el-button type="primary" style="margin-bottom:14px" @click="orgOpen=true">创建机构</el-button>
          <el-table :data="orgs" size="small">
            <el-table-column prop="name" label="机构名称" min-width="220" />
            <el-table-column prop="type" label="类型" width="100">
              <template #default="{ row }">{{ { park: '园区', agency: '代账', bank: '银行' }[row.type] || row.type }}</template>
            </el-table-column>
            <el-table-column prop="contact" label="联系人" width="120" />
            <el-table-column prop="phone" label="电话" width="140" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="审计日志" name="audit">
        <div class="card card-pad">
          <el-table :data="audit" size="small">
            <el-table-column prop="at" label="时间" width="170" />
            <el-table-column prop="actor_id" label="操作人" width="90" />
            <el-table-column prop="action" label="动作" width="140" />
            <el-table-column prop="target" label="对象" min-width="160" />
            <el-table-column prop="detail" label="详情" min-width="200" />
            <el-table-column prop="ip" label="IP" width="130" />
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
    <el-dialog v-model="orgOpen" title="创建机构" width="480px"><el-form label-position="top"><el-form-item label="机构名称"><el-input v-model="orgForm.name"/></el-form-item><el-form-item label="类型"><el-select v-model="orgForm.type"><el-option label="园区" value="park"/><el-option label="代账机构" value="agency"/><el-option label="金融机构" value="bank"/></el-select></el-form-item><el-form-item label="负责人已注册手机号"><el-input v-model="orgForm.owner_phone"/></el-form-item></el-form><template #footer><el-button @click="orgOpen=false">取消</el-button><el-button type="primary" @click="createOrg">创建机构</el-button></template></el-dialog>
  </div>
</template>

<script setup>
import KnowledgeAdmin from '../components/KnowledgeAdmin.vue'
import RuleVersions from '../components/RuleVersions.vue'
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'

const tab = ref('versions')
const stats = ref({})
const rules = ref([])
const orgs = ref([])
const audit = ref([])
const orgOpen=ref(false),orgForm=ref({name:'',type:'park',owner_phone:''})
async function createOrg(){try{await api.createOrg(orgForm.value);orgOpen.value=false;orgs.value=(await api.adminOrgs()).items;ElMessage.success('机构已创建，负责人重新登录后可进入机构工作台')}catch(e){ElMessage.error(e.message)}}

async function saveRule(row) {
  try {
    const r = await api.adminRules()
    const res = await fetch(`/api/admin/rules/${encodeURIComponent(row.pkey)}`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: row.pvalue })
    })
    if (!res.ok) throw new Error((await res.json()).error)
    rules.value = (await res.json()).items
    ElMessage.success('已更新')
  } catch (e) { ElMessage.error(e.message) }
}

onMounted(async () => {
  try {
    stats.value = await api.adminStats()
    rules.value = (await api.adminRules()).items
    orgs.value = (await api.adminOrgs()).items
    audit.value = (await api.adminAudit()).items
  } catch (e) { ElMessage.error(e.message) }
})
</script>
