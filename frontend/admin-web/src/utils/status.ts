import type { AssessmentStatus,ReviewStatus } from '@/types/assessment'
export const reviewOptions:{value:ReviewStatus;label:string}[]=[{value:'pending',label:'待查看'},{value:'following',label:'跟进中'},{value:'closed',label:'已结案'}]
export function reviewLabel(value:ReviewStatus){return reviewOptions.find(x=>x.value===value)?.label||value}
export function processLabel(value:AssessmentStatus){return({pending:'待处理',video_processing:'视频质检',uploading:'正在上传',queued:'等待分析',processing:'分析中',report_generating:'生成报告',completed:'已完成',invalid_result:'结果无效',failed:'处理失败'} as Record<string,string>)[value]||value}
export function statusTone(value:string){if(/completed|closed|正常|稳定|通过|低/.test(value))return'success';if(/failed|invalid|失败|高风险|明显/.test(value))return'danger';if(/processing|uploading|queued|following|偏高|关注/.test(value))return'warning';return'neutral'}
