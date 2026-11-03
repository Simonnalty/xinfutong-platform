<template>
  <div class="layout">
    <aside class="sidebar">
      <AppNavigation :menus="menus" />
    </aside>
    <el-drawer v-model="navigationOpen" direction="ltr" size="min(292px, 86vw)" title="导航菜单"
      class="mobile-navigation" append-to-body>
      <AppNavigation :menus="menus" @navigate="navigationOpen = false" />
    </el-drawer>

    <div class="main">
      <header class="topbar">
        <el-button class="mobile-menu-toggle" text aria-label="打开导航菜单" :aria-expanded="navigationOpen"
          @click="navigationOpen = true"><el-icon :size="23"><Menu /></el-icon></el-button>
        <div class="crumb">
          <span class="muted">当前企业</span>
          <el-select v-model="store.enterpriseId" aria-label="当前企业" size="small" style="width:220px;margin-left:8px" @change="onSwitch">
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
                <div class="dd-head">
                  <div class="dd-name">{{ store.user?.name || '未登录' }}</div>
                  <div class="dd-sub">{{ roleLabel }}<span v-if="store.user?.phone"> · {{ store.user.phone }}</span></div>
                </div>
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { api } from '../api.js'
import { logout, store } from '../store.js'
import AppNavigation from '../components/AppNavigation.vue'

const router = useRouter()
const route = useRoute()
const aiOn = ref(null)
const navigationOpen = ref(false)
watch(() => route.fullPath, () => { navigationOpen.value = false })
const desktopMedia = window.matchMedia('(min-width: 981px)')
function onViewportChange(e) { if (e.matches) navigationOpen.value = false }
onMounted(() => desktopMedia.addEventListener('change', onViewportChange))
onUnmounted(() => desktopMedia.removeEventListener('change', onViewportChange))

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
  background: #f1f3e9;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.7;
}
.submit-notice .txt { flex: 1; }
.submit-notice strong { color: var(--ink); }
.submit-notice .link { color: var(--ink); text-decoration: none; white-space: nowrap; font-weight: 500; }
.submit-notice .link:hover { text-decoration: underline; }

@media (max-width: 680px) {
  .submit-notice { align-items: flex-start; gap: 7px; padding: 8px 12px; font-size: 12px; line-height: 1.8; }
  .submit-notice .link { white-space: normal; }
}
</style>
