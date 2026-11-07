'use strict';
/*
 * 账号与会话。
 *  - 口令 scrypt 加盐存储（见 crypto.js）
 *  - 会话令牌 32 字节随机，存 sessions 表，HttpOnly Cookie 承载
 *  - 权限只有三种角色：enterprise（企业）/ org（园区、代账）/ admin（平台运营）
 */
const db = require('../db.js');
const config = require('../config.js');
const { hashPassword, verifyPassword, newToken } = require('../crypto.js');

const ROLES = ['enterprise', 'org', 'admin'];

// 登录失败限流：同一手机号连续失败达到阈值后临时锁定（内存态，重启即清空）。
// 成功登录、锁定过期后自动解除；密码错误与账号不存在同样计数，避免探测手机号。
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MS = 15 * 60e3;
const loginAttempts = new Map(); // phone -> { count, lockedUntil }
function liveLoginAttempt(entry) {
  if (!entry) return null;
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil + LOGIN_LOCK_MS) return null;
  return entry;
}

async function register({ phone, password, name, role }) {
  if (!/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new Error('手机号格式不正确');
  if (String(password || '').length < 6) throw new Error('密码至少 6 位');
  const exists = await db.one('SELECT id FROM users WHERE phone = ?', [phone]);
  if (exists) throw new Error('该手机号已注册');
  const r = await db.run('INSERT INTO users (phone, pwd_hash, name, role) VALUES (?,?,?,?)',
    [phone, hashPassword(password), name || '', 'enterprise']);
  // 公开注册一律为普通企业账号：admin/org 只能由平台运营在后台分配，不接受客户端传入
  return { id: r.insertId, phone, name: name || '', role: 'enterprise' };
}

async function login({ phone, password, ip, ua }) {
  const key = String(phone || '');
  const entry = liveLoginAttempt(loginAttempts.get(key));
  if (entry) loginAttempts.set(key, entry); else loginAttempts.delete(key);
  if (entry && entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const mins = Math.max(1, Math.ceil((entry.lockedUntil - Date.now()) / 60e3));
    throw new Error(`登录尝试次数过多，请约 ${mins} 分钟后再试`);
  }
  const user = await db.one('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!user || !verifyPassword(password, user.pwd_hash)) {
    const next = entry || { count: 0, lockedUntil: 0 };
    next.count += 1;
    if (next.count >= LOGIN_LOCK_THRESHOLD) {
      next.lockedUntil = Date.now() + LOGIN_LOCK_MS;
      loginAttempts.set(key, next);
      throw new Error('登录尝试次数过多，账号已临时锁定 15 分钟');
    }
    loginAttempts.set(key, next);
    throw new Error('手机号或密码不正确');
  }
  loginAttempts.delete(key);
  if (user.status !== 'active') throw new Error('账号已被停用');
  const token = newToken();
  const expires = new Date(Date.now() + config.session.ttlDays * 86400e3);
  await db.run('INSERT INTO sessions (user_id, token, expires_at, ip, ua) VALUES (?,?,?,?,?)',
    [user.id, token, expires.toISOString().slice(0, 19).replace('T', ' '), ip || '', (ua || '').slice(0, 300)]);
  await db.run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  await db.run('INSERT INTO audit_logs (actor_id, action, target, ip) VALUES (?,?,?,?)',
    [user.id, 'login', 'session', ip || '']);
  return { token, expires, user: publicUser(user) };
}

function publicUser(u) {
  return { id: u.id, phone: u.phone, name: u.name, role: u.role };
}

async function resolve(token) {
  if (!token) return null;
  const row = await db.one(
    `SELECT u.id, u.phone, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'active'`, [token]);
  return row ? publicUser(row) : null;
}

async function logout(token) {
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

/** 当前账号能访问的企业 id 列表 */
async function enterprisesOf(user){
 if(user.role==='admin')return (await db.all('SELECT id,name,credit_code,legal,industry,region,scale FROM enterprises ORDER BY id')).map(e=>({...e,relation:'admin'}));
 const members=await db.all('SELECT e.id,e.name,e.credit_code,e.legal,e.industry,e.region,e.scale,m.role AS relation FROM enterprise_members m JOIN enterprises e ON e.id=m.enterprise_id WHERE m.user_id=? AND m.revoked_at IS NULL ORDER BY e.id',[user.id]);
 if(user.role!=='org')return members;
 const grants=await db.all("SELECT e.id,e.name,e.credit_code,e.legal,e.industry,e.region,e.scale,'org' AS relation,CASE WHEN MAX(oe.perm='write')=1 THEN 'write' ELSE 'read' END AS perm FROM org_enterprises oe JOIN org_members om ON om.org_id=oe.org_id JOIN orgs o ON o.id=oe.org_id AND o.status='active' JOIN enterprises e ON e.id=oe.enterprise_id WHERE om.user_id=? AND oe.revoked_at IS NULL GROUP BY e.id,e.name,e.credit_code,e.legal,e.industry,e.region,e.scale",[user.id]);
 const map=new Map(grants.map(e=>[e.id,e]));for(const e of members){const g=map.get(e.id);if(e.relation==='owner'||!g)map.set(e.id,e)}return [...map.values()].sort((a,b)=>a.id-b.id);
}
async function canAccess(user,id){
 if(!user)return false;if(user.role==='admin')return true;
 if(await db.one('SELECT 1 FROM enterprise_members WHERE user_id=? AND enterprise_id=? AND revoked_at IS NULL',[user.id,id]))return true;
 return user.role==='org'&&Boolean(await db.one("SELECT 1 FROM org_enterprises oe JOIN org_members om ON om.org_id=oe.org_id JOIN orgs o ON o.id=oe.org_id AND o.status='active' WHERE om.user_id=? AND oe.enterprise_id=? AND oe.revoked_at IS NULL",[user.id,id]));
}
async function canWrite(user,id){
 if(!user)return false;if(user.role==='admin')return true;
 if(await db.one("SELECT 1 FROM enterprise_members WHERE user_id=? AND enterprise_id=? AND role='owner' AND revoked_at IS NULL",[user.id,id]))return true;
 return user.role==='org'&&Boolean(await db.one("SELECT 1 FROM org_enterprises oe JOIN org_members om ON om.org_id=oe.org_id JOIN orgs o ON o.id=oe.org_id AND o.status='active' WHERE om.user_id=? AND oe.enterprise_id=? AND oe.perm='write' AND oe.revoked_at IS NULL",[user.id,id]));
}

async function audit(actorId, action, target, detail, ip) {
  await db.run('INSERT INTO audit_logs (actor_id, action, target, detail, ip) VALUES (?,?,?,?,?)',
    [actorId || null, action, target || null, (detail || '').slice(0, 500), ip || null]);
}

module.exports = { register, login, resolve, logout, publicUser, enterprisesOf, canAccess, canWrite, audit, ROLES };
