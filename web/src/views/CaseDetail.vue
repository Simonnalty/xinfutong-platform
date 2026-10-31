<template>
  <div class="page" v-if="data">
    <div class="page-head">
      <div>
        <div class="row" style="align-items:center;margin-bottom:6px">
          <el-button text :icon="ArrowLeft" @click="$router.push('/app/dashboard')">返回</el-button>
          <span class="level-badge" :class="data.case.level">{{ data.case.levelLabel }}</span>
          <span class="mono muted">{{ data.case.id }}</span>
        </div>
        <h1 style="margin:0">{{ data.case.event }}</h1>
        <div class="sub">{{ data.enterprise.name }} · {{ data.case.authority }} · {{ data.case.doc_no }}</div>
      </div>
      <div class="row">
        <el-button :icon="Refresh" @click="reload">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="tab" class="case-tabs">
      <!-- 诊断 -->
      <el-tab-pane label="智能诊断" name="diagnose">
        <div class="card card-pad">
          <div class="verdict">
            <div>
              <div class="score-ring" :style="{ '--p': rule.score }">
                <div class="num">{{ rule.score }}</div>
                <div class="cap">材料完备度</div>
              </div>
              <div class="center" style="margin-top:14px">
                <el-button type="primary" plain size="small" :loading="diagnosing" @click="rediagnose">重新诊断</el-button>
              </div>
            </div>
            <div>
              <div style="display:flex;gap:26px;flex-wrap:wrap;margin-bottom:16px">
                <div>
                  <div class="muted tiny">失信等级</div>
                  <div style="font-size:18px;font-weight:600">{{ rule.levelLabel }}</div>
                </div>
                <div>
                  <div class="muted tiny">可申请修复日</div>
                  <div style="font-size:18px;font-weight:600" :style="{ color: rule.eligible ? 'var(--ok)' : 'var(--warn)' }">
                    {{ rule.applyFrom || '待定' }}
                  </div>
                </div>
                <div>
                  <div class="muted tiny">状态</div>
                  <div style="font-size:18px;font-weight:600" :style="{ color: rule.eligible ? 'var(--ok)' : 'var(--warn)' }">
                    {{ rule.eligible ? '可申请' : `还需 ${rule.waitDays} 天` }}
                  </div>
                </div>
                <div>
                  <div class="muted tiny">法定办理时限</div>
                  <div style="font-size:18px;font-weight:600">{{ rule.reviewDays }} 个工作日</div>
                </div>
              </div>

              <div class="cond-list">
                <div class="cond" v-for="c in rule.conditions" :key="c.key">
                  <el-icon :size="18" :color="c.pass ? '#1E8449' : '#B9770E'">
                    <component :is="c.pass ? 'CircleCheckFilled' : 'WarningFilled'" />
                  </el-icon>
                  <div>
                    <div class="name">{{ c.name }}</div>
                    <div class="note">{{ c.note }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;margin-top:18px">
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>需要准备的材料（{{ rule.materials.length }} 份）</div>
            <div v-for="(m, i) in rule.materials" :key="m.key" class="spread" style="padding:10px 0;border-bottom:1px dashed var(--line)">
              <div>
                <span class="muted mono" style="margin-right:10px">{{ String(i + 1).padStart(2, '0') }}</span>
                <span style="font-size:14px">{{ m.title }}</span>
              </div>
              <el-tag size="small" effect="plain">{{ docStatus(m.key) }}</el-tag>
            </div>
          </div>
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>法律依据</div>
            <div v-for="b in rule.basis" :key="b.law" style="margin-bottom:14px">
              <div style="font-size:13px;font-weight:500">{{ b.law }}</div>
              <div class="muted tiny" style="margin-top:4px;line-height:1.7">{{ b.text }}</div>
            </div>
          </div>
        </div>

        <div class="card card-pad" style="margin-top:18px">
          <div class="card-title"><span class="bar"></span>风险提示</div>
          <el-alert v-for="(w, i) in rule.warnings" :key="i" :title="w.text" :type="w.level === 'bad' ? 'error' : w.level" :closable="false" show-icon style="margin-bottom:10px" />
        </div>
      </el-tab-pane>

      <!-- 材料 -->
      <el-tab-pane label="材料工坊" name="docs">
        <div class="doc-layout">
          <div class="card card-pad doc-list">
            <div class="card-title"><span class="bar"></span>材料清单</div>
            <div v-for="d in docs" :key="d.key" class="doc-item" :class="{ active: d.key === activeDoc }" @click="activeDoc = d.key">
              <div class="t">{{ d.title }}</div>
              <div class="s">
                <span v-if="d.status === 'template'">模板 · 未定稿</span>
                <span v-else-if="d.status === 'ai'">AI 润色 · 已定稿</span>
                <span v-else>手工修改 · 已定稿</span>
              </div>
            </div>
            <el-divider style="margin:14px 0" />
            <el-button size="small" style="width:100%;margin-bottom:8px" :loading="checking" @click="doCheck">跨文书一致性校验</el-button>
            <el-alert v-if="checkResult" :title="`校验通过，一致率 ${checkResult.score} 分`" :type="checkResult.score >= 90 ? 'success' : 'warning'" :closable="false" show-icon />
          </div>

          <div class="card card-pad">
            <div class="spread" style="margin-bottom:14px">
              <div class="card-title" style="margin:0"><span class="bar"></span>{{ currentDoc?.title }}</div>
              <div class="row">
                <el-button size="small" :icon="MagicStick" :loading="polishing" :disabled="!aiOn" @click="polish">AI 润色</el-button>
                <el-button size="small" :icon="RefreshLeft" @click="resetDoc">恢复模板</el-button>
                <el-button size="small" :icon="Download" @click="exportPdf">导出 PDF</el-button>
              </div>
            </div>
            <el-alert v-if="!aiOn" title="未配置 AI 密钥，当前为模板文本。配置后可使用「AI 润色」生成更贴合企业情况的表述。" type="info" :closable="false" show-icon style="margin-bottom:14px" />
            <div class="paper" v-html="currentDoc?.html"></div>
            <div class="muted tiny" style="margin-top:12px;line-height:1.8">
              带 <span style="border-bottom:1px solid #C9A227">金色下划线</span> 的字段为事实锁定槽位，AI 与人工均不可修改，导出时作为书面事实保留。
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 进度 -->
      <el-tab-pane label="办理进度" name="progress">
        <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px">
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>流转记录</div>
            <el-timeline>
              <el-timeline-item v-for="t in data.timeline" :key="t.id" :timestamp="fmt(t.at)" placement="top"
                :type="t.at > now ? 'info' : 'primary'" :hollow="t.at > now">
                <div style="font-size:14px">{{ t.action }}</div>
                <div class="muted tiny">{{ t.actor }} · {{ t.detail }}</div>
              </el-timeline-item>
            </el-timeline>
          </div>
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>任务拆解</div>
            <div v-for="t in data.tasks" :key="t.id" class="spread" style="padding:10px 0;border-bottom:1px dashed var(--line)">
              <div style="display:flex;align-items:center;gap:10px">
                <el-checkbox :model-value="t.status === 'done'" @change="v => toggleTask(t, v)" />
                <div>
                  <div style="font-size:14px" :style="{ textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? '#9AA5B1' : '' }">{{ t.name }}</div>
                  <div class="muted tiny">{{ t.owner }} · 截止 {{ t.due_date }}</div>
                </div>
              </div>
              <el-tag size="small" :type="t.status === 'done' ? 'success' : t.status === 'doing' ? 'warning' : 'info'" effect="plain">{{ taskLabel(t.status) }}</el-tag>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 同步监测 -->
      <el-tab-pane label="同步监测" name="sync">
        <div class="card card-pad">
          <div class="spread" style="margin-bottom:8px">
            <div class="card-title" style="margin:0"><span class="bar"></span>多源渠道核验</div>
            <el-button type="primary" plain size="small" :loading="scanning" :icon="Monitor" @click="doRescan">立即巡检</el-button>
          </div>
          <div class="muted tiny" style="margin-bottom:12px">
            最近一次巡检：{{ data.channels[0]?.last_checked_at || '未巡检' }} · 数据来源：演示模拟源
          </div>
          <div class="chan" v-for="c in data.channels" :key="c.id">
            <div class="ico">{{ c.channel_name.slice(0, 1) }}</div>
            <div class="grow">
              <div class="name">{{ c.channel_name }}</div>
              <div class="note">{{ c.note }}</div>
            </div>
            <el-tag :type="stateType(c.state)" effect="light" size="small">
              <span class="tag-dot" :class="'dot-' + c.state"></span>{{ stateLabel(c.state) }}
            </el-tag>
            <el-button v-if="c.state === 'bad' || c.state === 'warn'" size="small" text type="primary" @click="openObjection(c)">生成异议函</el-button>
          </div>
        </div>
      </el-tab-pane>

      <!-- 凭证 -->
      <el-tab-pane label="数字凭证" name="cert">
        <div style="display:grid;grid-template-columns:1fr 340px;gap:18px">
          <div class="card card-pad">
            <div class="spread" style="margin-bottom:14px">
              <div class="card-title" style="margin:0"><span class="bar"></span>信用修复状态凭证</div>
              <el-button type="primary" size="small" :icon="Postcard" :loading="issuing" @click="issue">签发新凭证</el-button>
            </div>
            <el-empty v-if="!certs.length" description="尚未签发凭证" :image-size="90" />
            <div v-for="c in certs" :key="c.code" class="cert-card" style="margin-bottom:16px">
              <div class="spread">
                <div>
                  <div class="muted tiny" style="color:#8FA9BE">凭证编号</div>
                  <div class="code">{{ c.code }}</div>
                </div>
                <div class="cert-qr"><canvas :ref="el => setQr(el, c)"></canvas></div>
              </div>
              <div class="kv">
                <div class="k">企业</div><div>{{ data.enterprise.name }}</div>
                <div class="k">决定机关</div><div>{{ data.case.authority }}</div>
                <div class="k">签发日期</div><div>{{ fmtc(c.issued_at) }}</div>
                <div class="k">有效期至</div><div>{{ c.valid_until }}</div>
                <div class="k">内容摘要</div><div class="mono" style="word-break:break-all">{{ c.digest.slice(0, 32) }}…</div>
              </div>
              <div style="margin-top:16px" class="row">
                <el-button size="small" @click="openVerify(c.code)">验真页</el-button>
                <el-button size="small" @click="downloadCert(c.code)">下载 PDF</el-button>
              </div>
            </div>
          </div>
          <div class="card card-pad">
            <div class="card-title"><span class="bar"></span>这张凭证能做什么</div>
            <div style="font-size:13px;line-height:1.9;color:#33475b">
              <p style="margin-top:0">交给银行、招标方或合作方，对方扫码即可看到：</p>
              <p>· 修复的是哪一条失信信息</p>
              <p>· 由哪个机关、依据哪份决定作出</p>
              <p>· 凭证内容是否被篡改（摘要重算）</p>
              <p>· 是否已被签发方撤销</p>
              <p class="muted" style="font-size:12px;margin-top:14px">
                凭证采用链式存证：每条凭证记录前一条的摘要，形成可追溯的哈希链。平台只证明「数据与存证一致」，不替代行政机关的决定。
              </p>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 异议函 -->
    <el-dialog v-model="objOpen" title="数据异议与更正函" width="760px" top="6vh">
      <el-alert :title="`致：${objChannel?.channel_name}　当前状态：${objChannel?.note}`" type="warning" :closable="false" show-icon style="margin-bottom:14px" />
      <div class="paper" style="max-height:50vh;overflow:auto" v-html="objHtml"></div>
      <template #footer>
        <el-button @click="objOpen = false">关闭</el-button>
        <el-button type="primary" :loading="sending" @click="sendObjection">发送异议函</el-button>
      </template>
    </el-dialog>
  </div>

  <div v-else class="page"><el-skeleton :rows="8" animated /></div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import { api } from '../api.js'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const tab = ref(route.query.tab || 'diagnose')
const activeDoc = ref('apply')
const aiOn = ref(false)
const polishing = ref(false)
const scanning = ref(false)
const issuing = ref(false)
const checking = ref(false)
const diagnosing = ref(false)
const checkResult = ref(null)
const certs = ref([])
const objOpen = ref(false)
const objChannel = ref(null)
const objHtml = ref('')
const sending = ref(false)
const qrEls = new Map()

const now = new Date().toISOString()
const caseId = computed(() => route.params.id)
const rule = computed(() => data.value?.rule || { conditions: [], materials: [], basis: [], warnings: [], score: 0 })
const docs = computed(() => data.value?.docs || [])
const currentDoc = computed(() => docs.value.find(d => d.key === activeDoc.value))

const fmt = s => String(s || '').replace('T', ' ').slice(0, 16)
const fmtc = s => String(s || '').slice(0, 10)
const stateType = s => ({ ok: 'success', warn: 'warning', bad: 'danger', idle: 'info' }[s] || 'info')
const stateLabel = s => ({ ok: '已同步', warn: '部分同步', bad: '未同步', idle: '待核验' }[s] || s)
const taskLabel = s => ({ todo: '待办', doing: '进行中', done: '已完成' }[s] || s)
const docStatus = key => {
  const d = docs.value.find(x => x.key === key)
  if (!d) return '未生成'
  return d.status === 'template' ? '模板' : '已定稿'
}

async function reload() {
  const r = await api.caseDetail(caseId.value)
  data.value = r
  const list = await api.certs(caseId.value)
  certs.value = list.items
  await nextTick()
  drawQrs()
}

function drawQrs() {
  for (const c of certs.value) {
    const el = qrEls.get(c.code)
    if (el) QRCode.toCanvas(el, `${location.origin}/verify?code=${c.code}`, { width: 96, margin: 1 })
  }
}

const setQr = (el, c) => { if (el) qrEls.set(c.code, el) }

async function rediagnose() {
  diagnosing.value = true
  try {
    const r = await api.diagnose(caseId.value)
    data.value.rule = r.diagnosis
    ElMessage.success(`诊断完成：${r.diagnosis.levelLabel}，完备度 ${r.diagnosis.score}`)
  } catch (e) { ElMessage.error(e.message) } finally { diagnosing.value = false }
}

async function polish() {
  polishing.value = true
  try {
    const r = await api.polish(caseId.value, activeDoc.value)
    if (r.ok) {
      data.value.docs = r.docs
      ElMessage.success('AI 润色完成，已保存定稿')
    } else ElMessage.warning(r.reason || 'AI 不可用，已保留模板')
  } catch (e) { ElMessage.error(e.message) } finally { polishing.value = false }
}

async function resetDoc() {
  try {
    await ElMessageBox.confirm('将丢弃当前修改，恢复为系统模板，确定？', '恢复模板')
    const r = await api.resetDoc(caseId.value, activeDoc.value)
    data.value.docs = r.docs
    ElMessage.success('已恢复模板')
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.message) }
}

