<template>
  <div class="verify-wrap">
    <div class="verify-card">
      <div class="spread verify-head">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:3px;background:var(--teal);display:flex;align-items:center;justify-content:center;color:#fff"><el-icon :size="18"><DocumentChecked /></el-icon></div>
          <div>
            <div style="font-weight:600;letter-spacing:1px">信复通 · 办理进度记录核对</div>
            <div class="muted tiny">Credit Restoration Progress Record</div>
          </div>
        </div>
        <el-tag size="small" effect="plain">公开核验 · 无需登录</el-tag>
      </div>

      <div style="margin-top:22px" class="row verify-search">
        <el-input v-model="code" placeholder="输入记录编号，如 XF-C-XXXXXXXXXXXX" size="large" style="flex:1" @keyup.enter="lookup" />
        <el-button type="primary" size="large" :loading="loading" @click="lookup">核验</el-button>
      </div>

      <div v-if="result" :class="['verify-state', result.state]">
        <el-icon :size="26">
          <component :is="result.state === 'valid' ? 'CircleCheckFilled' : result.state === 'revoked' || result.state === 'tampered' ? 'CircleCloseFilled' : 'WarningFilled'" />
        </el-icon>
        <div>
          <div style="font-size:16px;font-weight:600">{{ stateText }}</div>
          <div style="font-size:12px;opacity:.85;margin-top:2px">{{ result.message }}</div>
        </div>
      </div>

      <div v-if="result?.enterprise" class="card card-pad verify-record" style="margin-top:6px">
        <div class="card-title"><span class="bar"></span>记录内容</div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="企业名称">{{ result.enterprise.name }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">{{ result.enterprise.creditCode }}</el-descriptions-item>

          <el-descriptions-item label="修复事项">{{ result.case.event }}</el-descriptions-item>
          <el-descriptions-item label="决定机关">{{ result.case.authority }}</el-descriptions-item>
          <el-descriptions-item label="决定文号">{{ result.case.docNo }}</el-descriptions-item>
          <el-descriptions-item label="列入日期">{{ result.case.listedDate }}</el-descriptions-item>
          <el-descriptions-item label="移出日期">{{ result.case.removedDate || '—' }}</el-descriptions-item>
          <el-descriptions-item label="记录编号">{{ result.certificate.code }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{ result.certificate.validUntil }}</el-descriptions-item>
        </el-descriptions>
        <el-collapse class="verify-fingerprints">
          <el-collapse-item title="查看记录校验信息（数字指纹）" name="fingerprints">
            <p class="muted tiny">数字指纹用于核对记录是否被改动，由字母和数字组成，不是文字概述。</p>
            <div class="tiny">记录数字指纹（SHA-256）</div>
            <p class="mono">{{ result.certificate.digest }}</p>
            <div class="tiny">前序记录指纹</div>
            <p v-if="!result.certificate.prevHash || /^0+$/.test(result.certificate.prevHash)" class="muted tiny">首条记录，暂无前序记录。</p>
            <p v-else class="mono">{{ result.certificate.prevHash }}</p>
          </el-collapse-item>
        </el-collapse>
        <div v-if="result.officialProof" class="muted tiny" style="margin-top:12px">依据：{{ result.officialProof.reviewType }}</div>
        <div v-for="c in result.channels" :key="c.name" class="muted tiny">{{ c.name }} · {{ c.provider }} · {{ c.state }} · {{ c.checkedAt || '未核验' }}</div>
        <div class="muted tiny" style="margin-top:14px;line-height:1.9">
          <strong>这不是修复证明。</strong>本页只能证明「页面内容与平台留存的记录一致」：记录生成时是什么内容，现在还是什么内容，没有被改动过。
          它<strong>不能</strong>证明失信信息已经修复，<strong>不能</strong>作为征信报告、资信证明或投标资格证明使用。
        </div>
        <div class="muted tiny" style="margin-top:10px;line-height:1.9">
          能证明已修复的，只有作出决定的行政机关出具的《信用修复决定书》或移出决定，以及「信用中国」上的实际公示状态。
          需要确认是否真的修复，请以官方渠道为准。平台不能提交申请，也不对办理结果作任何承诺。
        </div>
        <div class="muted tiny" style="margin-top:10px;line-height:1.9">
          核验原理：平台核验生成时的不可变快照与签名，签名同时覆盖版本和核对有效期；企业后续改档不覆盖历史记录。
        </div>
      </div>

      <div v-if="!result && !loading" class="center" style="padding:40px 0">
        <el-empty description="输入记录编号开始核对" :image-size="90" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../api.js'

const route = useRoute()
const code = ref(String(route.query.code || ''))
const loading = ref(false)
const result = ref(null)

const stateText = computed(() => ({
  valid: '记录内容一致', revoked: '记录已作废', tampered: '内容可能被改动',
  expired: '核对有效期已过', notfound: '未找到该记录', stale:'依据已更新，请重新生成',legacy:'旧版记录需重新生成'
}[result.value?.state] || '未知状态'))

async function lookup() {
  if (!code.value.trim()) return
  loading.value = true
  try {
    const r = await api.verify(code.value.trim())
    result.value = r.result
  } catch (e) {
    result.value = { state: 'notfound', message: e.message }
  } finally { loading.value = false }
}

onMounted(() => { if (code.value) lookup() })
</script>

<style scoped>
.verify-head { align-items: flex-start; }
.verify-fingerprints { margin-top: 16px; }
.verify-fingerprints p { margin: 8px 0 14px; }
.verify-fingerprints :deep(.el-collapse-item__header) { line-height: 1.6; text-align: left; }
.verify-record :deep(.el-descriptions__label) { width: 118px; white-space: nowrap; }
.verify-record :deep(.el-descriptions__content) { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
.verify-record .mono { display: block; overflow-wrap: anywhere; word-break: break-word; line-height: 1.55; }
@media (max-width: 600px) {
  .verify-card { padding: 18px 12px; border-radius: 12px; }
  .verify-head { gap: 10px; flex-wrap: wrap; }
  .verify-head > :last-child { flex: 0 0 auto; }
  .verify-head .muted { max-width: 170px; overflow-wrap: anywhere; }
  .verify-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .verify-search .el-input, .verify-search .el-button { min-width: 0; }
  .verify-state { align-items: flex-start; padding: 14px; margin: 14px 0; }
  .verify-state > div { min-width: 0; overflow-wrap: anywhere; }
  .verify-record { padding: 14px 10px; }
  .verify-record :deep(.el-descriptions__label) { width: 96px; padding: 8px 7px; }
  .verify-record :deep(.el-descriptions__content) { padding: 8px 7px; }
}
</style>
