import { createRouter,createWebHistory } from 'vue-router'
import LoginPage from '@/pages/LoginPage.vue'
import AssessmentListPage from '@/pages/AssessmentListPage.vue'
import ReportPage from '@/pages/ReportPage.vue'
const router=createRouter({history:createWebHistory('/admin/'),routes:[{path:'/',redirect:'/assessments'},{path:'/login',name:'login',component:LoginPage,meta:{public:true}},{path:'/assessments',name:'assessments',component:AssessmentListPage},{path:'/assessments/:id/report',name:'report',component:ReportPage,props:true},{path:'/:pathMatch(.*)*',redirect:'/assessments'}]})
router.beforeEach(to=>to.meta.public||sessionStorage.getItem('psych_admin_authenticated')==='1'?true:{name:'login',query:{redirect:to.fullPath}})
export default router
