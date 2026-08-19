import { http } from './http'
export async function login(password:string):Promise<void>{await http.post('/admin/login',{password})}
