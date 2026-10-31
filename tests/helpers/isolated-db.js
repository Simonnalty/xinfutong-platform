'use strict';
const mysql = require('mysql2/promise');
const { randomBytes } = require('node:crypto');

// Only the explicitly selected local management socket provisions disposable data.
module.exports = async function isolatedDb() {
  const name = `xft_test_${process.pid}_${randomBytes(4).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  const admin = await mysql.createConnection({
    socketPath: process.env.XFT_TEST_DB_SOCKET || '/home/simon/项目/信复通/database/mysql-data/mysql.sock',
    user: process.env.XFT_TEST_DB_ADMIN || 'root',
    password: process.env.XFT_TEST_DB_ADMIN_PASSWORD || ''
  });
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  try {
    await admin.query('CREATE USER ?@\'127.0.0.1\' IDENTIFIED BY ?', [name, password]);
    await admin.query(`GRANT ALL ON \`${name}\`.* TO ?@'127.0.0.1'`, [name]);
    Object.assign(require('../../src/config').db, { host: '127.0.0.1', port: Number(process.env.XFT_TEST_DB_PORT || 3306), user: name, password, database: name });
    const db = require('../../src/db');
    await db.ensureSchema(await db.connect());
    return { db, async close() {
      await db.close();
      await admin.query(`DROP DATABASE \`${name}\``);
      await admin.query("DROP USER ?@'127.0.0.1'", [name]);
      await admin.end();
    }};
  } catch (e) {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await admin.query("DROP USER IF EXISTS ?@'127.0.0.1'", [name]);
    await admin.end();
    throw e;
  }
};
