import { useEffect, useState } from 'react'

let supported: boolean | undefined
function supports(): boolean {
  if (typeof supported === 'boolean') return supported
  if (typeof window === 'undefined') { supported = false; return false }
  supported = typeof (window as any).SpeechSynthesisUtterance === 'function'
    && typeof (window as any).speechSynthesis?.speak === 'function'
  return supported
}

export function speechPlay(word: string, lang = 'en-US', rate = 1) {
  if (!supports()) return
  try {
    const synth = (window as any).speechSynthesis as SpeechSynthesis
    synth.cancel()
    const U = (window as any).SpeechSynthesisUtterance as any
    const u = new U(word)
    u.lang = lang
    u.rate = rate
    synth.speak(u)
  } catch { /* noop */ }
}

export function useSpeechSupported() {
  const [ok, setOk] = useState<boolean>(() => typeof window !== 'undefined' ? supports() : false)
  useEffect(() => { setOk(supports()) }, [])
  return ok
}

export function useSpeech() {
  const ok = useSpeechSupported()
  return { supported: ok, play: speechPlay }
}
