<template>
  <div class="page" v-loading="loading">
    <div class="page-head">
      <div>
        <h1>{{ ent?.name || '工作台' }}</h1>
        <div v-if="ent" class="sub">
          统一社会信用代码 {{ ent?.credit_code }} · {{ ent?.industry }} · {{ ent?.region }}
        </div>
      </div>
      <div class="row">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="canCreate" @click="openEnterprise(null)">新增企业</el-button>
        <el-button v-if="ent && canWrite" @click="openEnterprise(ent)">编辑档案</el-button>
        <el-button v-if="ent && canWrite" type="primary" :icon="Plus" @click="showCase=true">新建事项</el-button>
      </div>
    </div>

    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false" style="margin-bottom:18px" />
    <el-empty v-if="!store.enterpriseId && !loading" description="先建立企业档案，再登记需要修复的事项">
      <el-button v-if="canCreate" type="primary" @click="openEnterprise(null)">建立第一家企业</el-button>
      <div v-else>请联系企业负责人授予访问权限</div>
    </el-empty>
    <template v-if="store.enterpriseId">
    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="card kpi accent">
        <div class="label">事项办理参考分</div>
        <div class="value">{{ summary.total ? health : '—' }}<span style="font-size:16px">/100</span></div>
        <div class="foot">{{ healthHint }}</div>
      </div>
      <div class="card kpi">
        <div class="label">在办失信事项</div>
        <div class="value">{{ summary.active }}</div>
        <div class="foot">累计 {{ summary.total }} 条 · 已修复 {{ summary.repaired }} 条</div>
      </div>
      <div class="card kpi">
        <div class="label">同步异常渠道</div>
        <div class="value" :style="{ color: summary.syncIssues ? 'var(--bad)' : 'var(--ok)' }">{{ summary.syncIssues }}</div>
        <div class="foot">第三方平台与官方公示不一致</div>
      </div>
      <div class="card kpi">
        <div class="label">待办任务</div>
        <div class="value">{{ todoCount }}</div>
        <div class="foot">按办理节点自动拆解</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:18px">
      <div class="card card-pad">
        <div class="card-title"><span class="bar"></span>失信事项</div>
        <el-table :data="cases" style="width:100%" size="default" :row-class-name="() => 'clickable'" @row-click="goCase">
          <el-table-column prop="id" label="编号" width="150">
            <template #default="{ row }"><span class="mono">{{ row.id }}</span></template>
          </el-table-column>
          <el-table-column prop="event" label="失信行为" min-width="220" show-overflow-tooltip />
          <el-table-column label="等级" width="100">
            <template #default="{ row }">
              <span class="level-badge" :class="row.level">{{ row.levelLabel }}</span>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="150">
            <template #default="{ row }">
              <el-progress :percentage="row.progress" :stroke-width="8" :color="progressColor(row)" />
            </template>
          </el-table-column>
          <el-table-column prop="stage" label="阶段" width="90">
            <template #default="{ row }">{{ stageLabel(row.stage) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!cases.length" description="尚未登记修复事项" :image-size="80" />
      </div>

      <div class="card card-pad">
        <div class="card-title"><span class="bar"></span>最近动态</div>
        <el-timeline style="padding-left:4px">
          <el-timeline-item v-for="t in timeline" :key="t.id" :timestamp="fmt(t.at)" placement="top" size="small">
            <div style="font-size:13px">{{ t.action }}</div>
            <div class="muted tiny">{{ t.detail }}</div>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-if="!timeline.length" description="暂无动态" :image-size="70" />
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px">
      <div class="card-title"><span class="bar"></span>快速入口</div>
      <div class="row">
        <div v-for="q in quick" :key="q.t" class="card" style="flex:1;min-width:200px;padding:16px 18px;cursor:pointer" @click="q.go">
          <div style="display:flex;align-items:center;gap:10px">
            <el-icon :size="20" color="#1FA69B"><component :is="q.icon" /></el-icon>
            <div style="font-size:14px;font-weight:500">{{ q.t }}</div>
          </div>
          <div class="muted tiny" style="margin-top:8px;line-height:1.6">{{ q.d }}</div>
        </div>
      </div>
    </div>
    </template>
    <EnterpriseDialog v-model="showEnterprise" :enterprise="editingEnterprise" @saved="load" />
    <CaseCreateDialog v-model="showCase" :enterprise-id="store.enterpriseId" @saved="createdCase" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { store, currentEnterprise } from '../store.js'
