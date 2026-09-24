export type CommunityPhase =
  | 'welcome'
  | 'brief'
  | 'payment_mock'
  | 'consent'
  | 'assets_loading'
  | 'opening'
  | 'face_ready'
  | 'practice'
  | 'countdown'
  | 'capturing'
  | 'closing'
  | 'report_processing'
  | 'complete'
  | 'submit_failed'
  | 'assets_failed'
  | 'quality_failed'
  | 'device_error'

/** GET /api/v1/session/config 返回的场景配置 */
export interface DeviceSceneConfig {
  scene: 'aviation' | 'community'
  deviceName: string | null
  deviceLocation: string | null
  needPayment: boolean
  needVideo: boolean
  needFaceCheck: boolean
  questionCount: number
  questionDuration: number
  reportType: string
  phases: string[]
}
