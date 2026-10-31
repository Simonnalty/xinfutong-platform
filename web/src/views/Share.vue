<template>
 <main style="max-width:780px;margin:36px auto;padding:20px" v-loading="loading"><h1>信复通 · 企业用途材料核验</h1><el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <template v-else-if="result"><el-alert :title="result.message" :type="result.state==='valid'?'info':'warning'" :closable="false" show-icon/>
 <template v-if="result.state==='valid'"><div class="card card-pad" style="margin-top:20px"><h2>{{ result.verification.enterprise.name }}</h2><p>统一社会信用代码：{{ result.verification.enterprise.creditCode }}</p><p>用途：{{ result.purpose==='financing'?'融资材料核对':'投标材料核对' }} · 接收单位：{{ result.recipient||'未指定' }}</p><p>分享有效期至：{{ new Date(result.expiresAt).toLocaleString() }}</p><h3>修复事项</h3><p>{{ result.verification.case.event }}</p><p>决定机关：{{ result.verification.case.authority }} · 决定文号：{{ result.verification.case.docNo }}</p><p>企业登记移出日期：{{ result.verification.case.removedDate }}</p><p class="muted">{{ result.verification.officialProof.reviewType }}</p><h3>签发时渠道快照</h3><el-table :data="result.verification.channels"><el-table-column prop="name" label="渠道"/><el-table-column label="来源"><template #default="{row}">{{ {mock:'演示数据',manual:'人工观察',authorized:'授权接口'}[row.provider]||row.provider }}</template></el-table-column><el-table-column prop="state" label="记录状态"/><el-table-column prop="checkedAt" label="观察时间"/></el-table><p class="muted">渠道状态仅代表签发时记录，演示、待核验或失败记录不能证明已真实同步。</p><h3>完整性核对</h3><p>凭证版本：{{ result.verification.certificate.version }} · {{ result.verification.certificate.code }}</p><p style="overflow-wrap:anywhere">内容摘要：{{ result.verification.certificate.digest }}</p><p class="muted">平台状态说明不替代官方决定。接收方应结合官方渠道、原始材料及自身审查要求作出判断。</p></div></template></template>
 </main>
</template>
<script setup>
import {ref,onMounted} from 'vue'
import {useRoute} from 'vue-router'
import {api} from '../api.js'
const route=useRoute(),result=ref(null),loading=ref(false),error=ref('')
onMounted(async()=>{loading.value=true;try{result.value=(await api.publicShare(route.query)).result}catch(e){error.value=e.message}finally{loading.value=false}})
</script>
