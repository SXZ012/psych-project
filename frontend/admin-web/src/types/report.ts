export type ReportTab='overview'|'au'|'rppg'|'vibra'|'eye'
export interface PageSummary{text:string;constraint:string}
export interface MetricView{key:string;name:string;value:string;level:string;unit?:string}
export interface ReportTabDefinition{key:ReportTab;label:string;kicker:string;title:string;hint:string}
