'use strict';
const mysql = require('mysql2/promise');
const { randomBytes } = require('node:crypto');

// Only the explicitly selected local management socket provisions disposable data.
// Windows 无 unix socket：未显式指定 socket 时回落到 TCP（host/port），Linux/macOS 仍可传 XFT_TEST_DB_SOCKET。
module.exports = async function isolatedDb() {
  const name = `xft_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  const adminConn = process.env.XFT_TEST_DB_SOCKET
    ? { socketPath: process.env.XFT_TEST_DB_SOCKET }
    : { host: process.env.XFT_TEST_DB_HOST || '127.0.0.1', port: Number(process.env.XFT_TEST_DB_PORT || 3306) };
  const admin = await mysql.createConnection({
    ...adminConn,
    user: process.env.XFT_TEST_DB_ADMIN || 'root',
    password: process.env.XFT_TEST_DB_ADMIN_PASSWORD || ''
  });
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  try {
    // 本机 MySQL 会把 127.0.0.1 反解为 localhost，两个 host 都要建，否则连接被拒
    for (const h of ['127.0.0.1', 'localhost']) {
      await admin.query(`CREATE USER ?@? IDENTIFIED BY ?`, [name, h, password]);
      await admin.query(`GRANT ALL ON \`${name}\`.* TO ?@?`, [name, h]);
    }
    Object.assign(require('../../src/config').db, { host: '127.0.0.1', port: Number(process.env.XFT_TEST_DB_PORT || 3306), user: name, password, database: name });
    const db = require('../../src/db');
    await db.ensureSchema(await db.connect());
    return { db, async close() {
      await db.close();
      await admin.query(`DROP DATABASE \`${name}\``);
      for (const h of ['127.0.0.1', 'localhost']) await admin.query('DROP USER ?@?', [name, h]);
      await admin.end();
    }};
  } catch (e) {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    for (const h of ['127.0.0.1', 'localhost']) await admin.query('DROP USER IF EXISTS ?@?', [name, h]);
    await admin.end();
    throw e;
  }
};
