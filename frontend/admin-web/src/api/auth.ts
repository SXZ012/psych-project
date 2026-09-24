import { http } from './http'
export async function login(password:string):Promise<void>{await http.post('/admin/login',{password})}
/** 退出登录：同时清掉服务端会话（多人共用终端的隐私清理要求）。 */
export async function logout():Promise<void>{await http.post('/admin/logout')}
