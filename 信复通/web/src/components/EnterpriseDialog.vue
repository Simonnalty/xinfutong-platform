<template>
  <el-dialog :model-value="modelValue" :title="enterprise ? '编辑企业档案' : '建立企业档案'" width="min(620px, 94vw)" :close-on-click-modal="false" @update:model-value="$emit('update:modelValue', $event)">
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" style="margin-bottom:16px" />
    <el-form label-position="top" @submit.prevent="save">
      <el-form-item label="企业名称（必填）"><el-input v-model="form.name" maxlength="200" placeholder="与营业执照一致" /></el-form-item>
      <el-form-item label="统一社会信用代码（必填）"><el-input v-model="form.credit_code" maxlength="18" :disabled="!!enterprise" placeholder="18 位统一社会信用代码" /></el-form-item>
      <div class="archive-form-grid">
        <el-form-item label="法定代表人"><el-input v-model="form.legal" maxlength="50" /></el-form-item>
        <el-form-item label="地区">
          <div class="region-fields">
            <el-select v-model="province" clearable filterable placeholder="选择省份" @change="changeProvince"><el-option v-for="p in regionData" :key="p.province" :value="p.province" :label="p.province" /></el-select>
            <el-select v-if="cities.length" v-model="city" clearable filterable placeholder="选择城市" @change="syncRegion"><el-option v-for="c in cities" :key="c" :value="c" :label="c" /></el-select>
          </div>
          <div v-if="legacyRegion" class="region-legacy">原有地区：{{ legacyRegion }}。请选择正确的省市进行修正。</div>
        </el-form-item>
        <el-form-item label="所属行业"><el-input v-model="form.industry" maxlength="60" /></el-form-item>
        <el-form-item label="企业规模"><el-select v-model="form.scale" clearable><el-option v-for="s in ['微型企业','小型企业','中型企业','大型企业']" :key="s" :value="s" :label="s" /></el-select></el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact" maxlength="50" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="form.phone" maxlength="20" /></el-form-item>
      </div>
    </el-form>
    <template #footer><el-button @click="$emit('update:modelValue',false)">取消</el-button><el-button type="primary" :loading="saving" @click="save">{{ enterprise ? '保存档案' : '创建企业' }}</el-button></template>
  </el-dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import regionData from '../../../db/regions-province-city.json'
import { api } from '../api.js'
import { refreshEnterprises } from '../store.js'
const props = defineProps({ modelValue:Boolean, enterprise:Object })
const emit = defineEmits(['update:modelValue','saved'])
const form=reactive({}), saving=ref(false), error=ref('')
const province=ref(''), city=ref(''), legacyRegion=ref('')
const cities=computed(()=>regionData.find(p=>p.province===province.value)?.cities || [])
function syncRegion(){ form.region = province.value + city.value; legacyRegion.value = '' }
function changeProvince(){ city.value=''; syncRegion() }
watch(()=>props.modelValue, open=>{
  if (!open) return
  error.value=''
  for (const k of ['name','credit_code','legal','industry','region','scale','contact','phone']) form[k]=props.enterprise?.[k] || ''
  const match=regionData.find(p=>p.cities.length ? p.cities.some(c=>p.province+c===form.region) : p.province===form.region)
  province.value=match?.province || ''; city.value=match?.cities.find(c=>match.province+c===form.region) || ''
  legacyRegion.value=form.region && !match ? form.region : ''
})
async function save() {
  if (!form.name.trim() || !form.credit_code.trim()) { error.value='请填写企业名称和统一社会信用代码'; return }
  if (province.value && cities.value.length && !city.value) { error.value='请选择城市'; return }
  saving.value=true; error.value=''
  try {
    const r=props.enterprise ? await api.updateEnterprise(props.enterprise.id,form) : await api.createEnterprise(form)
    await refreshEnterprises(r.enterprise.id)
    emit('saved',r.enterprise); emit('update:modelValue',false)
  } catch(e) {error.value=e.message} finally {saving.value=false}
}
</script>
<style>
.archive-form-grid {display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.region-fields {display:flex;gap:8px;width:100%}.region-fields .el-select{min-width:0;flex:1}.region-legacy{font-size:12px;color:#a45d13;line-height:1.5}
@media(max-width:600px){.archive-form-grid{grid-template-columns:1fr}}
</style>
