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

  collaboration: id=>request(`/api/enterprises/${id}/collaboration`),
  enterpriseMember: (id,body)=>request(`/api/enterprises/${id}/members`,{method:'POST',body}),
  enterpriseGrant: (id,body)=>request(`/api/enterprises/${id}/grants`,{method:'POST',body}),
  orgWorkspace: ()=>request('/api/org/workspace'),
  batchMonitor: case_ids=>request('/api/org/batch-monitor',{method:'POST',body:{case_ids}}),
  orgMembers: id=>request(`/api/orgs/${id}/members`),
  orgMember: (id,body)=>request(`/api/orgs/${id}/members`,{method:'POST',body}),
  createOrg: body=>request('/api/admin/orgs',{method:'POST',body}),
  enterprises: () => request('/api/enterprises'),
  createEnterprise: body => request('/api/enterprises', {method:'POST',body}),
  updateEnterprise: (id,body) => request(`/api/enterprises/${id}`, {method:'PATCH',body}),
  createCase: (id,body) => request(`/api/enterprises/${id}/cases`, {method:'POST',body}),
  caseTypes: () => request('/api/case-types'),
  overview: (id) => request(`/api/enterprises/${id}/overview`),
  evidence: id => request(`/api/cases/${id}/evidence`),
  uploadEvidence: (id,body) => request(`/api/cases/${id}/evidence`,{method:'POST',body}),
  evidenceAction: (id,action,note) => request(`/api/evidence/${id}/${action}`,{method:'POST',body:{note}}),
  caseDetail: (id) => request(`/api/cases/${id}`),
  diagnose: (id) => request(`/api/cases/${id}/diagnose`, { method: 'POST' }),
  docs: (id) => request(`/api/cases/${id}/docs`),
  saveDoc: (id, key, html, source = 'manual') =>
    request(`/api/cases/${id}/docs/${key}`, { method: 'POST', body: { html, source } }),
  docVersions: (id,key) => request(`/api/cases/${id}/docs/${key}/versions`),
  restoreDoc: (id,key,version) => request(`/api/cases/${id}/docs/${key}/restore`, {method:'POST',body:{version}}),
  resetDoc: (id, key) => request(`/api/cases/${id}/docs/${key}/reset`, { method: 'POST' }),
  polish: (id, key) => request(`/api/cases/${id}/docs/${key}/polish`, { method: 'POST' }),
  docCheck: (id,key) => request(`/api/cases/${id}/doc-check`, { method: 'POST',body:{key} }),
  rescan: (id) => request(`/api/cases/${id}/rescan`, { method: 'POST' }),
  facts: (id, body) => request(`/api/cases/${id}/facts`, { method: 'PATCH', body }),
  stage: (id, to, note, evidence_id) => request(`/api/cases/${id}/stage`, { method: 'POST', body: { to, note, evidence_id } }),
  recordChannel: (id,body)=>request(`/api/cases/${id}/channels/record`,{method:'POST',body}),
  objections: id=>request(`/api/cases/${id}/objections`),
  objectionSupplement: (id,body)=>request(`/api/objections/${id}/supplement`,{method:'POST',body}),
  objectionFollowup: (id,body)=>request(`/api/objections/${id}/followup`,{method:'POST',body}),
  objectionTransition: (id,body)=>request(`/api/objections/${id}/transition`,{method:'POST',body}),
  schedule: (id,body)=>request(`/api/cases/${id}/schedule`,{method:'POST',body}),
  scheduleInfo: id=>request(`/api/cases/${id}/schedule`),
  ruleVersions: ()=>request('/api/admin/rule-versions'),
  createRuleVersion: body=>request('/api/admin/rule-versions',{method:'POST',body}),
  revokeCert: (code,reason)=>request(`/api/certificates/${code}/revoke`,{method:'POST',body:{reason}}),
  channels: (id) => request(`/api/cases/${id}/channels`),
  objectionPreview: (id, channel) => request(`/api/cases/${id}/objection/preview?channel=${channel}`),
  sendObjection: (id, channel) => request(`/api/cases/${id}/objection`, { method: 'POST', body: { channel } }),
  issueCert: (id) => request(`/api/cases/${id}/certificates`, { method: 'POST' }),
  certs: (id) => request(`/api/cases/${id}/certificates`),
  shares: id=>request(`/api/cases/${id}/shares`),
  createShare: (id,body)=>request(`/api/cases/${id}/shares`,{method:'POST',body}),
  revokeShare: id=>request(`/api/shares/${id}/revoke`,{method:'POST',body:{}}),
  publicShare: query=>request(query.token?`/api/share/${encodeURIComponent(query.token)}`:`/api/share-file/${encodeURIComponent(query.file||'')}`),
  verify: (code) => request(`/api/verify/${encodeURIComponent(code)}`),
  aiStatus: () => request('/api/ai/status'),
  kb: (query={}) => request('/api/kb?'+new URLSearchParams(query)),
  adminKnowledge: ()=>request('/api/admin/knowledge'),
  createKnowledge: body=>request('/api/admin/knowledge',{method:'POST',body}),
  reminderSettings: id=>request(`/api/enterprises/${id}/reminders`),
  configureReminders: (id,body)=>request(`/api/enterprises/${id}/reminders`,{method:'POST',body}),
  notices: id=>request(`/api/enterprises/${id}/notices`),
  readNotice: id=>request(`/api/notices/${id}/read`,{method:'POST',body:{}}),
  updateTask: (id,body)=>request(`/api/tasks/${id}`,{method:'PATCH',body}),
  taskStatus: (id, status) => request(`/api/tasks/${id}/status`, { method: 'POST', body: { status } }),
  adminStats: () => request('/api/admin/stats'),
  adminRules: () => request('/api/admin/rules'),
  adminAudit: () => request('/api/admin/audit'),
  adminOrgs: () => request('/api/admin/orgs')
}
