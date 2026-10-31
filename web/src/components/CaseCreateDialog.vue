<template>
  <el-dialog :model-value="modelValue" title="建立修复事项" width="min(680px, 94vw)" :close-on-click-modal="false" @update:model-value="$emit('update:modelValue',$event)">
    <el-alert title="请根据已有决定或公示记录登记。等级为初步登记值，具体办理要求需结合适用规则核对。" type="info" :closable="false" style="margin-bottom:16px" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" style="margin-bottom:16px" />
    <el-form label-position="top">
      <div class="archive-form-grid">
        <el-form-item label="事项类型（必填）"><el-select v-model="form.type"><el-option label="行政处罚公示" value="penalty" /><el-option label="经营异常名录" value="abnormal" /><el-option label="严重失信主体名单" value="blacklist" /></el-select></el-form-item>
        <el-form-item label="记录等级（必填）"><el-select v-model="form.level"><el-option v-for="(label,value) in levels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
      </div>
      <el-form-item label="事项描述（必填）"><el-input v-model="form.event" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="填写决定书或公示记录所记载的行为" /></el-form-item>
      <el-form-item label="主管机关（必填）"><el-input v-model="form.authority" maxlength="200" /></el-form-item>
      <el-form-item label="决定文号"><el-input v-model="form.doc_no" maxlength="120" placeholder="按原件填写，尚未取得可暂留空" /></el-form-item>
      <div class="archive-form-grid">
        <el-form-item label="列入 / 决定日期（必填）"><el-date-picker v-model="form.listed_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="办理截止日期"><el-date-picker v-model="form.due_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
      </div>
      <div class="muted tiny">建立后可进入事项详情，补充履行、整改事实及证明附件。</div>
    </el-form>
    <template #footer><el-button @click="$emit('update:modelValue',false)">取消</el-button><el-button type="primary" :loading="saving" @click="save">创建并进入事项</el-button></template>
  </el-dialog>
</template>
<script setup>
import { reactive,ref,watch } from 'vue'
import { api } from '../api.js'
const props=defineProps({modelValue:Boolean,enterpriseId:Number})
const emit=defineEmits(['update:modelValue','saved'])
const form=reactive({}),saving=ref(false),error=ref('')
const levels={minor:'轻微失信',general:'一般失信',serious:'严重失信',severe:'严重违法失信'}
watch(()=>props.modelValue,open=>{if(open){Object.assign(form,{type:'penalty',level:'general',event:'',authority:'',doc_no:'',listed_date:null,due_date:null});error.value=''}})
async function save(){
  if(!form.event.trim() || !form.authority.trim() || !form.listed_date){error.value='请补全事项描述、主管机关和列入日期';return}
  saving.value=true;error.value=''
  try{const r=await api.createCase(props.enterpriseId,form);emit('saved',r.case);emit('update:modelValue',false)}catch(e){error.value=e.message}finally{saving.value=false}
}
</script>
