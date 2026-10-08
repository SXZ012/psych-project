<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
defineProps<{ title: string; message: string; stayLabel: string; leaveLabel: string }>()
const emit = defineEmits<{ stay: []; leave: [] }>()
const panel = ref<HTMLElement | null>(null)
const stay = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('stay') }
  if (event.key !== 'Tab') return
  const buttons = panel.value?.querySelectorAll<HTMLButtonElement>('button')
  if (!buttons?.length) return
  const first = buttons[0]!, last = buttons[buttons.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => { previousFocus = document.activeElement as HTMLElement; stay.value?.focus() })
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus() })
</script>

<template>
  <Teleport to="body">
    <div class="leave-shade" @keydown="keyboard">
      <section ref="panel" role="dialog" aria-modal="true" aria-labelledby="leave-title" aria-describedby="leave-message">
        <h2 id="leave-title">{{ title }}</h2><p id="leave-message">{{ message }}</p>
        <footer><button ref="stay" class="stay" @click="emit('stay')">{{ stayLabel }}</button><button @click="emit('leave')">{{ leaveLabel }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.leave-shade{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:24px;background:#243e3659;backdrop-filter:blur(4px);font-family:inherit;color:#2d463b}
section{box-sizing:border-box;width:min(520px,100%);max-height:90dvh;overflow:auto;padding:32px;border-radius:24px;background:#fafbf7;box-shadow:0 16px 50px #193b3222}
h2{margin:0 0 14px;font-size:26px;line-height:1.4}p{margin:0;font-size:18px;line-height:1.75;color:#506258}footer{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
button{flex:1;min-width:160px;min-height:56px;padding:12px 18px;border:0;border-radius:14px;background:#e8eee7;color:#344d40;font:inherit;font-size:18px;font-weight:650;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.stay{background:#397763;color:#fff}button:focus:not(:focus-visible){outline:none}button:focus-visible{outline:3px solid #63816e;outline-offset:3px}
</style>
