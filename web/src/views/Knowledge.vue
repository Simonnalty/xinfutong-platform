<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1>合规知识库</h1>
        <div class="sub">法规原文、办理指引与常见问题 —— 修复之后继续合规经营</div>
      </div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="法规政策" name="policy">
        <div v-for="p in policies" :key="p.id" class="card card-pad" style="margin-bottom:14px">
          <div class="spread">
            <div style="font-size:15px;font-weight:600">{{ p.title }}</div>
            <el-tag size="small" effect="plain">{{ p.issuer }}</el-tag>
          </div>
          <div class="muted tiny" style="margin:8px 0">
            发布 {{ p.published_at }} · 施行 {{ p.effective_at }} · {{ p.tags }}
          </div>
          <div style="font-size:13px;line-height:1.9;color:#33475b">{{ p.summary }}</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="办理指引" name="guide">
        <div class="card card-pad" style="margin-bottom:14px">
          <div class="card-title"><span class="bar"></span>信用修复五步法</div>
          <el-steps :active="5" align-center finish-status="success">
            <el-step title="判定等级" description="确认失信类型与最短公示期" />
            <el-step title="准备材料" description="申请书、承诺书、整改说明" />
            <el-step title="提交申请" description="属地市场监管部门线上/窗口" />
            <el-step title="跟踪审核" description="15 个工作日内作出决定" />
            <el-step title="核验同步" description="检查各平台是否已更新" />
          </el-steps>
        </div>
        <div v-for="a in articles" :key="a.id" class="card card-pad" style="margin-bottom:14px">
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">{{ a.title }}</div>
          <div style="font-size:13px;line-height:1.95;color:#33475b">{{ a.body }}</div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="风险提示" name="risk">
        <el-alert type="error" :closable="false" show-icon style="margin-bottom:12px"
          title="警惕「信用修复中介」诈骗"
          description="信用修复不收取任何费用，也不存在「内部渠道」「包过」。凡声称付费可删除失信记录、加急修复的，均为诈骗，可向市场监管部门或公安机关举报。" />
        <el-alert type="warning" :closable="false" show-icon style="margin-bottom:12px"
          title="修复不等于删除"
          description="原始失信信息仍留存于行政系统内部，修复的是对外公示与惩戒措施。修复后再次发生同类失信，将被从重处理。" />
        <el-alert type="info" :closable="false" show-icon
          title="年报不要忘"
          description="每年 1 月 1 日至 6 月 30 日需报送上一年度年度报告，逾期将被列入经营异常名录——这是最常见的失信来源。" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from '../api.js'

const tab = ref('policy')
const policies = ref([])
const articles = ref([])

onMounted(async () => {
  const r = await api.kb()
  policies.value = r.policies
  articles.value = r.articles
})
</script>
