import { reactive } from 'vue'
import { api } from './api.js'

export const store = reactive({
  user: null,
  enterprises: [],
  enterpriseId: null,
  loading: true
})

export async function bootstrap() {
  store.loading = true
  try {
    const me = await api.me()
    store.user = me.user || null
    if (store.user) {
      await refreshEnterprises()
    }
  } catch {
    store.user = null
  } finally {
    store.loading = false
  }
  return store.user
}

export async function login(phone, password) {
  const r = await api.login(phone, password)
  store.user = r.user
  store.enterpriseId = null
  await refreshEnterprises()
  return r.user
}

export async function logout() {
  try { await api.logout() } catch { /* 忽略 */ }
  store.user = null
  store.enterprises = []
  store.enterpriseId = null
}

export function currentEnterprise() {
  return store.enterprises.find(e => e.id === store.enterpriseId) || store.enterprises[0] || null
}

export async function refreshEnterprises(preferredId = store.enterpriseId) {
  const list = await api.enterprises()
  store.enterprises = list.items || []
  store.enterpriseId = store.enterprises.some(e => e.id === preferredId) ? preferredId : store.enterprises[0]?.id || null
}
