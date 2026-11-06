<template>
  <div class="brand">
    <div class="logo"><el-icon :size="19"><DocumentChecked /></el-icon></div>
    <div><div class="name">信复通</div><div class="slogan">民营企业信用修复平台</div></div>
  </div>
  <nav class="side-nav" aria-label="主导航">
    <router-link v-for="m in menus" :key="m.path" :to="m.path" class="side-item"
      :class="{ active: isActive(m) }" :aria-current="isActive(m) ? 'page' : undefined" @click="$emit('navigate')">
      <el-icon><component :is="m.icon" /></el-icon><span>{{ m.label }}</span>
    </router-link>
  </nav>
  <div class="side-foot"><div>{{ workspaceLabel }}</div><div style="margin-top:4px">不代办 · 不承诺结果</div></div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { store } from '../store.js'
defineProps({ menus: { type: Array, required: true } })
defineEmits(['navigate'])
const route = useRoute()
const workspaceLabel = computed(() => ({ enterprise: '企业服务工作台', org: '机构协作工作台', admin: '平台运营工作台' }[store.user?.role] || '企业信用服务'))
const isActive = m => route.path === m.path || (m.path === '/app/dashboard' && route.path.startsWith('/app/case'))
</script>
