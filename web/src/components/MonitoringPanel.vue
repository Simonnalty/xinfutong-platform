<template>
  <div v-loading="busy">
    <div class="row" style="margin-bottom:14px;flex-wrap:wrap">
      <el-button v-if="writable" type="primary" @click="openRecord">登记渠道观察</el-button>
      <el-button v-if="writable" @click="scan">检查已配置渠道</el-button>
      <el-button v-if="writable" @click="schedule">设为每日检查</el-button>
      <el-button v-if="writable" @click="pause">暂停定时检查</el-button>
    </div>
    <p v-if="job" class="muted tiny">定时检查：{{jobStates[job.state]||job.state}} · 下次 {{job.next_at}} · 最近执行 {{job.last_run_at||'尚未执行'}}<span v-if="job.last_error"> · {{job.last_error}}（失败 {{job.attempts}} 次，可重新启用）</span></p>
    <el-alert title="人工核录需要企业自行观察并登记；模拟数据仅供演示。自动检查只调用已配置的授权接口，不会自动登录或抓取第三方。" type="info" :closable="false" show-icon />
    <el-empty v-if="!channels.length" description="尚未登记渠道，点击上方按钮记录一次观察" />
    <div v-for="c in channels" :key="c.id" class="chan">
      <div class="grow"><div>{{c.channel_name}} <el-tag size="small">{{providers[c.provider]||c.provider}}</el-tag></div><div class="muted tiny">{{c.note}} · {{c.last_checked_at||'未核验'}}</div></div>
      <el-tag :type="c.state==='ok'?'success':c.state==='error'?'danger':'warning'">{{states[c.state]||c.state}}</el-tag>
      <el-button v-if="writable && c.provider!=='mock' && ['bad','warn'].includes(c.state)" @click="draft(c.channel_code)">生成异议草稿</el-button>
    </div>
    <el-collapse style="margin-top:18px">
      <el-collapse-item title="查看核录快照及摘要" name="snapshots">
        <div v-for="s in snapshots" :key="s.id" style="padding:10px 0;overflow-wrap:anywhere"><strong>{{s.channel_code}} · {{s.source}} · {{s.fetched_at}}</strong><div class="muted tiny">SHA-256 {{s.digest}}</div><pre style="white-space:pre-wrap">{{ JSON.stringify(s.payload,null,2) }}</pre></div>
      </el-collapse-item>
    </el-collapse>
    <h3 style="font-size:16px;margin-top:24px">异议处理记录</h3>
    <el-empty v-if="!objections.length" description="暂无异议草稿" :image-size="60" />
    <div v-for="o in objections" :key="o.id" class="card card-pad" style="margin:12px 0">
      <div class="spread"><span>#{{o.id}} · {{o.channel_code}} · {{statuses[o.status]||o.status}}</span><el-button @click="preview=o.body_html;previewOpen=true">查看函件</el-button></div>
      <p v-if="o.followup?.remind_date" class="muted tiny">自行设定催办日期：{{o.followup.remind_date}}</p>
      <el-collapse v-if="o.revisions?.length"><el-collapse-item title="函件版本记录"><el-button v-for="r in o.revisions" :key="r.id" text @click="preview=r.body_html;previewOpen=true">版本 {{r.version}} · {{r.created_at}}</el-button></el-collapse-item></el-collapse>
      <div v-for="event in o.events" :key="event.id" class="muted tiny" style="margin-top:8px">{{event.created_at}} · {{statuses[event.status]}} · {{event.note}}</div>
      <div v-if="writable" class="row" style="margin-top:12px">
        <el-button v-if="['draft','ready'].includes(o.status)" @click="supplement(o)">补充说明</el-button>
        <el-button v-if="['submitted','sent','replied'].includes(o.status)" @click="followupForm={id:o.id,date:o.followup?.remind_date||null};followupOpen=true">设置催办提醒</el-button>
        <el-button v-if="['draft','ready'].includes(o.status)" @click="openTransition(o,'submitted')">登记实际提交</el-button>
        <el-button v-if="['submitted','sent'].includes(o.status)" @click="openTransition(o,'replied')">登记平台答复</el-button>
        <el-button v-if="o.status==='replied'" @click="openTransition(o,'resolved')">复查后关闭</el-button>
        <el-button @click="exportObjection(o.id)">下载函件 PDF</el-button>
      </div>
    </div>
    <el-dialog v-model="recordOpen" title="人工核录渠道状态" width="min(620px,94vw)">
      <el-form label-position="top">
        <el-form-item label="渠道"><el-select v-model="form.channel"><el-option v-for="(name,code) in names" :key="code" :label="name" :value="code" /></el-select></el-form-item>
        <el-form-item label="观察结果"><el-select v-model="form.state"><el-option v-for="(name,code) in recordStates" :key="code" :label="name" :value="code" /></el-select></el-form-item>
        <el-form-item label="观察日期"><el-date-picker v-model="form.observed_at" type="date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="来源网页地址"><el-input v-model="form.source_url" placeholder="https://…" /></el-form-item>
        <el-form-item label="确认信用代码"><el-input v-model="form.credit_code" /></el-form-item>
        <el-form-item label="确认决定文号"><el-input v-model="form.doc_no" /></el-form-item>
        <el-form-item label="确认决定机关"><el-input v-model="form.authority" /></el-form-item>
        <el-form-item label="具体展示情况"><el-input v-model="form.note" type="textarea" maxlength="300" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="recordOpen=false">取消</el-button><el-button type="primary" :loading="busy" @click="record">保存核录快照</el-button></template>
    </el-dialog>
    <el-dialog v-model="transitionOpen" :title="statuses[transition.to]" width="min(580px,94vw)">
      <el-alert title="仅记录企业实际办理情况；平台未替你发送函件。请先在证据附件中上传提交或答复回执。" type="info" :closable="false" style="margin-bottom:12px" />
      <el-form label-position="top">
        <el-form-item v-if="transition.to!=='resolved'" label="关联回执"><el-select v-model="transition.evidence_id" style="width:100%"><el-option v-for="e in receipts" :key="e.id" :label="e.filename" :value="e.id" /></el-select></el-form-item>
        <el-form-item label="处理说明"><el-input v-model="transition.note" type="textarea" maxlength="500" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="transitionOpen=false">取消</el-button><el-button type="primary" :loading="busy" @click="advance">保存记录</el-button></template>
    </el-dialog>
    <el-dialog v-model="followupOpen" title="企业催办提醒" width="min(480px,94vw)">
      <p class="muted">这是企业自行设定的提醒日期，不代表法定处理期限。清空日期可取消提醒。</p>
      <el-date-picker v-model="followupForm.date" value-format="YYYY-MM-DD" type="date" />
      <template #footer><el-button @click="followupOpen=false">取消</el-button><el-button type="primary" @click="saveFollowup">保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="previewOpen" title="数据异议与更正函草稿" width="min(800px,96vw)"><div class="paper" v-html="preview"></div></el-dialog>
  </div>
