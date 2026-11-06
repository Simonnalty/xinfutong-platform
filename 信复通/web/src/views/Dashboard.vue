<template>
  <div class="page" v-loading="loading">
    <div class="page-head">
      <div>
        <h1>{{ ent?.name || '工作台' }}</h1>
        <div v-if="ent" class="sub">
          统一社会信用代码 {{ ent?.credit_code }} · {{ ent?.industry }} · {{ ent?.region }}
        </div>
      </div>
      <div class="row dashboard-actions">
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

    <div class="edition-grid">
      <section class="dossier card" aria-label="失信事项档案">
        <div class="dossier-index">
          <div class="index-caption">企业信用 / 事项档案</div>
          <h2>失信事项</h2>
          <p class="muted tiny">共 {{ cases.length }} 份 · 选择事项查看</p>
          <div class="dossier-list">
            <button v-for="(item, index) in cases" :key="item.id" class="dossier-item"
              :class="{ selected: selectedCase?.id === item.id }" :aria-pressed="selectedCase?.id === item.id"
              @click="selectedCaseId = item.id">
              <span class="index-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="index-content"><strong>{{ item.event }}</strong><span>{{ stageLabel(item.stage) }} · 办理进度 {{ item.progress }}%</span></span>
            </button>
          </div>
          <el-empty v-if="!cases.length" description="暂无事项" :image-size="60" />
        </div>
        <div v-if="selectedCase" class="dossier-page">
          <div class="document-heading">
            <span class="index-caption">当前事项档案</span>
            <span class="level-badge" :class="selectedCase.level">{{ selectedCase.levelLabel }}</span>
          </div>
          <h2>{{ selectedCase.event }}</h2>
          <div class="document-id mono">{{ selectedCase.id }}</div>
          <dl class="dossier-facts">
            <dt>当前阶段</dt><dd>{{ stageLabel(selectedCase.stage) }}</dd>
            <dt>决定机关</dt><dd>{{ selectedCase.authority || '待登记' }}</dd>
            <dt>决定文号</dt><dd>{{ selectedCase.doc_no || '待登记' }}</dd>
            <dt>办理进度</dt><dd class="dossier-progress"><el-progress :percentage="selectedCase.progress" :stroke-width="5" :color="progressColor(selectedCase)" /></dd>
          </dl>
          <div class="document-note">{{ stageHint }}<br /><span class="muted">办理进度不代表材料完备度，材料校验情况请在事项内查看。</span></div>
          <div class="dossier-links">
            <button @click="goCase(selectedCase, 'docs')"><el-icon><Document /></el-icon>材料工坊</button>
            <button @click="goCase(selectedCase, 'evidence')"><el-icon><FolderOpened /></el-icon>证据附件</button>
            <button @click="goCase(selectedCase, 'progress')"><el-icon><Clock /></el-icon>办理记录</button>
          </div>
          <el-button type="primary" class="open-dossier" @click="goCase(selectedCase)">打开事项档案 <el-icon><Right /></el-icon></el-button>
        </div>
        <div v-else class="dossier-page"><el-empty description="登记企业事项后，在这里查阅材料与办理记录" :image-size="90" /></div>
      </section>
      <aside class="edition-side">
        <section class="service-section">
          <h2>常用服务</h2>
          <div class="quick-grid">
            <button v-for="q in quick" :key="q.t" class="quick-item" :disabled="q.needsCase && !selectedCase" @click="q.go">
              <el-icon :size="21"><component :is="q.icon" /></el-icon>
              <strong>{{ q.t }}</strong><span>{{ q.d }}</span>
            </button>
          </div>
        </section>
        <section class="activity-section">
          <div class="spread"><h2>最近动态</h2><span class="muted tiny">最近 {{ timeline.length }} 条</span></div>
          <ol v-if="timeline.length" class="activity-list">
            <li v-for="t in timeline" :key="t.id"><time>{{ fmt(t.at) }}</time><strong>{{ t.action }}</strong><p>{{ t.detail }}</p></li>
          </ol>
          <el-empty v-else description="暂无动态" :image-size="60" />
        </section>
      </aside>
    </div>
    </template>
    <EnterpriseDialog v-model="showEnterprise" :enterprise="editingEnterprise" @saved="load" />
    <CaseCreateDialog v-model="showCase" :enterprise-id="store.enterpriseId" @saved="createdCase" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, Plus } from '@element-plus/icons-vue'
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
const selectedCaseId = ref(null)
const selectedCase = computed(() => cases.value.find(c => c.id === selectedCaseId.value) || cases.value[0])
const stageHint = computed(() => ({ draft: '先核对整改事实，再确认适用的办理路径。', diagnosed: '请按诊断提示核对材料与适用规则。', materials_ready: '材料已就绪，请通过官方渠道办理并留存提交记录。', submitted: '已记录提交进度，请跟进官方受理反馈。', reviewing: '办理审核中，请留意补正要求和反馈。', rejected: '请核对退回原因，并按要求补充材料。', repaired: '已记录官方修复结果，可继续核对各渠道同步情况。' }[selectedCase.value?.stage] || '以有权机关反馈为准，及时补充办理记录。'))
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
  { t: '智能诊断', d: '判定失信等级、可申请日与材料清单', icon: 'FirstAidKit', needsCase: true, go: () => goCase(selectedCase.value) },
  { t: '同步监测', d: '巡检第三方平台是否已同步修复结果', icon: 'Monitor', needsCase: true, go: () => goCase(selectedCase.value, 'sync') },
  { t: '办理进度记录', d: '把办理过程留成可核对的记录，不替代机关的修复决定', icon: 'Postcard', needsCase: true, go: () => goCase(selectedCase.value, 'cert') },
  { t: '合规知识库', d: '法规原文、办理指引与典型案例', icon: 'Reading', go: () => router.push('/app/knowledge') }
])

