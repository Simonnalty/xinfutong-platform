const BASE = ''

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text } }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `请求失败（${res.status}）`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (phone, password) => request('/api/auth/login', { method: 'POST', body: { phone, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),

  enterprises: () => request('/api/enterprises'),
  overview: (id) => request(`/api/enterprises/${id}/overview`),
  caseDetail: (id) => request(`/api/cases/${id}`),
  diagnose: (id) => request(`/api/cases/${id}/diagnose`, { method: 'POST' }),
  docs: (id) => request(`/api/cases/${id}/docs`),
  saveDoc: (id, key, html, source = 'manual') =>
    request(`/api/cases/${id}/docs/${key}`, { method: 'POST', body: { html, source } }),
  resetDoc: (id, key) => request(`/api/cases/${id}/docs/${key}/reset`, { method: 'POST' }),
  polish: (id, key) => request(`/api/cases/${id}/docs/${key}/polish`, { method: 'POST' }),
  docCheck: (id) => request(`/api/cases/${id}/doc-check`, { method: 'POST' }),
  rescan: (id) => request(`/api/cases/${id}/rescan`, { method: 'POST' }),
  channels: (id) => request(`/api/cases/${id}/channels`),
  objectionPreview: (id, channel) => request(`/api/cases/${id}/objection/preview?channel=${channel}`),
  sendObjection: (id, channel) => request(`/api/cases/${id}/objection`, { method: 'POST', body: { channel } }),
  issueCert: (id) => request(`/api/cases/${id}/certificates`, { method: 'POST' }),
  certs: (id) => request(`/api/cases/${id}/certificates`),
  verify: (code) => request(`/api/verify/${encodeURIComponent(code)}`),
  aiStatus: () => request('/api/ai/status'),
  kb: () => request('/api/kb'),
  taskStatus: (id, status) => request(`/api/tasks/${id}/status`, { method: 'POST', body: { status } }),
  adminStats: () => request('/api/admin/stats'),
  adminRules: () => request('/api/admin/rules'),
  adminAudit: () => request('/api/admin/audit'),
  adminOrgs: () => request('/api/admin/orgs')
}
