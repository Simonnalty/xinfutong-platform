'use strict';
const db = require('../db');
const auth = require('./auth');
const v = require('./validation');
const fields = {name:200,credit_code:18,legal:50,industry:60,region:60,scale:40,contact:50,phone:20};
const labels = {name:'企业名称',credit_code:'统一社会信用代码',legal:'法定代表人',industry:'行业',region:'地区',scale:'规模',contact:'联系人',phone:'联系电话'};
function normalize(input) {
  const out = {};
  for (const [key,max] of Object.entries(fields)) out[key]=v.text(input[key],labels[key],max,['name','credit_code'].includes(key));
  out.credit_code=out.credit_code.toUpperCase();
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(out.credit_code)) throw new Error('统一社会信用代码须为 18 位有效大写字母或数字');
  if (out.phone && !/^[\d+()\-\s]{6,20}$/.test(out.phone)) throw new Error('联系电话格式不正确');
  return out;
}
async function create(user, input, ip) {
  if (!['enterprise','admin'].includes(user.role)) throw v.forbidden('机构请通过企业授权管理已有企业');
  const data=normalize(input);
  try {
    return await db.tx(async t=>{
      const r=await t.run('INSERT INTO enterprises (name,credit_code,legal,industry,region,scale,contact,phone) VALUES (?,?,?,?,?,?,?,?)',Object.keys(fields).map(k=>data[k]));
      await t.run("INSERT INTO enterprise_members (enterprise_id,user_id,role) VALUES (?,?,'owner')",[r.insertId,user.id]);
      await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'enterprise_create',?,?,?)",[user.id,String(r.insertId),'建立企业档案',ip||null]);
      return await t.one('SELECT * FROM enterprises WHERE id=?',[r.insertId]);
    });
  } catch(e) {if(e.code==='ER_DUP_ENTRY') throw new Error('该信用代码已建档，请由现有负责人授权，不能重复关联');throw e;}
}
async function update(user, id, input, ip) {
  if (!await auth.canWrite(user,id)) throw v.forbidden('无权修改该企业');
  return db.tx(async t=>{
    const old=await t.one('SELECT * FROM enterprises WHERE id=? FOR UPDATE',[id]);
    if (!old) throw Object.assign(new Error('企业不存在'),{code:'NOT_FOUND'});
    if (input.credit_code != null && String(input.credit_code).trim().toUpperCase()!==old.credit_code) throw new Error('信用代码为企业身份标识，不能修改');
    const data=normalize({...old,...input});
    const keys=Object.keys(fields).filter(k=>k!=='credit_code');
    await t.run(`UPDATE enterprises SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`,[...keys.map(k=>data[k]),id]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail,ip) VALUES (?,'enterprise_update',?,?,?)",[user.id,String(id),'更新企业档案',ip||null]);
    return t.one('SELECT * FROM enterprises WHERE id=?',[id]);
  });
}
module.exports={create,update};
