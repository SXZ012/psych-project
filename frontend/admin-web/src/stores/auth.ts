import { defineStore } from 'pinia'
import { ref } from 'vue'
import { login } from '@/api/auth'
const SESSION_KEY='psych_admin_authenticated'
export const useAuthStore=defineStore('auth',()=>{const authenticated=ref(sessionStorage.getItem(SESSION_KEY)==='1');async function signIn(password:string){await login(password);sessionStorage.setItem(SESSION_KEY,'1');authenticated.value=true}function clear(){sessionStorage.removeItem(SESSION_KEY);authenticated.value=false}return{authenticated,signIn,clear}})
