export type TerminalPhase = 'login' | 'consent' | 'detect' | 'intro' | 'assess' | 'loading' | 'submitting' | 'submit_failed' | 'complete'
export interface UserIdentity { name: string; id_card: string }
export interface QuestionOption { id: string; text: string }
export interface TerminalQuestion { id: string; question: string; options: QuestionOption[]; image: string }
export interface NativeResult { ok?: boolean; error?: string; assessment_id?: string; [key: string]: unknown }
