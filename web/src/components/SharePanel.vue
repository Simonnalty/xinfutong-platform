<template>
 <div class="card card-pad"><div class="spread"><h3>融资／投标材料分享包</h3><el-button v-if="writable" type="primary" @click="open=true">创建分享包</el-button></div><p class="muted">选择有效凭证，为接收单位生成有期限的核验链接和带二维码的材料说明。平台不承诺银行授信或招标采信。</p>
 <el-empty v-if="!items.length" description="尚未创建分享包"/>
 <el-table :data="items"><el-table-column label="用途" width="100"><template #default="{row}">{{ row.purpose==='financing'?'融资':'投标' }}</template></el-table-column><el-table-column prop="recipient" label="接收单位"/><el-table-column label="到期时间"><template #default="{row}">{{ new Date(Number(row.expires_ts)).toLocaleString() }}</template></el-table-column><el-table-column label="状态" width="90"><template #default="{row}">{{ row.revoked_at?'已撤销':Number(row.expires_ts)<Date.now()?'已到期':'有效' }}</template></el-table-column><el-table-column label="操作" min-width="220"><template #default="{row}"><el-button text @click="copyLink(row)">复制链接</el-button><el-button text @click="download(row)">下载 PDF</el-button><el-button v-if="writable && !row.revoked_at" text type="danger" @click="revoke(row)">撤销</el-button></template></el-table-column></el-table>
 <el-dialog v-model="open" title="创建用途分享包" width="min(500px,94vw)"><el-form label-position="top"><el-form-item label="平台状态凭证"><el-select v-model="form.code" style="width:100%"><el-option v-for="c in certificates.filter(c=>c.status==='valid')" :key="c.code" :value="c.code" :label="c.code"/></el-select></el-form-item><el-form-item label="用途"><el-radio-group v-model="form.purpose"><el-radio value="financing">融资材料核对</el-radio><el-radio value="tender">投标材料核对</el-radio></el-radio-group></el-form-item><el-form-item label="接收单位（选填）"><el-input v-model="form.recipient" maxlength="200"/></el-form-item><el-form-item label="有效天数"><el-input-number v-model="form.days" :min="1" :max="30"/></el-form-item></el-form><template #footer><el-button @click="open=false">取消</el-button><el-button type="primary" :loading="saving" @click="create">创建分享包</el-button></template></el-dialog>
 <el-dialog v-model="createdOpen" title="分享包已创建" width="min(500px,94vw)"><p>接收方扫码后可查看凭证快照及分享有效状态。</p><canvas ref="qr"/><el-input :model-value="link" readonly/><template #footer><el-button @click="copyText(link)">复制分享链接</el-button></template></el-dialog>
 </div>
</template>
<script setup>
import {ref,onMounted,nextTick,computed} from 'vue'
import {ElMessage,ElMessageBox} from 'element-plus'
import QRCode from 'qrcode'
import {api} from '../api.js'
import {store} from '../store.js'
const props=defineProps({caseId:String,enterpriseId:Number,certificates:Array}),items=ref([]),open=ref(false),saving=ref(false),createdOpen=ref(false),link=ref(''),qr=ref(null),form=ref({code:'',purpose:'financing',recipient:'',days:7})
const writable=computed(()=>{const e=store.enterprises.find(e=>e.id===props.enterpriseId);return store.user?.role==='admin'||e?.relation==='owner'||e?.perm==='write'})
async function load(){try{items.value=(await api.shares(props.caseId)).items}catch(e){ElMessage.error(e.message)}}
async function create(){saving.value=true;try{const s=(await api.createShare(props.caseId,form.value)).share;link.value=location.origin+'/share?token='+s.token;open.value=false;createdOpen.value=true;await load();await nextTick();await QRCode.toCanvas(qr.value,link.value,{width:180,margin:2})}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
async function copyText(text){try{await navigator.clipboard.writeText(text);ElMessage.success('链接已复制')}catch{await ElMessageBox.alert(text,'分享链接')}}
function copyLink(row){copyText(location.origin+'/share?file='+row.id)}
function download(row){window.open('/api/shares/'+row.id+'/pdf','_blank')}
async function revoke(row){try{await ElMessageBox.confirm('撤销后，接收方将无法继续通过分享链接核对材料。','撤销分享包',{type:'warning'})}catch{return}try{await api.revokeShare(row.id);await load();ElMessage.success('分享包已撤销')}catch(e){ElMessage.error(e.message)}}
onMounted(load)
</script>
