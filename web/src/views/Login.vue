<template>
  <div class="login-wrap">
    <div class="login-left">
      <div>
        <div class="brand" style="padding:0 0 40px">
          <div class="logo" style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#1FA69B,#37C2B4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px">信</div>
          <div>
            <div style="font-size:17px;font-weight:600;color:#fff;letter-spacing:1px">信复通</div>
            <div style="font-size:11px;color:#7E96AD">Credit Restoration Platform</div>
          </div>
        </div>
        <h1>让每一次信用修复<br />都有据可依、<em>有迹可循</em></h1>
        <p>
          面向民营企业的信用修复自助平台：从诊断失信等级、生成合规材料，到跟踪办理进度、
          监测多平台同步、留痕办理过程 —— 全程留痕，不代办、不代提交、不承诺结果。
        </p>
        <div class="login-note">
          <strong>平台不能提交信用修复申请。</strong>
          申请的唯一受理渠道是「信用中国」及作出决定的行政机关；平台只帮企业判断条件、备齐材料、记录进度。
        </div>
        <div class="login-feats">
          <div class="login-feat" v-for="f in feats" :key="f.t">
            <div class="t">{{ f.t }}</div>
            <div class="d">{{ f.d }}</div>
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:#6E8598">
        诊断需配置已复核规则 · 办理要求以主管部门公布口径为准 · 平台结论不替代行政决定
      </div>
    </div>

    <div class="login-right">
      <div class="login-form">
        <h2>登录</h2>
        <p class="tip">使用手机号登录企业工作台</p>
        <el-form :model="form" @submit.prevent="submit" label-position="top">
          <el-form-item label="手机号">
            <el-input v-model="form.phone" size="large" placeholder="请输入手机号" :prefix-icon="Iphone" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.password" type="password" size="large" show-password placeholder="请输入密码" :prefix-icon="Lock" @keyup.enter="submit" />
          </el-form-item>
          <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon style="margin-bottom:14px" />
          <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="submit">登 录</el-button>
        </el-form>
        <div style="margin-top:18px;font-size:13px" class="muted">
          没有账号？<el-link type="primary" @click="registerOpen = true">注册企业账号</el-link>
        </div>

        <el-divider style="margin:22px 0 14px"><span style="font-size:12px;color:#6E7A89">演示账号 · 点一下登录</span></el-divider>
        <div class="demo-accounts">
          <button v-for="d in demos" :key="d.phone" class="demo-item" type="button" @click="quick(d)">
            <span class="role">{{ d.role }}</span>
            <span class="phone">{{ d.phone }}</span>
            <span class="name">{{ d.name }}</span>
          </button>
        </div>
        <div style="margin-top:10px;font-size:12px;color:#6E7A89">
          统一密码 <code>xft2026</code> · 本平台数据为演示数据
        </div>
      </div>

      <el-dialog v-model="registerOpen" title="注册企业账号" width="420px">
        <el-form :model="reg" label-position="top">
          <el-form-item label="手机号"><el-input v-model="reg.phone" /></el-form-item>
          <el-form-item label="姓名"><el-input v-model="reg.name" /></el-form-item>
          <el-form-item label="密码（至少 6 位）"><el-input v-model="reg.password" type="password" show-password /></el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="registerOpen = false">取消</el-button>
          <el-button type="primary" :loading="regLoading" @click="doRegister">注册并登录</el-button>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Iphone, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api.js'
import { login } from '../store.js'

const router = useRouter()
const route = useRoute()
const form = reactive({ phone: '', password: '' })

const demos = [
  { role: '企业端', phone: '13907320001', name: '周立恒 · 恒基建材' },
  { role: '机构端', phone: '13907320002', name: '李雨桐 · 园区服务中心' },
  { role: '平台运营', phone: '18600000000', name: '平台运营' }
]

function quick(d) {
  form.phone = d.phone
  form.password = 'xft2026'
  submit()
}
const loading = ref(false)
const error = ref('')
const registerOpen = ref(false)
const regLoading = ref(false)
const reg = reactive({ phone: '', name: '', password: '' })

const feats = [
  { t: '智能诊断', d: '依据已复核规则和企业事实生成材料清单与办理提示' },
  { t: '材料工坊', d: '事实锁定、AI 只润色措辞，跨文书自动一致性校验' },
  { t: '同步监测', d: '区分人工核录与接入渠道，定位差异并生成异议草稿' },
  { t: '办理进度记录', d: '把办理过程留成可核对的记录，证明「内容没被改」而非「已经修复」' }
]

async function submit() {
  if (!form.phone || !form.password) { error.value = '请填写手机号和密码'; return }
  loading.value = true
  error.value = ''
  try {
    await login(form.phone, form.password)
    ElMessage.success('登录成功')
    router.replace(route.query.redirect || '/app/dashboard')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function doRegister() {
  regLoading.value = true
  try {
    await api.register({ ...reg })
    await login(reg.phone, reg.password)
    registerOpen.value = false
    router.replace('/app/dashboard')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    regLoading.value = false
  }
}
</script>
