import { http } from './http'
import type { AssessmentDetail,AssessmentListItem,AssessmentQuery,ReviewStatus } from '@/types/assessment'
export async function listAssessments(params:AssessmentQuery={}):Promise<AssessmentListItem[]>{const{data}=await http.get<AssessmentListItem[]>('/assessments',{params:{limit:50,...params}});return data}
export async function getAssessment(id:string):Promise<AssessmentDetail>{const{data}=await http.get<AssessmentDetail>(`/assessments/${id}`);return data}
export async function updateReviewStatus(id:string,review_status:ReviewStatus):Promise<void>{await http.patch(`/admin/assessments/${id}/review-status`,{review_status})}
export async function updateNote(id:string,admin_note:string|null):Promise<void>{await http.patch(`/admin/assessments/${id}/note`,{admin_note})}
export async function updateInfo(id:string,data:{name:string;subject_id:string;id_card?:string}):Promise<void>{await http.put(`/admin/assessments/${id}/info`,data)}
