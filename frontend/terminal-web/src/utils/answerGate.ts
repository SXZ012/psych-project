/** One answer per tap: the second click of a double tap belongs to the old card. */
export function createAnswerGate(now: () => number = () => performance.now(), delay = 400) {
  let nextAllowed = 0
  return {
    accept(repeated = false) {
      if (repeated || now() < nextAllowed) return false
      nextAllowed = now() + delay
      return true
    },
  }
}
