import type { AssessmentStatus,ReviewStatus } from '@/types/assessment'
export const reviewOptions:{value:ReviewStatus;label:string}[]=[{value:'pending',label:'待查看'},{value:'following',label:'已查看'},{value:'closed',label:'已结案'}]
export function reviewLabel(value:ReviewStatus){return reviewOptions.find(x=>x.value===value)?.label||value}
export function processLabel(value:AssessmentStatus){return({pending:'待处理',video_processing:'视频质检',uploading:'正在上传',queued:'等待分析',processing:'分析中',report_generating:'生成报告',completed:'已完成',invalid_result:'结果无效',failed:'处理失败'} as Record<string,string>)[value]||value}
// 等级→色调规则迁移至共享层（frontend/shared/report-kit）：终端个人报告与后台使用同一颜色规则
export { statusTone } from '../../../shared/report-kit/formatters'
