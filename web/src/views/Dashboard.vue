<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>{{ ent?.name || '工作台' }}</h1>
        <div class="sub">
          统一社会信用代码 {{ ent?.credit_code }} · {{ ent?.industry }} · {{ ent?.region }}
        </div>
      </div>
      <div class="row">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="goCase(cases[0])" :disabled="!cases.length">进入案件</el-button>
      </div>
    </div>

    <div class="kpi-grid" style="margin-bottom:18px">
      <div class="card kpi accent">
        <div class="label">信用修复健康度</div>
        <div class="value">{{ health }}<span style="font-size:16px">/100</span></div>
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
        <el-empty v-if="!cases.length" description="暂无失信记录" :image-size="80" />
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.js'
import { store } from '../store.js'

const router = useRouter()
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
  return '状态良好，继续保持按期公示'
})

const quick = computed(() => [
  { t: '智能诊断', d: '判定失信等级、可申请日与材料清单', icon: 'FirstAidKit', go: () => goCase(cases.value[0]) },
  { t: '同步监测', d: '巡检第三方平台是否已同步修复结果', icon: 'Monitor', go: () => goCase(cases.value[0], 'sync') },
  { t: '数字凭证', d: '生成可扫码核验的修复状态凭证', icon: 'Postcard', go: () => goCase(cases.value[0], 'cert') },
  { t: '合规知识库', d: '法规原文、办理指引与典型案例', icon: 'Reading', go: () => router.push('/app/knowledge') }
])

const stageMap = { draft: '待提交', submitted: '已提交', reviewing: '审核中', repaired: '已修复' }
const stageLabel = s => stageMap[s] || s
const fmt = s => String(s || '').replace('T', ' ').slice(0, 16)
const progressColor = row => row.stage === 'repaired' ? '#1E8449' : row.progress < 40 ? '#B9770E' : '#1FA69B'

function goCase(row, tab) {
  if (!row) return
  router.push({ name: 'case', params: { id: row.id }, query: tab ? { tab } : {} })
}

async function load() {
  if (!store.enterpriseId) return
  const r = await api.overview(store.enterpriseId)
  ent.value = r.enterprise
  cases.value = r.cases
  summary.value = r.summary
  const first = r.cases[0]
  if (first) {
    const d = await api.caseDetail(first.id)
    timeline.value = d.timeline.slice(-6).reverse()
    todoCount.value = d.tasks.filter(t => t.status !== 'done').length
  }
}

onMounted(load)
</script>

<style>
.el-table .clickable { cursor: pointer; }
</style>
