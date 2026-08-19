export function formatDateTime(value:string|null|undefined){if(!value)return'—';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}
export function maskId(value:string|null|undefined){if(!value)return'—';if(value.includes('*'))return value;return value.length===18?`${value.slice(0,3)}***********${value.slice(-4)}`:value}
export function displayNumber(value:unknown,digits=1){const n=Number(value);return Number.isFinite(n)?n.toFixed(digits):'—'}
export function displayPercent(value:unknown){const n=Number(value);if(!Number.isFinite(n))return'—';return`${(Math.abs(n)<=1?n*100:n).toFixed(1)}%`}
export function getAt(source:unknown,path:string,fallback:unknown=null):any{let current:any=source;for(const key of path.split('.')){if(current==null||typeof current!=='object'||!(key in current))return fallback;current=current[key]}return current??fallback}
