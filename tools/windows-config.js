'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
try {
  const text = fs.readFileSync(path.join(root, 'windows/env.example'), 'utf8')
    .replace('GENERATE_ON_SETUP', randomBytes(32).toString('hex'));
  fs.writeFileSync(target, text, { flag: 'wx', mode: 0o600 });
  console.log('Created .env. Set DB_PASSWORD to the password of your Windows MySQL app user.');
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  console.log('Existing .env preserved. Check Windows DB settings and remove Linux PYTHON paths.');
}
