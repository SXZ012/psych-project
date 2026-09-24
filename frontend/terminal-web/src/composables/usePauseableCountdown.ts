import { onBeforeUnmount, ref } from 'vue'

/**
 * 可暂停的自动退出倒计时（完成/报告页共用）。
 *
 * - 默认按秒递减，归零触发 onExpire；
 * - 用户按下（pointerdown/touchstart）即暂停，抬起/离开后恢复——
 *   触摸期间绝不跳走，解决“扫码来不及”；
 * - 任何交互重置回满额（可选，默认开）；
 * - 组件卸载自动清理。
 */
export function usePauseableCountdown(seconds: number, onExpire: () => void, opts: { resetOnActivity?: boolean } = {}) {
  const remaining = ref(seconds)
  const paused = ref(false)
  let timer: number | null = null
  const resetOnActivity = opts.resetOnActivity !== false

  function start() {
    stop()
    timer = window.setInterval(() => {
      if (paused.value) return
      remaining.value -= 1
      if (remaining.value <= 0) { stop(); onExpire() }
    }, 1_000)
  }
  function stop() { if (timer !== null) { window.clearInterval(timer); timer = null } }
  function pause() { paused.value = true }
  function resume() { paused.value = false; if (resetOnActivity) remaining.value = seconds }
  function reset() { remaining.value = seconds }

  // 绑定到宿主元素：按下暂停、抬起恢复
  function bind(el: HTMLElement) {
    el.addEventListener('pointerdown', pause)
    el.addEventListener('pointerup', resume)
    el.addEventListener('pointerleave', resume)
    el.addEventListener('touchstart', pause, { passive: true })
    el.addEventListener('touchend', resume)
  }
  function unbind(el: HTMLElement) {
    el.removeEventListener('pointerdown', pause)
    el.removeEventListener('pointerup', resume)
    el.removeEventListener('pointerleave', resume)
    el.removeEventListener('touchstart', pause)
    el.removeEventListener('touchend', resume)
  }

  onBeforeUnmount(stop)
  return { remaining, paused, start, stop, reset, bind, unbind }
}