const stageMap = { draft: '草稿', diagnosed: '已诊断', materials_ready: '材料就绪', rejected: '已退回', submitted: '已提交', reviewing: '审核中', repaired: '已修复' }
const stageLabel = s => stageMap[s] || s
const fmt = s => String(s || '').replace('T', ' ').slice(0, 16)
const progressColor = row => row.stage === 'repaired' ? '#1E8449' : row.progress < 40 ? '#B9770E' : 'var(--teal)'

function goCase(row, tab) {
  if (!row) return
  // 从列表进事项一律落到「智能诊断」；只有快捷卡显式指定的页签才带 tab 参数
  router.push({ name: 'case', params: { id: row.id }, query: { tab: tab || 'diagnose' } })
}

let loadVersion=0
async function load() {
  const version=++loadVersion,id=store.enterpriseId
  ent.value=null;cases.value=[];selectedCaseId.value=null;timeline.value=[];todoCount.value=0
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

<style scoped>
.dashboard-actions { gap: 8px; }
.dashboard-actions > .el-button { margin-left: 0; }
.edition-grid { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 28px; align-items: start; }
.edition-grid > * { min-width: 0; }
.dossier { display: grid; grid-template-columns: 200px minmax(0, 1fr); }
.dossier-index { background: #f1f3eb; border-right: 1px solid var(--line); padding: 24px 18px; }
h2 { font-family: var(--serif); font-weight: 600; font-size: 22px; margin: 0 0 12px; line-height: 1.6; }
.index-caption { color: var(--muted); font-size: 12px; letter-spacing: .5px; }
.dossier-index h2 { margin: 8px 0 0; }
.dossier-index p { margin: 4px 0 24px; }
.dossier-list { display: grid; gap: 8px; }
.dossier-item { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 12px 8px; border: 1px solid transparent; border-radius: 2px; background: transparent; text-align: left; font: inherit; color: var(--muted); cursor: pointer; }
.dossier-item.selected { background: #fff; border-color: var(--line); color: var(--teal); }
.index-number { font: 18px Georgia, serif; padding-top: 3px; }
.index-content { min-width: 0; }
.index-content strong { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-size: 14px; line-height: 1.8; font-weight: 500; }
.index-content > span { display: block; margin-top: 8px; font-size: 12px; color: var(--muted); }
.dossier-page { min-width: 0; padding: 28px; }
.document-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 16px; }
.dossier-page h2 { font-size: 24px; overflow-wrap: anywhere; }
.document-id { color: var(--muted); overflow-wrap: anywhere; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.dossier-facts { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 16px; font-size: 14px; line-height: 1.8; margin: 24px 0; }
.dossier-facts dt { color: var(--muted); }
.dossier-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.dossier-progress { align-self: center; }
.document-note { font-size: 13px; line-height: 1.9; padding-top: 18px; border-top: 1px solid var(--line); }
.dossier-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0; }
.dossier-links button { display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid var(--line); border-radius: 2px; padding: 8px 10px; font: inherit; font-size: 13px; color: var(--teal); cursor: pointer; min-height: 40px; }
.dossier-links button:hover { border-color: var(--teal); }
.open-dossier { min-height: 40px; gap: 8px; }
.quick-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.quick-item { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; min-width: 0; padding: 14px 12px; border: 1px solid var(--line); background: transparent; border-radius: 3px; text-align: left; font: inherit; color: var(--teal); cursor: pointer; }
.quick-item strong { font-size: 14px; font-weight: 500; }
.quick-item span { font-size: 12px; color: var(--muted); line-height: 1.7; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.quick-item:hover:not(:disabled) { background: #eef2e9; border-color: var(--teal); }
.quick-item:disabled { opacity: .5; cursor: not-allowed; }
.activity-section { margin-top: 28px; }
.activity-section h2 { margin: 0; }
.activity-list { list-style: none; margin: 12px 0 0; padding: 0; max-height: 340px; overflow-y: auto; scrollbar-width: thin; }
.activity-list li { padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.activity-list time { display: block; color: var(--muted); font-size: 12px; margin-bottom: 3px; }
.activity-list strong { font-weight: 500; }
.activity-list p { margin: 3px 0 0; font-size: 12px; color: var(--muted); }
@media (min-width: 981px) and (max-width: 1250px) {
  .edition-grid { grid-template-columns: minmax(0, 1fr); }
  .edition-side { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .activity-section { margin-top: 0; }
}
@media (max-width: 980px) {
  .edition-grid { grid-template-columns: minmax(0, 1fr); gap: 24px; }
  .dossier { grid-template-columns: minmax(0, 1fr); }
  .dossier-index { padding: 18px; border-right: 0; border-bottom: 1px solid var(--line); }
  .dossier-index p { margin-bottom: 14px; }
  .dossier-list { grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: 250px; overflow-y: auto; }
  .dossier-item { gap: 7px; padding: 10px 8px; }
  .index-content strong { -webkit-line-clamp: 2; }
  .index-content > span { font-size: 12px; }
  .dossier-page { padding: 22px 18px; }
  .dossier-page h2 { font-size: 22px; }
  .dossier-facts { grid-template-columns: 68px minmax(0, 1fr); gap: 12px; }
}
@media (max-width: 680px) { .dashboard-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); } .dashboard-actions > .el-button { padding: 8px 6px; font-size: 12px; } }
</style>
