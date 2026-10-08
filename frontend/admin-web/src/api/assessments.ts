import { http } from './http'
import type { AssessmentDetail,AssessmentListItem,AssessmentQuery,ReviewStatus } from '@/types/assessment'
export interface AssessmentPage { items: AssessmentListItem[]; total: number }
export async function listAssessments(params: AssessmentQuery = {}): Promise<AssessmentPage> {
  const { data, headers } = await http.get<AssessmentListItem[]>('/assessments', { params: { limit: 100, scene: 'all', ...params } })
  const rawTotal = headers['x-total-count']
  const total = Number(rawTotal)
  if (rawTotal == null || !Number.isSafeInteger(total) || total < 0) throw new Error('报告总数加载失败，请刷新重试。')
  return { items: data, total }
}
export async function generateCommunityPdf(id:string):Promise<void>{await http.post(`/admin/assessments/${id}/regenerate-pdf`,undefined,{timeout:120000})}
export function communityPdfUrl(id:string,download=false):string{return `/api/v1/admin/assessments/${encodeURIComponent(id)}/pdf?download=${download}`}
export async function getAssessment(id:string):Promise<AssessmentDetail>{const{data}=await http.get<AssessmentDetail>(`/assessments/${id}`);return data}
export async function updateReviewStatus(id:string,review_status:ReviewStatus):Promise<void>{await http.patch(`/admin/assessments/${id}/review-status`,{review_status})}
export async function updateNote(id:string,admin_note:string|null):Promise<void>{await http.patch(`/admin/assessments/${id}/note`,{admin_note})}
export async function updateInfo(id:string,data:{name:string;subject_id:string;id_card?:string}):Promise<void>{await http.put(`/admin/assessments/${id}/info`,data)}
/** 重新分析失败任务：复用已保存的原始视频，不重新上传（需管理员会话）。
 * 后端返回 AssessmentOut（不含 result 等详情字段），调用方随后需重新拉取详情。 */
export async function resubmitAssessment(id:string):Promise<Partial<AssessmentDetail>>{const{data}=await http.post<Partial<AssessmentDetail>>(`/assessments/${id}/resubmit`);return data}
