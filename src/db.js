'use strict';
/*
 * 数据访问层：连接池 + 建表 + 种子 + 查询助手。
 * 业务代码只依赖 all/one/run/tx，不直接碰 mysql2。
 */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const config = require('./config.js');

let pool = null;

async function connect() {
  if (pool) return pool;
  pool = mysql.createPool({
    ...config.db,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
    dateStrings: true,
    multipleStatements: false
  });
  return pool;
}

/** 把 schema.sql 拆成单条语句执行（文件里没有分号字符串，简单切分即可） */
async function ensureSchema(p) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const statements = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) await p.query(stmt);
  return statements.length;
}

async function all(sql, params) {
  const p = await connect();
  const [rows] = await p.query(sql, params || []);
  return rows;
}

async function one(sql, params) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function run(sql, params) {
  const p = await connect();
  const [res] = await p.query(sql, params || []);
  return res;
}

async function tx(fn) {
  const p = await connect();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn({
      all: async (s, a) => (await conn.query(s, a || []))[0],
      one: async (s, a) => (await conn.query(s, a || []))[0][0] || null,
      run: async (s, a) => (await conn.query(s, a || []))[0]
    });
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

let readyPromise = null;

function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const p = await connect();
      await p.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await ensureSchema(p);
      const [{ n }] = (await p.query('SELECT COUNT(*) AS n FROM enterprises'))[0];
      if (Number(n) === 0 && config.demoSeed) {
        const seed = require('../db/seed.js');
        await seed({ all, one, run });
      }
      await require('../db/catalog.js')({all,one,run});
      await require('../db/migrate.js')({ all, one, run });
    })().catch(err => { readyPromise = null; throw err; });
  }
  return readyPromise;
}

async function close() {
  if (pool) { await pool.end(); pool = null; }
}

module.exports = { connect, ready, all, one, run, tx, close, ensureSchema };
