import { computed,ref } from 'vue'
import { defineStore } from 'pinia'
import { getAssessment,listAssessments,updateNote,updateReviewStatus } from '@/api/assessments'
import type { AssessmentDetail,AssessmentListItem,ReviewFilter,ReviewStatus } from '@/types/assessment'
import { beijingDate } from '@/utils/formatters'
const PAGE_SIZE=100 // 与后端 limit 上限一致；超出部分靠"加载更多"翻页
export const useAssessmentStore=defineStore('assessments',()=>{
 const records=ref<AssessmentListItem[]>([]),current=ref<AssessmentDetail|null>(null),loading=ref(false),loadingMore=ref(false),hasMore=ref(false),detailLoading=ref(false),error=ref(''),search=ref(''),reviewFilter=ref<ReviewFilter>('all'),dateFilter=ref<string|'all'>('all')
 const reviewState=(item:AssessmentListItem):Exclude<ReviewFilter,'all'>=>item.review_status==='pending'?'pending':'viewed'
 const filtered=computed(()=>records.value.filter(item=>{const status=reviewFilter.value==='all'||reviewState(item)===reviewFilter.value;const date=dateFilter.value==='all'||beijingDate(item.created_at)===dateFilter.value;const q=search.value.trim().toLowerCase();const keyword=!q||[item.name,item.id_card,item.subject_id,item.id].some(v=>v?.toLowerCase().includes(q));return status&&date&&keyword}))
 async function load(){loading.value=true;error.value='';try{const page=await listAssessments({limit:PAGE_SIZE});records.value=page;hasMore.value=page.length>=PAGE_SIZE}catch(e){error.value=e instanceof Error?e.message:'加载失败'}finally{loading.value=false}}
 async function loadMore(){if(loadingMore.value||!hasMore.value)return;loadingMore.value=true;try{const page=await listAssessments({limit:PAGE_SIZE,offset:records.value.length});const seen=new Set(records.value.map(r=>r.id));records.value.push(...page.filter(r=>!seen.has(r.id)));hasMore.value=page.length>=PAGE_SIZE}catch(e){error.value=e instanceof Error?e.message:'加载更多失败'}finally{loadingMore.value=false}}
 async function open(id:string){detailLoading.value=true;error.value='';try{current.value=await getAssessment(id)}catch(e){error.value=e instanceof Error?e.message:'报告加载失败';throw e}finally{detailLoading.value=false}}
 async function setReviewStatus(id:string,status:ReviewStatus){await updateReviewStatus(id,status);const r=records.value.find(x=>x.id===id);if(r)r.review_status=status;if(current.value?.id===id)current.value.review_status=status}
 async function saveNote(id:string,note:string|null){await updateNote(id,note);const r=records.value.find(x=>x.id===id);if(r)r.admin_note=note;if(current.value?.id===id)current.value.admin_note=note}
 return{records,current,loading,loadingMore,hasMore,detailLoading,error,search,reviewFilter,dateFilter,reviewState,filtered,load,loadMore,open,setReviewStatus,saveNote}
})
