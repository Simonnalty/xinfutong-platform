'use strict';
const db=require('../db'),v=require('./validation'),rules=require('./rules');
async function create(input,user){
  const key=v.text(input.rule_key,'规则标识',80,true),title=v.text(input.title,'规则名称',200,true),authority=v.text(input.authority_match,'适用机关关键词',100,true),source=v.text(input.source_url,'官方来源网址',500,true),note=v.text(input.review_note,'复核说明',500,true);
  if(!/^[a-zA-Z0-9_-]+$/.test(key))throw new Error('规则标识仅接受字母、数字、下划线和短横线');
  const url=new URL(source);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('请输入有效来源网址');
  if(!['penalty','abnormal'].includes(input.case_type)||!rules.LEVELS[input.level])throw new Error('请选择支持的事项类型和等级');
  if(!['draft','reviewed'].includes(input.review_status))throw new Error('请选择草稿或已复核状态');
  const from=v.date(input.effective_from,'生效日期',true),until=v.date(input.effective_until,'失效日期');
  if(until&&until<from)throw new Error('失效日期不得早于生效日期');
  const d=input.definition;
  if(!d||!Number.isInteger(d.months)||d.months<0||d.months>120||!Number.isInteger(d.reviewDays)||d.reviewDays<1||d.reviewDays>365||!Array.isArray(d.materials)||!d.materials.length||d.materials.some(k=>!rules.MATERIAL_TITLES[k]))throw new Error('请填写有效月份、办理参考天数和材料清单');
  const definition={months:d.months,reviewDays:d.reviewDays,materials:[...new Set(d.materials)]};
  return db.tx(async t=>{
    const last=await t.one('SELECT version FROM rule_versions WHERE rule_key=? ORDER BY version DESC LIMIT 1 FOR UPDATE',[key]);
    const r=await t.run('INSERT INTO rule_versions (rule_key,version,title,case_type,level,authority_match,source_url,effective_from,effective_until,review_status,review_note,definition,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[key,(last?.version||0)+1,title,input.case_type,input.level,authority,source,from,until,input.review_status,note,JSON.stringify(definition),user.id]);
    await t.run("INSERT INTO audit_logs (actor_id,action,target,detail) VALUES (?,'rule_version',?,?)",[user.id,String(r.insertId),`${key} ${input.review_status}：${note}`]);return t.one('SELECT * FROM rule_versions WHERE id=?',[r.insertId]);
  });
}
module.exports={create};
