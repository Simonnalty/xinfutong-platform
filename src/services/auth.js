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
  const user = await db.one('SELECT * FROM users WHERE phone = ?', [phone]);
  if (!user || !verifyPassword(password, user.pwd_hash)) throw new Error('手机号或密码不正确');
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
async function enterprisesOf(user) {
  if (user.role === 'admin') {
    return (await db.all('SELECT id, name, credit_code, legal, industry, region, scale FROM enterprises ORDER BY id'))
      .map(e => ({ ...e, relation: 'admin' }));
  }
  if (user.role === 'org') {
    return db.all(
      `SELECT e.id, e.name, e.credit_code, e.legal, e.industry, e.region, e.scale,
              'org' AS relation, oe.perm AS perm
         FROM org_enterprises oe
         JOIN org_members om ON om.org_id = oe.org_id
         JOIN enterprises e ON e.id = oe.enterprise_id
        WHERE om.user_id = ? AND oe.revoked_at IS NULL
        ORDER BY e.id`, [user.id]);
  }
  return db.all(
    `SELECT e.id, e.name, e.credit_code, e.legal, e.industry, e.region, e.scale, m.role AS relation
       FROM enterprise_members m JOIN enterprises e ON e.id = m.enterprise_id
      WHERE m.user_id = ? AND m.revoked_at IS NULL ORDER BY e.id`, [user.id]);
}

async function canAccess(user, enterpriseId) {
  if (user.role === 'admin') return true;
  if (user.role === 'org') {
    return Boolean(await db.one(
      `SELECT 1 AS x FROM org_enterprises oe JOIN org_members om ON om.org_id = oe.org_id
        WHERE om.user_id = ? AND oe.enterprise_id = ? AND oe.revoked_at IS NULL`,
      [user.id, enterpriseId]));
  }
  return Boolean(await db.one(
    'SELECT 1 AS x FROM enterprise_members WHERE user_id = ? AND enterprise_id = ? AND revoked_at IS NULL',
    [user.id, enterpriseId]));
}

/** 是否可对该企业执行写操作：企业侧仅 owner，机构需 write 授权，运营不受限 */
async function canWrite(user, enterpriseId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'enterprise') {
    const m = await db.one(
      'SELECT role FROM enterprise_members WHERE user_id = ? AND enterprise_id = ? AND revoked_at IS NULL',
      [user.id, enterpriseId]);
    return Boolean(m && m.role === 'owner');
  }
  if (user.role === 'org') {
    const g = await db.one(
      `SELECT oe.perm FROM org_enterprises oe JOIN org_members om ON om.org_id = oe.org_id
        WHERE om.user_id = ? AND oe.enterprise_id = ? AND oe.revoked_at IS NULL`,
      [user.id, enterpriseId]);
    return Boolean(g && g.perm === 'write');
  }
  return false;
}

async function audit(actorId, action, target, detail, ip) {
  await db.run('INSERT INTO audit_logs (actor_id, action, target, detail, ip) VALUES (?,?,?,?,?)',
    [actorId || null, action, target || null, (detail || '').slice(0, 500), ip || null]);
}

module.exports = { register, login, resolve, logout, publicUser, enterprisesOf, canAccess, canWrite, audit, ROLES };