function exportPdf() {
  window.open(`/api/pdf/doc?case=${caseId.value}&key=${activeDoc.value}`, '_blank')
}

async function doCheck() {
  checking.value = true
  try {
    const r = await api.docCheck(caseId.value)
    checkResult.value = r.check
    ElMessage.success(`一致性校验 ${r.check.score} 分`)
  } catch (e) { ElMessage.error(e.message) } finally { checking.value = false }
}

async function toggleTask(t, v) {
  try {
    await api.taskStatus(t.id, v ? 'done' : 'todo')
    t.status = v ? 'done' : 'todo'
  } catch (e) { ElMessage.error(e.message) }
}

async function doRescan() {
  scanning.value = true
  try {
    const r = await api.rescan(caseId.value)
    data.value.channels = r.latest.channels
    ElMessage.success(`巡检完成，${r.run.diffs} 个渠道状态变化`)
  } catch (e) { ElMessage.error(e.message) } finally { scanning.value = false }
}

async function openObjection(c) {
  objChannel.value = c
  objOpen.value = true
  objHtml.value = '<div class="muted">生成中…</div>'
  try {
    const r = await api.objectionPreview(caseId.value, c.channel_code)
    objHtml.value = r.html
  } catch (e) { objHtml.value = `<div class="muted">${e.message}</div>` }
}

async function sendObjection() {
  sending.value = true
  try {
    await api.sendObjection(caseId.value, objChannel.value.channel_code)
    ElMessage.success('异议函已生成并记录，等待平台答复（承诺 3 个工作日）')
    objOpen.value = false
    await reload()
  } catch (e) { ElMessage.error(e.message) } finally { sending.value = false }
}

async function issue() {
  issuing.value = true
  try {
    await api.issueCert(caseId.value)
    const list = await api.certs(caseId.value)
    certs.value = list.items
    await nextTick()
    drawQrs()
    ElMessage.success('凭证已签发')
  } catch (e) { ElMessage.error(e.message) } finally { issuing.value = false }
}

function openVerify(code) { window.open(`/verify?code=${code}`, '_blank') }
function downloadCert(code) { window.open(`/api/pdf/cert?code=${code}`, '_blank') }

watch(tab, t => router.replace({ query: { ...route.query, tab: t } }))

onMounted(async () => {
  await reload()
  try { aiOn.value = (await api.aiStatus()).available } catch { aiOn.value = false }
})
</script>

<style scoped>
.case-tabs :deep(.el-tabs__header) { margin-bottom: 18px; }
.case-tabs :deep(.el-tabs__item) { font-size: 14px; }
</style>
