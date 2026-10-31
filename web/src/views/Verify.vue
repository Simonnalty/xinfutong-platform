<template>
  <div class="verify-wrap">
    <div class="verify-card">
      <div class="spread">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1FA69B,#37C2B4);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">信</div>
          <div>
            <div style="font-weight:600;letter-spacing:1px">信复通 · 凭证核验</div>
            <div class="muted tiny">Credit Restoration Certificate Verify</div>
          </div>
        </div>
        <el-tag size="small" effect="plain">公开核验 · 无需登录</el-tag>
      </div>

      <div style="margin-top:22px" class="row">
        <el-input v-model="code" placeholder="输入凭证编号，如 XF-C-XXXXXXXXXXXX" size="large" style="flex:1" @keyup.enter="lookup" />
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

      <div v-if="result?.enterprise" class="card card-pad" style="margin-top:6px">
        <div class="card-title"><span class="bar"></span>凭证内容</div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="企业名称">{{ result.enterprise.name }}</el-descriptions-item>
          <el-descriptions-item label="统一社会信用代码">{{ result.enterprise.creditCode }}</el-descriptions-item>
          <el-descriptions-item label="法定代表人">{{ result.enterprise.legal }}</el-descriptions-item>
          <el-descriptions-item label="修复事项">{{ result.case.event }}</el-descriptions-item>
          <el-descriptions-item label="决定机关">{{ result.case.authority }}</el-descriptions-item>
          <el-descriptions-item label="决定文号">{{ result.case.docNo }}</el-descriptions-item>
          <el-descriptions-item label="列入日期">{{ result.case.listedDate }}</el-descriptions-item>
          <el-descriptions-item label="移出日期">{{ result.case.removedDate || '—' }}</el-descriptions-item>
          <el-descriptions-item label="凭证编号">{{ result.certificate.code }}</el-descriptions-item>
          <el-descriptions-item label="有效期至">{{ result.certificate.validUntil }}</el-descriptions-item>
          <el-descriptions-item label="内容摘要" :span="2">
            <span class="mono">{{ result.certificate.digest }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="前序摘要" :span="2">
            <span class="mono">{{ result.certificate.prevHash }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="muted tiny" style="margin-top:14px;line-height:1.8">
          核验原理：平台按数据库当前数据重算摘要，与凭证签发时的摘要比对；一致说明内容未被篡改。
          本平台仅证明「数据与存证一致」，不替代行政机关作出的决定。
        </div>
      </div>

      <div v-if="!result && !loading" class="center" style="padding:40px 0">
        <el-empty description="输入凭证编号开始核验" :image-size="90" />
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
  valid: '凭证有效', revoked: '凭证已撤销', tampered: '内容可能被篡改',
  expired: '凭证已过期', notfound: '未找到凭证'
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
