'use strict';
/*
 * 权限边界回归测试（工作包 A）
 * 用法：先启动服务（node server.js），再执行 `node tests/guards.test.js`
 * 覆盖：注册提权、企业越权、机构无授权、只读成员写操作、授权撤销即时生效
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8790';
let pass = 0, fail = 0;

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra); }
}

async function req(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: r.status, data, cookie: (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ') };
}

async function login(phone) {
  const r = await req('/api/auth/login', { method: 'POST', body: { phone, password: 'xft2026' } });
  if (!r.cookie) throw new Error('登录失败 ' + phone + ' ' + JSON.stringify(r.data));
  return r.cookie;
}

(async () => {
  console.log('\n[1] 公开注册不得提权');
  const phone = '139' + String(Date.now()).slice(-8);
  const reg = await req('/api/auth/register', { method: 'POST', body: { phone, password: 'xft2026', name: '测试', role: 'admin' } });
  ok('注册 role=admin 返回 enterprise', reg.data.user?.role === 'enterprise', JSON.stringify(reg.data));

  console.log('\n[2] 企业只能看自己的数据');
  const ent = await login('13907320001');
  const ents = await req('/api/enterprises', { cookie: ent });
  ok('企业账号企业数 = 2', ents.data.items?.length === 2, String(ents.data.items?.length));
  const cross = await req('/api/cases/XF-2026-000298', { cookie: ent });
  ok('读取他企业案件被拒（403）', cross.status === 403, String(cross.status));

  console.log('\n[3] 只读成员不能写');
  const staff = await login('13907320003');
  const read = await req('/api/cases/XF-2026-000437', { cookie: staff });
  ok('成员可读本企业案件', read.status === 200, String(read.status));
  const issue = await req('/api/cases/XF-2026-000437/certificates', { method: 'POST', cookie: staff, body: {} });
  ok('成员签发凭证被拒（403）', issue.status === 403, String(issue.status));
  const saveDoc = await req('/api/cases/XF-2026-000437/docs/apply', { method: 'POST', cookie: staff, body: { html: '<p>改</p>' } });
  ok('成员保存文书被拒（403）', saveDoc.status === 403, String(saveDoc.status));

  console.log('\n[4] 机构只看被授权的企业');
  const org = await login('13907320002');
  const orgEnts = await req('/api/enterprises', { cookie: org });
  ok('机构可见 4 家（授权范围内）', orgEnts.data.items?.length === 4, String(orgEnts.data.items?.length));
  const granted = await req('/api/cases/XF-2026-000437', { cookie: org });
  ok('机构可读已授权企业案件', granted.status === 200, String(granted.status));
  const denied = await req('/api/cases/XF-2026-000240', { cookie: org });
  ok('机构读未授权企业被拒（403）', denied.status === 403, String(denied.status));
  const orgIssue = await req('/api/cases/XF-2026-000437/certificates', { method: 'POST', cookie: org, body: {} });
  ok('机构只读授权不能签发（403）', orgIssue.status === 403, String(orgIssue.status));

  console.log('\n[5] 撤销授权立即生效');
  const mysql = require('mysql2/promise');
  const config = require('../src/config.js');
  const conn = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database });
  await conn.execute('UPDATE org_enterprises SET revoked_at = NOW() WHERE enterprise_id = 1');
  const afterRevoke = await req('/api/cases/XF-2026-000437', { cookie: org });
  ok('撤销后立即拒绝（403）', afterRevoke.status === 403, String(afterRevoke.status));
  const orgEnts2 = await req('/api/enterprises', { cookie: org });
  ok('撤销后列表同步减少', orgEnts2.data.items?.length === 3, String(orgEnts2.data.items?.length));
  await conn.execute('UPDATE org_enterprises SET revoked_at = NULL WHERE enterprise_id = 1');
  const restored = await req('/api/cases/XF-2026-000437', { cookie: org });
  ok('恢复授权后又能读', restored.status === 200, String(restored.status));
  await conn.end();

  console.log('\n[6] 负责人可以签发');
  const owner = await req('/api/cases/XF-2026-000437/certificates', { method: 'POST', cookie: ent, body: {} });
  ok('负责人签发成功（200）', owner.status === 200, JSON.stringify(owner.data).slice(0, 120));

  console.log('\n[7] 运营可跨企业访问');
  const admin = await login('18600000000');
  const adminAll = await req('/api/cases/XF-2026-000298', { cookie: admin });
  ok('运营可读任意企业案件', adminAll.status === 200, String(adminAll.status));


  console.log('\n[8] 状态机：非法跳转与前置条件');
  const illegal = await req('/api/cases/XF-2026-000437/stage', { method: 'POST', cookie: ent, body: { to: 'draft' } });
  ok('审核中不能直接变草稿（400）', illegal.status === 400, String(illegal.status));
  const staffAdvance = await req('/api/cases/XF-2026-000437/stage', { method: 'POST', cookie: staff, body: { to: 'repaired' } });
  ok('只读成员不能推进阶段（403）', staffAdvance.status === 403, String(staffAdvance.status));
  const d1 = await req('/api/cases/XF-2026-000352/stage', { method: 'POST', cookie: admin, body: { to: 'diagnosed' } });
  ok('草稿 → 已诊断', d1.status === 200, JSON.stringify(d1.data).slice(0, 80));
  const d2 = await req('/api/cases/XF-2026-000352/stage', { method: 'POST', cookie: admin, body: { to: 'materials_ready' } });
  ok('已诊断 → 材料就绪', d2.status === 200, JSON.stringify(d2.data).slice(0, 80));
  const d3 = await req('/api/cases/XF-2026-000352/stage', { method: 'POST', cookie: admin, body: { to: 'submitted' } });
  ok('条件不满足时禁止提交（400）', d3.status === 400 && /不满足提交条件/.test(d3.data.error || ''), JSON.stringify(d3.data).slice(0, 120));
  const conn2 = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database });
  await conn2.execute("UPDATE cases SET stage = 'draft', progress = 0 WHERE id = 'XF-2026-000352'");
  await conn2.execute("DELETE FROM timeline_events WHERE case_id = 'XF-2026-000352' AND action LIKE '状态变更%'");
  await conn2.end();

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
