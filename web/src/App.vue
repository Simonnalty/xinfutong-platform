<template>
  <router-view v-if="!store.loading" />
  <div v-else class="boot">
    <div class="logo">信</div>
    <div class="txt">信复通 · 正在加载</div>
  </div>
</template>

<script setup>
import { store } from './store.js'
</script>

<style scoped>
.boot { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #0F2A44; color: #fff; }
.boot .logo { width: 54px; height: 54px; border-radius: 14px; background: linear-gradient(135deg, #1FA69B, #37C2B4); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; }
.boot .txt { color: #9FB4C6; font-size: 13px; letter-spacing: 2px; }
</style>
