'use strict';
const db=require('../db');
const evidence=require('../services/evidence');
module.exports=r=>{
  r.get('/api/cases/:id/evidence',async({user,params})=>{
    await evidence.guard(user,params.id);
    return {items:await db.all(`SELECT ${evidence.META} FROM evidence_files WHERE case_id=? ORDER BY created_at DESC,id DESC`,[params.id])};
  },{auth:true});
  r.post('/api/cases/:id/evidence',async({user,params,body,ip})=>({evidence:await evidence.upload(user,params.id,body,ip)}),{auth:true,bodyLimit:6*1024*1024});
  r.get('/api/evidence/:id',async({user,params})=>({evidence:await evidence.get(user,params.id)}),{auth:true});
  r.get('/api/evidence/:id/download',async({user,params,res})=>{
    const e=await evidence.get(user,params.id);
    const file=await db.one('SELECT content FROM evidence_files WHERE id=?',[e.id]);
    res.writeHead(200,{'content-type':e.media_type,'content-length':e.byte_size,'content-disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(e.filename)}`,'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(file.content);return {__raw:true};
  },{auth:true});
  r.post('/api/evidence/:id/review',async({user,params,body,ip})=>({evidence:await evidence.review(user,params.id,body.note,ip)}),{auth:true});
  r.post('/api/evidence/:id/archive',async({user,params,body,ip})=>({evidence:await evidence.archive(user,params.id,body.note,ip)}),{auth:true});
};
