<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
type Appointment = { id:string; phone:string; topics:string[]; contact_time:string; status:string; is_demo:boolean; created_at:string }
const rows = ref<Appointment[]>([]), error = ref(''), busy = ref(false), offset = ref(0)
const statuses: Record<string,string> = {pending:'待联系',contacted:'已联系',closed:'已结束'}
async function load() {
  busy.value=true; error.value=''
  try {
    const response=await fetch(`/api/v1/community/appointments?offset=${offset.value}`, {cache:'no-store'})
    if(!response.ok) throw new Error(response.status===401?'请重新登录后查看预约':'加载失败，请重试')
    rows.value=await response.json()
  } catch(e) { error.value=String(e) } finally {busy.value=false}
}
async function update(item:Appointment,event:Event) {
  const next=(event.target as HTMLSelectElement).value
  busy.value=true
  try {
    const response=await fetch(`/api/v1/community/appointments/${item.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})})
    if(!response.ok) throw new Error('状态未保存，请重试')
    item.status=next
  } catch(e) { error.value=String(e); (event.target as HTMLSelectElement).value=item.status } finally {busy.value=false}
}
onMounted(load)
</script>
<template><AdminLayout><section class="appointments"><header><div><h1>社区咨询预约</h1><p>登记意向后，由工作人员确认联系安排。演示记录不代表已安排咨询。</p></div><button :disabled="busy" @click="load">刷新</button></header><p v-if="error" role="alert">{{ error }}</p><table><thead><tr><th>登记时间</th><th>联系电话</th><th>希望获得的支持</th><th>联系时段</th><th>跟进状态</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td>{{ new Date(item.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}) }}<small v-if="item.is_demo">演示记录</small></td><td>{{ item.phone }}</td><td>{{ item.topics.join('、') }}</td><td>{{ item.contact_time }}</td><td><select :value="item.status" :disabled="busy" @change="update(item,$event)"><option v-for="(name,key) in statuses" :key="key" :value="key">{{ name }}</option></select></td></tr></tbody></table><p v-if="!busy&&!rows.length">暂无预约意向</p><footer><button :disabled="busy||offset===0" @click="offset=Math.max(0,offset-50);load()">上一页</button><span>第 {{ offset/50+1 }} 页</span><button :disabled="busy||rows.length<50" @click="offset+=50;load()">下一页</button></footer></section></AdminLayout></template>
<style scoped>.appointments{padding:32px;color:#283e35}.appointments header{display:flex;justify-content:space-between;align-items:center}.appointments h1{font-size:28px}.appointments p{line-height:1.7}.appointments table{width:100%;border-collapse:collapse;margin-top:24px;background:#fff}.appointments th,.appointments td{padding:18px 14px;text-align:left;border-bottom:1px solid #e3eae5}.appointments small{display:block;color:#86622f}.appointments button,.appointments select{min-height:44px;border:1px solid #cbdad0;border-radius:8px;background:#f2f7f2;padding:8px 16px}.appointments footer{display:flex;align-items:center;gap:20px;margin-top:24px}</style>
