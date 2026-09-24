import axios from 'axios'
export const http=axios.create({baseURL:'/api/v1',timeout:20000,withCredentials:true,headers:{'Content-Type':'application/json'}})
const SESSION_KEY='psych_admin_authenticated'
http.interceptors.response.use(response=>response,error=>{
  const status:number|undefined=error.response?.status
  const raw:unknown=error.response?.data?.detail
  let message=error.message||'请求失败'
  if(typeof raw==='string')message=raw
  else if(raw&&typeof raw==='object'){const {code,message:msg}=raw as{code?:string;message?:string};message=[code,msg].filter(Boolean).join(': ')||'请求失败'}
  if(status===401){
    // 服务端会话过期/重启：清本地标记回登录页，而不是把"需要管理员登录"当普通错误晾在页面上
    sessionStorage.removeItem(SESSION_KEY)
    if(!location.pathname.startsWith('/login'))location.replace('/login')
  }
  return Promise.reject(Object.assign(new Error(message),{status}))
})
