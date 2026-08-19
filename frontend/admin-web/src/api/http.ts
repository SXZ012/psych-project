import axios from 'axios'
export const http=axios.create({baseURL:'/api/v1',timeout:20000,withCredentials:true,headers:{'Content-Type':'application/json'}})
http.interceptors.response.use(response=>response,error=>Promise.reject(new Error(error.response?.data?.detail||error.message||'请求失败')))