</template>
<script setup>
import {ref,onMounted,computed} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const props=defineProps({caseId:String,kase:Object,enterprise:Object});const emit=defineEmits(['changed'])
const followupOpen=ref(false),followupForm=ref({})
const job=ref(null),jobStates={queued:'等待执行',running:'执行中',paused:'已暂停',failed:'重试次数已达上限'}
const channels=ref([]),snapshots=ref([]),objections=ref([]),busy=ref(false),recordOpen=ref(false),preview=ref(''),previewOpen=ref(false),form=ref({}),transitionOpen=ref(false),transition=ref({}),receipts=ref([])
const names={credit_china:'信用中国',gsxt:'国家企业信用信息公示系统',qcc:'企查查',tianyancha:'天眼查',bank:'银行授权核验'}
const states={ok:'已同步',warn:'信息冲突',bad:'未同步',idle:'待核验',error:'获取失败'},recordStates={ok:'已同步',warn:'信息冲突',bad:'未同步',idle:'待核验'}
const providers={manual:'企业人工核录',mock:'模拟数据',authorized:'已授权接口'},statuses={draft:'草稿，未提交',ready:'待提交',submitted:'企业已登记提交',sent:'旧版提交记录',replied:'已登记答复',resolved:'复查已解决'}
const writable=computed(()=>{const e=store.enterprises.find(e=>e.id===props.enterprise.id);return store.user?.role==='admin'||e?.relation==='owner'||(e?.relation==='org'&&e?.perm==='write')})
async function load(){const [r,o,j]=await Promise.all([api.channels(props.caseId),api.objections(props.caseId),api.scheduleInfo(props.caseId)]);job.value=j.job;channels.value=r.channels;snapshots.value=r.snapshots;objections.value=o.items}
async function action(fn){busy.value=true;try{await fn();await load();emit('changed')}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
function openRecord(){form.value={channel:'qcc',state:'idle',observed_at:new Date().toISOString().slice(0,10),credit_code:props.enterprise.credit_code,doc_no:props.kase.doc_no,authority:props.kase.authority,source_url:'',note:''};recordOpen.value=true}
function record(){return action(async()=>{await api.recordChannel(props.caseId,form.value);recordOpen.value=false;ElMessage.success('观察快照已保存')})}
function scan(){return action(async()=>{await api.rescan(props.caseId);ElMessage.success('已检查；人工核录渠道仍需自行观察并登记')})}
function draft(channel){return action(async()=>{const d=await api.sendObjection(props.caseId,channel);preview.value=d.html;previewOpen.value=true;ElMessage.success('已保存草稿，尚未实际提交')})}
async function openTransition(o,to){try{receipts.value=(await api.evidence(props.caseId)).items.filter(e=>e.kind==='receipt'&&!e.archived);transition.value={id:o.id,to,note:'',evidence_id:null};transitionOpen.value=true}catch(e){ElMessage.error(e.message)}}
function advance(){return action(async()=>{await api.objectionTransition(transition.value.id,transition.value);transitionOpen.value=false;ElMessage.success('处理记录已保存')})}
async function schedule(){try{await api.schedule(props.caseId,{enabled:true,interval_hours:24});await load();ElMessage.success('已设置每日检查；未接入的渠道不会产生真实监测结果')}catch(e){ElMessage.error(e.message)}}
async function pause(){try{await api.schedule(props.caseId,{enabled:false});await load();ElMessage.success('已暂停')}catch(e){ElMessage.error(e.message)}}
async function supplement(o){try{const result=await ElMessageBox.prompt('原始事实保持锁定，补充内容会另存新版本。','补充函件说明',{inputType:'textarea',inputValidator:x=>!!x?.trim()&&x.length<=2000||'请填写不超过2000字的说明'});await action(()=>api.objectionSupplement(o.id,{note:result.value}))}catch(e){if(e?.message)ElMessage.error(e.message)}}
function saveFollowup(){return action(async()=>{await api.objectionFollowup(followupForm.value.id,{date:followupForm.value.date||null});followupOpen.value=false})}
function exportObjection(id){window.open(`/api/objections/${id}/pdf`,'_blank')}
onMounted(()=>load().catch(e=>ElMessage.error(e.message)))
</script>
