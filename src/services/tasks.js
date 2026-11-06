'use strict';
const db=require('../db'),v=require('./validation'),evidence=require('./evidence');
async function update(user,id,input){
  const row=await db.one('SELECT * FROM tasks WHERE id=?',[id]);
  if(!row)throw Object.assign(new Error('任务不存在'),{code:'NOT_FOUND'});
  await evidence.guard(user,row.case_id,true);
  const note=v.text(input.note||'更新办理任务','任务说明',500,true);
  if(input.status!==undefined&&!['todo','doing','done'].includes(input.status))throw new Error('请选择有效任务状态');
  const owner=Object.hasOwn(input,'owner')?v.text(input.owner,'负责人',50,true):undefined;
  const day=Object.hasOwn(input,'due_date')?v.date(input.due_date,'截止日期'):undefined;
  return db.tx(async t=>{
    await t.one('SELECT id FROM cases WHERE id=? FOR UPDATE',[row.case_id]);
    const current=await t.one('SELECT * FROM tasks WHERE id=?',[id]),status=input.status??current.status;
    if(status==='done'&&current.depends_on){const prior=await t.one('SELECT * FROM tasks WHERE id=?',[current.depends_on]);if(!prior||prior.case_id!==row.case_id||prior.status!=='done')throw new Error('请先完成前置任务');}
    if(status!=='done'&&current.status==='done'&&await t.one("SELECT id FROM tasks WHERE case_id=? AND depends_on=? AND status='done'",[row.case_id,id]))throw new Error('请先重新打开已完成的后续任务');
    let proof=null;
    if(input.evidence_id){proof=await t.one('SELECT * FROM evidence_files WHERE id=? AND case_id=? AND archived=0',[input.evidence_id,row.case_id]);if(!proof)throw new Error('请选择本事项有效附件');}
    const changes={owner:owner??current.owner,due_date:day===undefined?current.due_date:day,status};
    await t.run('UPDATE tasks SET owner=?,due_date=?,status=? WHERE id=?',[changes.owner,changes.due_date,status,id]);
    await t.run('INSERT INTO task_events (task_id,actor_id,note,evidence_id,changes) VALUES (?,?,?,?,?)',[id,user.id,note,proof?.id||null,JSON.stringify(changes)]);
    await t.run("INSERT INTO timeline_events (case_id,at,actor,action,detail) VALUES (?,NOW(),?,'更新办理任务',?)",[row.case_id,user.name,`${current.name}：${note}；状态 ${status}${proof?'；关联附件 '+proof.filename:''}`.slice(0,500)]);
    return t.one('SELECT * FROM tasks WHERE id=?',[id]);
  });
}
module.exports={update};
