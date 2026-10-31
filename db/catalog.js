'use strict';
// Neutral drafting catalog, not an official application form or a source of legal rules.
const common='<p>企业：<span class="lock">{{name}}</span>；统一社会信用代码：<span class="lock">{{code}}</span>。</p><p>事项：<span class="lock">{{event}}</span>；文号：<span class="lock">{{docNo}}</span>；机关：<span class="lock">{{authority}}</span>；登记日期：<span class="lock">{{listedCN}}</span>。</p>';
const templates=[
 ['apply','信用修复申请书',common+'<p>现就上述事项提出信用修复申请，具体适用条件与提交要求请受理机关核实。</p><p>{{measure}}</p><p>申请理由：【待补充：结合实际事实、证明及主管部门要求说明，不得预先宣称符合全部条件】</p><p>所附材料及陈述经企业确认后提交。{{removedText}}</p>{{sign}}'],
 ['promise','守信承诺书',common+'<p>本企业承诺如实陈述情况，并对自行提交材料的真实性负责。</p><p>履行及整改情况：【待补充：实际完成情况、相应证明及尚待办理事项】</p><p>具体承诺事项：【待补充：依受理机关公布的格式与要求填写】</p>{{sign}}'],
 ['rectify','整改情况说明',common+'<p>问题成因：{{cause}}</p><p>整改措施：{{measure}}</p><p>实际办理情况：{{result}}</p><p>后续复查安排：【待补充：具体负责人、复查频率与事项】</p>{{sign}}'],
 ['auth','授权委托书',common+'<p>委托人法定代表人：<span class="lock">{{legal}}</span>。</p><p>受托人：{{agent}}；证件号码：{{agentId}}。</p><p>授权事项、范围及期限：【待填写：按实际委托内容填写，由委托人确认签署】</p>{{sign}}'],
 ['list','材料目录与证明清单',common+'<p>附件份数：{{count}}</p><p>实际附件目录（含文件名、材料类型、日期及摘要）：【待核对：按证据附件页的有效文件逐项填写，仅列实际提交材料】</p><p>受理机关另行要求的材料：【待核对：按官方办理入口确认】</p>{{sign}}'],
 ['plan','整改计划书',common+'<p>待整改问题：【待补充：如实列明问题】</p><p>整改措施、负责人和计划完成日：【待补充：逐项填写】</p><p>复查方式与证明：【待补充：说明复查安排及将形成的证明】</p>{{sign}}']
];
module.exports=async function catalog(db){
 for(const [key,title,body] of templates){
  const html='<h4>'+title+'</h4>'+body;
  await db.run('INSERT INTO doc_templates (doc_key,version,title,slots,body) VALUES (?,2,?,?,?) ON DUPLICATE KEY UPDATE body=IF(version<=1,VALUES(body),body),title=IF(version<=1,VALUES(title),title),version=IF(version<=1,2,version)',[key,title,'[]',html]);
 }
};
