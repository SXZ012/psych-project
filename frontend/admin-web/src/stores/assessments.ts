import { computed,ref } from 'vue'
import { defineStore } from 'pinia'
import { getAssessment,listAssessments,updateNote,updateReviewStatus } from '@/api/assessments'
import type { AssessmentDetail,AssessmentListItem,ReviewFilter,ReviewStatus } from '@/types/assessment'
export const useAssessmentStore=defineStore('assessments',()=>{
 const records=ref<AssessmentListItem[]>([]),current=ref<AssessmentDetail|null>(null),loading=ref(false),detailLoading=ref(false),error=ref(''),search=ref(''),reviewFilter=ref<ReviewFilter>('all'),dateFilter=ref<string|'all'>('all')
 const reviewState=(item:AssessmentListItem):Exclude<ReviewFilter,'all'>=>item.review_status==='pending'?'pending':'viewed'
 const filtered=computed(()=>records.value.filter(item=>{const status=reviewFilter.value==='all'||reviewState(item)===reviewFilter.value;const date=dateFilter.value==='all'||item.created_at.slice(0,10)===dateFilter.value;const q=search.value.trim().toLowerCase();const keyword=!q||[item.name,item.id_card,item.subject_id,item.id].some(v=>v?.toLowerCase().includes(q));return status&&date&&keyword}))
 async function load(){loading.value=true;error.value='';try{records.value=await listAssessments({limit:100})}catch(e){error.value=e instanceof Error?e.message:'加载失败'}finally{loading.value=false}}
 async function open(id:string){detailLoading.value=true;error.value='';try{current.value=await getAssessment(id)}catch(e){error.value=e instanceof Error?e.message:'报告加载失败';throw e}finally{detailLoading.value=false}}
 async function setReviewStatus(id:string,status:ReviewStatus){await updateReviewStatus(id,status);const r=records.value.find(x=>x.id===id);if(r)r.review_status=status;if(current.value?.id===id)current.value.review_status=status}
 async function saveNote(id:string,note:string|null){await updateNote(id,note);const r=records.value.find(x=>x.id===id);if(r)r.admin_note=note;if(current.value?.id===id)current.value.admin_note=note}
 return{records,current,loading,detailLoading,error,search,reviewFilter,dateFilter,reviewState,filtered,load,open,setReviewStatus,saveNote}
})
