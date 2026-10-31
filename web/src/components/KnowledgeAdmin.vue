<template>
 <div class="card card-pad"><div class="spread"><h3>知识内容维护</h3><el-button type="primary" @click="open=true">新增知识</el-button></div><el-table :data="items"><el-table-column prop="title" label="标题"/><el-table-column prop="issuer" label="来源单位"/><el-table-column label="状态"><template #default="{row}">{{ row.review_status==='reviewed'?'已复核发布':'草稿' }}</template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-button v-if="row.review_status==='draft'" text @click="copy(row)">完善后发布新版</el-button></template></el-table-column></el-table></div>
 <el-dialog v-model="open" title="新增知识内容" width="660px"><el-form label-position="top"><el-form-item label="标题"><el-input v-model="form.title" maxlength="200"/></el-form-item><el-form-item label="分类"><el-select v-model="form.category"><el-option label="法规政策" value="policy"/><el-option label="办理指引" value="guide"/><el-option label="典型案例" value="case"/></el-select></el-form-item><el-form-item label="正文"><el-input v-model="form.body" type="textarea" :rows="6" maxlength="20000"/></el-form-item><el-form-item label="来源单位"><el-input v-model="form.issuer" maxlength="100"/></el-form-item><el-form-item label="来源链接"><el-input v-model="form.source_url" maxlength="500"/></el-form-item><el-form-item label="生效日期"><el-date-picker v-model="form.effective_at" value-format="YYYY-MM-DD"/></el-form-item><el-form-item label="发布状态"><el-radio-group v-model="form.review_status"><el-radio value="draft">保存草稿</el-radio><el-radio value="reviewed">已复核并发布</el-radio></el-radio-group></el-form-item><el-form-item label="复核说明（发布必填）"><el-input v-model="form.review_note" type="textarea" maxlength="500"/></el-form-item></el-form><template #footer><el-button @click="open=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存内容</el-button></template></el-dialog>
</template>
<script setup>
import {ref,onMounted} from 'vue'
import {ElMessage} from 'element-plus'
import {api} from '../api.js'
const items=ref([]),open=ref(false),saving=ref(false),form=ref({title:'',category:'policy',body:'',issuer:'',source_url:'',effective_at:null,review_status:'draft',review_note:''})
async function load(){try{items.value=(await api.adminKnowledge()).items}catch(e){ElMessage.error(e.message)}}
function copy(row){form.value={...row,review_status:'draft'};open.value=true}
async function save(){saving.value=true;try{await api.createKnowledge(form.value);open.value=false;await load();ElMessage.success('知识内容已保存')}catch(e){ElMessage.error(e.message)}finally{saving.value=false}}
onMounted(load)
</script>
