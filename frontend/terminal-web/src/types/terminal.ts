export type TerminalPhase =
  | 'login' | 'consent' | 'detect' | 'practice'
  | 'countdown'        // 3 秒倒计时（准备/练习/倒计时均不计入正式 60 秒）
  | 'assess'           // 60 秒连续引导采集
  | 'captured'         // 采集完成即时反馈（与上传解耦）
  | 'capture_invalid'  // 本轮采集无效（质量中断超容忍等，需重新就位）
  | 'quality_restart'  // 服务端视频 QA 拒绝（既有语义）
  | 'loading' | 'submitting' | 'submit_failed' | 'complete'
/** 终端登记仅采集姓名和工号；后端兼容字段保持为空值。 */
export interface UserIdentity { name: string; employee_no: string; gender: string; age: number }
export interface QuestionOption { id: string; text: string }
export interface TerminalQuestion {
  id: string
  question: string
  options: QuestionOption[]
  image: string
  dimension?: string
  scenario?: string
  audioUrl?: string
  contentVersion?: string
  scoringMode?: 'observation_only' | 'validated'
}
export interface NativeResult { ok?: boolean; error?: string; assessment_id?: string; [key: string]: unknown }
