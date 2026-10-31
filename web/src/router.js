import { createRouter, createWebHistory } from 'vue-router'
import { bootstrap, store } from './store.js'

const routes = [
  { path: '/', redirect: '/app' },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue'), meta: { public: true } },
  { path: '/verify', name: 'verify', component: () => import('./views/Verify.vue'), meta: { public: true } },
  {
    path: '/app',
    component: () => import('./views/Layout.vue'),
    children: [
      { path: '', redirect: '/app/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/Dashboard.vue') },
      { path: 'case/:id', name: 'case', component: () => import('./views/CaseDetail.vue') },
      { path: 'knowledge', name: 'knowledge', component: () => import('./views/Knowledge.vue') },
      { path: 'admin', name: 'admin', component: () => import('./views/Admin.vue') }
    ]
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

let booted = false
router.beforeEach(async to => {
  if (!booted) { await bootstrap(); booted = true }
  if (to.meta.public) return true
  if (!store.user) return { name: 'login', query: { redirect: to.fullPath } }
  return true
})
