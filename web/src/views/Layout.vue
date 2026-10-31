<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">信</div>
        <div>
          <div class="name">信复通</div>
          <div class="slogan">民营企业信用修复平台</div>
        </div>
      </div>

      <nav class="side-nav">
        <div v-for="m in menus" :key="m.path" class="side-item"
             :class="{ active: isActive(m) }" @click="go(m)">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.label }}</span>
        </div>
      </nav>

      <div class="side-foot">
        <div>演示数据 · v2.0</div>
        <div style="margin-top:4px">不代办 · 不承诺结果</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <span class="muted">当前企业</span>
          <el-select v-model="store.enterpriseId" size="small" style="width:220px;margin-left:8px" @change="onSwitch">
            <el-option v-for="e in store.enterprises" :key="e.id" :label="e.name" :value="e.id" />
          </el-select>
        </div>
        <div class="right">
          <el-tag v-if="aiOn === false" type="info" size="small" effect="plain">AI 未配置 · 模板模式</el-tag>
          <el-tooltip content="验真页" placement="bottom">
            <el-button text :icon="Search" @click="openVerify">核验</el-button>
          </el-tooltip>
          <el-dropdown @command="onUser">
            <div style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <div class="avatar">{{ (store.user?.name || '用')[0] }}</div>
              <span style="font-size:13px">{{ store.user?.name || '未登录' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="role" disabled>{{ roleLabel }}</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <!-- 全平台常驻提示：平台不是提交入口。这条必须一直在，不能做成可关闭的弹窗 -->
      <div class="submit-notice">
        <el-icon :size="15"><WarningFilled /></el-icon>
        <span class="txt">
          <strong>本平台不能提交信用修复申请。</strong>
          唯一受理渠道是「信用中国」及作出决定的行政机关；平台只做等级判断、材料备料与进度记录，不代办、不代提交、不承诺结果。
        </span>
        <a class="link" href="https://www.creditchina.gov.cn" target="_blank" rel="noopener noreferrer">前往信用中国 →</a>
      </div>

      <router-view v-slot="{ Component }">
        <component :is="Component" :key="$route.path" />
      </router-view>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { api } from '../api.js'
import { logout, store } from '../store.js'

const router = useRouter()
const route = useRoute()
const aiOn = ref(null)

const menus = computed(() => {
  const base = [
    { path: '/app/dashboard', label: '工作台', icon: 'HomeFilled' },
    { path: '/app/knowledge', label: '合规知识库', icon: 'Reading' }
  ]
  base.push({path:'/app/notices',label:'合规提醒',icon:'Bell'})
  base.push({ path:'/app/collaboration',label:'企业协作授权',icon:'Connection' })
  if (['org','admin'].includes(store.user?.role)) base.push({path:'/app/organization',label:'机构工作台',icon:'OfficeBuilding'})
  if (store.user?.role === 'admin') base.push({ path: '/app/admin', label: '平台运营', icon: 'Setting' })
  return base
})

const roleLabel = computed(() => ({ enterprise: '企业账号', org: '机构账号', admin: '平台运营' }[store.user?.role] || ''))

function isActive(m) {
  return route.path === m.path || (m.path.includes('dashboard') && route.path.startsWith('/app/case'))
}
function go(m) { router.push(m.path) }
function onSwitch() { router.push('/app/dashboard') }
function openVerify() { window.open('/verify', '_blank') }

async function onUser(cmd) {
  if (cmd === 'logout') {
    await ElMessageBox.confirm('确定退出登录？', '提示', { type: 'warning' })
    await logout()
    router.replace('/login')
  }
}

onMounted(async () => {
  try { aiOn.value = (await api.aiStatus()).available } catch { aiOn.value = null }
})
</script>

<style scoped>
.submit-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 22px;
  background: #FFF8E6;
  border-bottom: 1px solid #F0DFB8;
  color: #7A5A18;
  font-size: 12.5px;
  line-height: 1.7;
}
.submit-notice .txt { flex: 1; }
.submit-notice strong { color: #8A5A0B; }
.submit-notice .link { color: #8A5A0B; text-decoration: none; white-space: nowrap; font-weight: 500; }
.submit-notice .link:hover { text-decoration: underline; }
</style>
