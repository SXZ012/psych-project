export type ReportTab='overview'|'screening'|'core'|'evidence'
export type EvidenceTab='au'|'rppg'|'vibra'|'eye'
export interface PageSummary{text:string;constraint:string}
export interface MetricView{key:string;name:string;value:string;level:string;unit?:string}
export interface ReportTabDefinition{key:ReportTab;label:string;kicker:string;title:string;hint:string}
export interface DetailedMetricView {
  key:string;name:string;technicalName:string;score:number|null;level:string;grade:string
  thresholds:number[];referenceText:string;definition:string;plainMeaning:string
  aviationMeaning:string;limitation:string;recommendation:string;confidence:string
  direction:'higher_load'|'higher_better';source:string;weakReference:boolean
  originalLevel?:string
}
