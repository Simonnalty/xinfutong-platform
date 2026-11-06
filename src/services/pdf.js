'use strict';
const {spawn}=require('node:child_process'),path=require('node:path');
function genPdf(payload) {
  return new Promise((resolve, reject) => {
    const py = spawn(require('../config.js').python, [path.join(__dirname, '..', '..', 'tools', 'gen_pdf.py')]);
    const out = [];
    const err = [];
    py.stdout.on('data', c => out.push(c));
    py.stderr.on('data', c => err.push(c));
    const timer = setTimeout(() => { py.kill(); reject(new Error('PDF 生成超时')); }, 30000);
    py.on('error', e => { clearTimeout(timer); reject(new Error('PDF 运行环境不可用：'+e.message)); });
    py.stdin.on('error', () => {});
    py.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('PDF 生成失败：' + Buffer.concat(err).toString().slice(0, 300)));
      resolve(Buffer.concat(out));
    });
    py.stdin.write(JSON.stringify(payload));
    py.stdin.end();
  });
}

module.exports=genPdf;
