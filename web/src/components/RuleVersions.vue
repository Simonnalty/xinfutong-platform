<template>
  <div class="card card-pad" v-loading="busy">
    <el-alert title="诊断仅使用已复核、有效且唯一匹配的规则。发布新版本不会改写历史诊断；来源与适用机关请由运营人员核对。" type="info" :closable="false" style="margin-bottom:14px" />
    <el-button type="primary" @click="openNew">新增规则版本</el-button>
    <el-table :data="items" style="margin-top:14px">
      <el-table-column prop="title" label="规则" min-width="180" />
      <el-table-column prop="version" label="版本" width="70" />
      <el-table-column prop="case_type" label="类型" width="100" />
      <el-table-column prop="authority_match" label="适用机关关键词" min-width="160" />
      <el-table-column prop="effective_from" label="生效日期" width="120" />
      <el-table-column prop="effective_until" label="失效日期" width="120" />
      <el-table-column prop="review_status" label="复核状态" width="110" />
      <el-table-column label="操作" width="130"><template #default="{row}"><el-button link @click="revise(row)">基于此创建新版</el-button></template></el-table-column>
    </el-table>
    <el-dialog v-model="opened" title="发布独立规则版本" width="min(680px,94vw)">
      <el-form label-position="top">
        <el-form-item label="规则标识（相同标识自动递增版本）"><el-input v-model="form.rule_key" /></el-form-item>
        <el-form-item label="规则名称"><el-input v-model="form.title" /></el-form-item>
        <div class="row"><el-form-item label="事项类型"><el-select v-model="form.case_type"><el-option label="行政处罚" value="penalty" /><el-option label="经营异常" value="abnormal" /></el-select></el-form-item>
        <el-form-item label="等级"><el-select v-model="form.level"><el-option v-for="(l,k) in levels" :key="k" :value="k" :label="l" /></el-select></el-form-item></div>
        <el-form-item label="适用机关关键词（与事项决定机关匹配）"><el-input v-model="form.authority_match" /></el-form-item>
        <el-form-item label="官方来源网址"><el-input v-model="form.source_url" /></el-form-item>
        <div class="row"><el-form-item label="生效日期"><el-date-picker v-model="form.effective_from" value-format="YYYY-MM-DD" /></el-form-item><el-form-item label="失效日期（可空）"><el-date-picker v-model="form.effective_until" value-format="YYYY-MM-DD" /></el-form-item></div>
        <div class="row"><el-form-item label="最短公示月数"><el-input-number v-model="form.definition.months" :min="0" :max="120" /></el-form-item><el-form-item label="办理参考天数"><el-input-number v-model="form.definition.reviewDays" :min="1" :max="365" /></el-form-item></div>
        <el-form-item label="材料清单"><el-checkbox-group v-model="form.definition.materials"><el-checkbox v-for="(l,k) in materials" :key="k" :value="k" :label="k">{{l}}</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="复核状态"><el-select v-model="form.review_status"><el-option value="draft" label="草稿，暂不用于判定" /><el-option value="reviewed" label="已核对来源与适用范围" /></el-select></el-form-item>
        <el-form-item label="复核说明"><el-input v-model="form.review_note" type="textarea" maxlength="500" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="opened=false">取消</el-button><el-button type="primary" :loading="busy" @click="save">保存新版本</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup>
import {ref,onMounted} from 'vue'
import {ElMessage} from 'element-plus'
import {api} from '../api.js'
const items=ref([]),busy=ref(false),opened=ref(false),form=ref({definition:{}})
const levels={minor:'轻微',general:'一般',serious:'严重',severe:'严重违法'},materials={apply:'申请书',promise:'承诺书',rectify:'整改说明',auth:'授权书',list:'目录',plan:'整改计划'}
async function load(){items.value=(await api.ruleVersions()).items}
function openNew(){form.value={rule_key:'',title:'',case_type:'penalty',level:'general',authority_match:'',source_url:'',effective_from:'',effective_until:null,review_status:'draft',review_note:'',definition:{months:6,reviewDays:15,materials:['apply','promise','rectify','list']}};opened.value=true}
function revise(row){form.value=JSON.parse(JSON.stringify(row));if(typeof form.value.definition==='string')form.value.definition=JSON.parse(form.value.definition);form.value.review_status='draft';opened.value=true}
async function save(){busy.value=true;try{await api.createRuleVersion(form.value);await load();opened.value=false;ElMessage.success('新版本已保存，历史诊断保持原记录')}catch(e){ElMessage.error(e.message)}finally{busy.value=false}}
onMounted(()=>load().catch(e=>ElMessage.error(e.message)))
</script>
