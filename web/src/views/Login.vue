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
          监测多平台同步、出具可扫码核验的数字凭证 —— 全程留痕，不代办、不承诺结果。
        </p>
        <div class="login-feats">
          <div class="login-feat" v-for="f in feats" :key="f.t">
            <div class="t">{{ f.t }}</div>
            <div class="d">{{ f.d }}</div>
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:#6E8598">
        本平台数据为演示数据 · 法规参数以属地主管部门口径为准
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
        <div class="demo-accounts">
          演示账号（密码均为 <b>xft2026</b>）：<br />
          企业端 <b>13907320001</b>（负责人 · 可写）<br />
          机构端 <b>13907320002</b>（园区服务中心 · 只读）<br />
          只读成员 <b>13907320003</b>（同企业 · 不可写）<br />
          运营端 <b>18600000000</b>（平台运营）
        </div>
        <div style="margin-top:18px;font-size:13px" class="muted">
          没有账号？<el-link type="primary" @click="registerOpen = true">注册企业账号</el-link>
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
const form = reactive({ phone: '13907320001', password: 'xft2026' })
const loading = ref(false)
const error = ref('')
const registerOpen = ref(false)
const regLoading = ref(false)
const reg = reactive({ phone: '', name: '', password: '' })

const feats = [
  { t: '智能诊断', d: '按失信类型与等级判定可申请日、所需材料与法定时限' },
  { t: '材料工坊', d: '事实锁定、AI 只润色措辞，跨文书自动一致性校验' },
  { t: '同步监测', d: '多源渠道巡检，差异定位并可一键生成数据异议函' },
  { t: '数字凭证', d: '链式存证 + 扫码验真，银行与招标方可直接采信' }
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
