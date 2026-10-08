<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
defineProps<{ assetsReady: boolean; assetsError: string }>()
const agreed=ref(false); const readComplete=ref(false)
const readingBody=ref<HTMLElement|null>(null)
let readingObserver: ResizeObserver | null = null
function checkReading(){const el=readingBody.value;if(el && el.scrollTop+el.clientHeight>=el.scrollHeight-18)readComplete.value=true}
onMounted(()=>{checkReading();readingObserver=new ResizeObserver(checkReading);if(readingBody.value)readingObserver.observe(readingBody.value)})
onBeforeUnmount(()=>readingObserver?.disconnect())
const emit=defineEmits<{ confirm: []; retryAssets: [] }>()
function trackReading(e:Event){const el=e.currentTarget as HTMLElement;if(el.scrollTop+el.clientHeight>=el.scrollHeight-18)readComplete.value=true}
</script>
<template>
  <main class="consent-page">
    <header><p>知情同意</p><h1>社区心理测评知情同意书</h1><span>请滑动阅读全部内容，阅读到底后即可同意。</span></header>
    <article ref="readingBody" class="consent-body" @scroll.passive="trackReading">
      <section><h2>一、测评目的与适用范围</h2><p>本测评通过面部状态和生理信号采集，对当前心理状态进行辅助评估，帮助您了解近期的情绪、压力、睡眠与恢复情况。本测评不构成医学或精神障碍诊断。</p></section>
      <section><h2>二、敏感个人信息处理</h2><p>测评会处理约 60 秒的面部影像，用于微表情和生理信号分析。面部影像属于敏感个人信息，需要取得您的单独同意。</p></section>
      <section><h2>三、数据采集方式</h2><p>摄像头只在正式测评期间连续采集。预训练和其他说明环节不会录制。您可以在开始前拒绝，也可以随时退出。</p></section>
      <section><h2>四、数据处理与保存</h2><p>视频将加密传输至心理评估服务进行分析，并按固定规则生成报告。终端退出后自动清除本地显示；记录按隐私说明保存和使用，不用于本测评目的之外。</p></section>
      <section><h2>五、报告获取与查看</h2><p>完成后可使用手机扫码查看 PDF 报告，也可凭报告编号向现场工作人员查询。报告仅限本人及经授权的服务人员查看。</p></section>
      <section><h2>六、结果用途与限制</h2><p>结果只提供心理状态参考，不能替代医疗诊断或专业治疗建议。若持续感到困扰，建议寻求专业心理或医疗帮助。</p></section>
      <section><h2>七、您的权利</h2><p>您可以申请查阅、更正、复制或删除个人信息，也可以撤回同意。撤回不影响此前基于同意完成的信息处理。</p></section>
      <section><h2>八、自愿参与</h2><p>本测评面向成年人并遵循自愿原则。您可以在任何阶段中止测评。</p></section>
    </article>
    <footer>
      <label :class="{ disabled:!readComplete }"><input v-model="agreed" type="checkbox" :disabled="!readComplete">{{ readComplete?'我已阅读、理解并同意上述条款':'阅读至底部后即可勾选同意' }}</label>
      <p v-if="!assetsReady&&!assetsError">正在准备测评图片…</p><p v-else-if="assetsError" class="error">{{ assetsError }} <button @click="emit('retryAssets')">重新加载</button></p>
      <button class="primary" :disabled="!agreed||!assetsReady" @click="emit('confirm')">{{ !readComplete?'请阅读至底部':assetsReady?'同意并继续':'正在准备测评资源' }}</button>
    </footer>
  </main>
</template>
<style scoped>
.consent-page{display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;height:100%;box-sizing:border-box;padding:72px 58px 18px;background:linear-gradient(145deg,#eef4f1,#f8f6f1);color:#29443b}.consent-page header{padding:0 4px 14px}.consent-page header p{margin:0 0 4px;color:#4f8d82;font-size:13px;font-weight:750;letter-spacing:.16em}.consent-page header h1{margin:0;font-size:28px}.consent-page header span{display:block;margin-top:5px;color:#6d8179;font-size:14px}
.consent-body{min-height:0;overflow-y:scroll;padding:22px 30px;border:1px solid #d8e4de;border-radius:18px;background:rgba(255,255,255,.88);overscroll-behavior:contain;touch-action:pan-y}.consent-body section{margin:0 0 21px}.consent-body h2{margin:0 0 5px;color:#304e43;font-size:17px}.consent-body p{margin:0;color:#536b62;font-size:15px;line-height:1.75}.consent-body::-webkit-scrollbar{width:8px}.consent-body::-webkit-scrollbar-thumb{border-radius:9px;background:#83a498}
footer{display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 24px;padding:12px 4px 0}footer label{grid-row:1/3;color:#405e53;font-size:14px}footer label.disabled{color:#87978f}footer label input{margin-right:8px}footer p{grid-column:1;margin:0;color:#6e857a;font-size:12px}.error{color:#bd5b5b}footer p button{border:0;background:transparent;color:inherit;text-decoration:underline}.primary{grid-column:2;grid-row:1/3;min-width:300px;min-height:56px;font-size:17px}


/* Calm community assessment surface; capture geometry and timing stay unchanged. */
.consent-page{background:#e9f0e9}.consent-body{border:0;box-shadow:none}.consent-body p{font-size:17px;color:#3e5749}.consent-body h2{font-size:19px}.consent-page header span{color:#52695b}
</style>