import EnterpriseDialog from '../components/EnterpriseDialog.vue'
import CaseCreateDialog from '../components/CaseCreateDialog.vue'

const router = useRouter()
const loading=ref(false),loadError=ref(''),showEnterprise=ref(false),showCase=ref(false),editingEnterprise=ref(null)
const canCreate=computed(()=>['enterprise','admin'].includes(store.user?.role))
const canWrite=computed(()=>{const e=currentEnterprise();return store.user?.role==='admin' || e?.relation==='owner' || (e?.relation==='org' && e?.perm==='write')})
function openEnterprise(e){editingEnterprise.value=e;showEnterprise.value=true}
function createdCase(c){goCase(c)}
const ent = ref(null)
const cases = ref([])
const summary = ref({ total: 0, repaired: 0, active: 0, syncIssues: 0 })
const timeline = ref([])
const todoCount = ref(0)

const health = computed(() => {
  const s = summary.value
  if (!s.total) return 100
  return Math.max(35, Math.round(100 - s.syncIssues * 8 - s.active * 6))
})
const healthHint = computed(() => {
  const s = summary.value
  if (s.syncIssues) return `有 ${s.syncIssues} 个渠道未同步，建议发送异议`
  if (s.active) return '修复流程进行中，注意关键节点'
  return '暂无登记事项；参考分不代表官方信用评级'
})

const quick = computed(() => [
  { t: '智能诊断', d: '判定失信等级、可申请日与材料清单', icon: 'FirstAidKit', go: () => goCase(cases.value[0]) },
  { t: '同步监测', d: '巡检第三方平台是否已同步修复结果', icon: 'Monitor', go: () => goCase(cases.value[0], 'sync') },
  { t: '办理进度记录', d: '把办理过程留成可核对的记录，不替代机关的修复决定', icon: 'Postcard', go: () => goCase(cases.value[0], 'cert') },
  { t: '合规知识库', d: '法规原文、办理指引与典型案例', icon: 'Reading', go: () => router.push('/app/knowledge') }
])

const stageMap = { draft: '草稿', diagnosed: '已诊断', materials_ready: '材料就绪', rejected: '已退回', submitted: '已提交', reviewing: '审核中', repaired: '已修复' }
const stageLabel = s => stageMap[s] || s
const fmt = s => String(s || '').replace('T', ' ').slice(0, 16)
const progressColor = row => row.stage === 'repaired' ? '#1E8449' : row.progress < 40 ? '#B9770E' : '#1FA69B'

function goCase(row, tab) {
  if (!row) return
  // 从列表进事项一律落到「智能诊断」；只有快捷卡显式指定的页签才带 tab 参数
  router.push({ name: 'case', params: { id: row.id }, query: { tab: tab || 'diagnose' } })
}

let loadVersion=0
async function load() {
  const version=++loadVersion,id=store.enterpriseId
  ent.value=null;cases.value=[];timeline.value=[];todoCount.value=0
  summary.value={total:0,repaired:0,active:0,syncIssues:0};loadError.value=''
  if (!id){loading.value=false;return}
  loading.value=true
  try{
    const r=await api.overview(id)
    if(version!==loadVersion)return
    ent.value=r.enterprise;cases.value=r.cases;summary.value=r.summary
    timeline.value=r.timeline||[]
    todoCount.value=r.todoCount||0
  }catch(e){if(version===loadVersion)loadError.value=e.message}
  finally{if(version===loadVersion)loading.value=false}
}
watch(()=>store.enterpriseId,load,{immediate:true})

</script>

<style>
.el-table .clickable { cursor: pointer; }
</style>
