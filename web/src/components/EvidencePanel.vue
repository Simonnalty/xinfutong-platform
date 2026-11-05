<template>
  <div class="card card-pad" v-loading="loading">
    <div class="spread" style="margin-bottom:16px"><div class="card-title" style="margin:0">证据与附件</div><el-button @click="load">刷新列表</el-button></div>
    <el-alert title="核录表示有权限的操作人已对照材料确认，不能代替行政机关真实性认证。官方修复结果须核录后才能用于登记已修复。" type="info" :closable="false" style="margin-bottom:16px" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom:16px" />
    <el-form v-if="writable" label-position="top" class="archive-form-grid">
      <el-form-item label="证据类型"><el-select v-model="form.kind"><el-option v-for="(label,value) in kinds" :key="value" :value="value" :label="label" /></el-select></el-form-item>
      <el-form-item label="材料日期"><el-date-picker v-model="form.observed_at" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      <el-form-item label="来源 / 出具机关"><el-input v-model="form.source" maxlength="500" placeholder="如：主管机关决定原件" /></el-form-item>
      <el-form-item label="PDF / PNG / JPEG（不超过 4 MB）"><input ref="fileInput" type="file" accept=".pdf,.png,.jpg,.jpeg" @change="selectFile" /></el-form-item>
      <div><el-button type="primary" :loading="uploading" @click="upload">上传并保存证据</el-button></div>
    </el-form>
    <el-table :data="items" style="margin-top:20px">
      <el-table-column label="附件" min-width="170"><template #default="{row}"><a :href="`/api/evidence/${row.id}/download`" target="_blank" rel="noopener">{{row.filename}}</a><div class="muted tiny">{{kinds[row.kind]}} · {{Math.ceil(row.byte_size/1024)}} KB</div></template></el-table-column>
      <el-table-column label="来源与日期" min-width="160"><template #default="{row}">{{row.source}}<div class="muted tiny">{{row.observed_at}}</div></template></el-table-column>
      <el-table-column label="完整性摘要" min-width="130"><template #default="{row}"><el-tooltip :content="row.digest"><span class="mono tiny">{{row.digest.slice(0,16)}}…</span></el-tooltip></template></el-table-column>
      <el-table-column label="状态" width="110"><template #default="{row}"><el-tag :type="row.archived?'info':row.review_status==='reviewed'?'success':'warning'">{{row.archived?'已归档':row.review_status==='reviewed'?'人工已核录':'待核录'}}</el-tag></template></el-table-column>
      <el-table-column v-if="writable" label="操作" width="150"><template #default="{row}"><el-button v-if="!row.archived && row.review_status!=='reviewed'" link type="primary" @click="act(row,'review')">核录</el-button><el-button v-if="!row.archived" link @click="act(row,'archive')">归档</el-button></template></el-table-column>
    </el-table>
  </div>
</template>
<script setup>
import {ref,reactive,watch,computed} from 'vue'
import {ElMessageBox,ElMessage} from 'element-plus'
import {api} from '../api.js'
import {store} from '../store.js'
const props=defineProps({caseId:String,enterpriseId:Number})
const emit=defineEmits(['changed'])
const items=ref([]),error=ref(''),loading=ref(false),uploading=ref(false),file=ref(null),fileInput=ref(null)
const form=reactive({kind:'payment',source:'',observed_at:null})
const kinds={subject:'申请人主体资格文件',payment:'缴款或履行证明',rectification:'整改材料',receipt:'办理回执',official_result:'官方修复结果',other:'其他证明'}
const writable=computed(()=>{const e=store.enterprises.find(e=>e.id===props.enterpriseId);return store.user?.role==='admin'||e?.relation==='owner'||e?.perm==='write'})
function selectFile(e){file.value=e.target.files[0]||null}
async function load(){loading.value=true;error.value='';try{items.value=(await api.evidence(props.caseId)).items}catch(e){error.value=e.message}finally{loading.value=false}}
async function upload(){
  if(!file.value || !form.source.trim() || !form.observed_at){error.value='请选择文件并填写来源和材料日期';return}
  if(file.value.size>4*1024*1024){error.value='文件不能超过 4 MB';return}
  uploading.value=true;error.value=''
  try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file.value)})
    await api.uploadEvidence(props.caseId,{...form,filename:file.value.name,data});file.value=null;fileInput.value.value='';await load();emit('changed');ElMessage.success('证据已保存')
  }catch(e){error.value=e.message}finally{uploading.value=false}
}
async function act(row,action){
  try{const {value}=await ElMessageBox.prompt(action==='review'?'请对照材料原件，填写核录说明。此操作会记录你的账号和时间。':'请填写归档或替换原因；原文件仍保留历史。',action==='review'?'人工核录':'归档附件',{inputPattern:/\S+/,inputErrorMessage:'请填写说明'})
    await api.evidenceAction(row.id,action,value);await load();emit('changed')
  }catch(e){if(e!=='cancel'&&e!=='close')error.value=e.message}
}
watch(()=>props.caseId,load,{immediate:true})
</script>
