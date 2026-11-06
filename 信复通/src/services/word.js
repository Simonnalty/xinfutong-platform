'use strict';
const {Document,Paragraph,TextRun,Packer,AlignmentType,Footer}=require('docx');
const {parseDocument}=require('htmlparser2');
const {textContent}=require('domutils');
// 与 PDF 页脚同源的免责声明：文件导出后就脱离平台，只有页脚能跟着走
const NOTICE=[
  '本文件由信复通平台生成，仅供企业自助备料与办理进度留痕，不构成行政机关的修复决定，也不代表平台代为提交。',
  '信用修复申请请通过「信用中国」或作出决定的行政机关办理，是否受理、能否修复以该机关决定为准。'
];
async function generate({title,subtitle,html,docNo}) {
  const paragraphs=[new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:240},children:[new TextRun({text:title,bold:true,size:36,font:'黑体'})]}),new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:subtitle||'',size:20})]})];
  function walk(nodes){for(const node of nodes){if(node.type==='tag'&&['p','div','h4','h3','li','tr'].includes(node.name)){
    const text=textContent(node).trim();if(text)paragraphs.push(new Paragraph({alignment:node.attribs?.class==='sign'?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:180,line:360},children:[new TextRun({text,bold:['h4','h3'].includes(node.name),size:24})]}));
  }else if(node.children)walk(node.children);}}
  walk(parseDocument(html).children);
  const document=new Document({creator:'信复通',title,styles:{default:{document:{run:{font:'宋体',size:24}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1417,bottom:1361,left:1474,right:1474}}},footers:{default:new Footer({children:NOTICE.map(t=>new Paragraph({children:[new TextRun({text:t,size:14,color:'8A8794'})]}))})},children:[...paragraphs,new Paragraph({children:[new TextRun({text:`事项编号：${docNo} · 信复通材料草稿，须核对并由申请人确认`,size:18,color:'666666'})]})]}]});
  return Packer.toBuffer(document);
}
module.exports={generate};
