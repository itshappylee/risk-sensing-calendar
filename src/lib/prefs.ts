import type { Lang } from './types'

/**
 * 브라우저에만 저장하는 사용자 설정. 서버·계정 없이 매일의 반복 클릭을 없애는 게 목적이다.
 *
 * ⚠️ 개인정보나 비밀값은 절대 넣지 않는다. 담당 국가·언어처럼
 * 잃어버려도 되는 값만 둔다 (다른 PC에서 열면 초기값으로 시작한다).
 */

const KEY = 'sels.prefs.v1'

export interface Prefs {
  /** 담당 국가. 비어 있으면 전체 */
  country: string | null
  lang: Lang
  view: 'month' | 'map' | 'list'
}

const DEFAULTS: Prefs = { country: null, lang: 'ko', view: 'month' }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      country: typeof parsed.country === 'string' ? parsed.country : null,
      lang: parsed.lang === 'en' ? 'en' : 'ko',
      view: parsed.view === 'list' || parsed.view === 'map' ? parsed.view : 'month',
    }
  } catch {
    // 저장값이 깨졌거나 localStorage가 막힌 환경(사생활 보호 모드 등) — 기본값으로 조용히 진행
    return { ...DEFAULTS }
  }
}

export function savePrefs(p: Partial<Prefs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...p }))
  } catch {
    // 저장 실패는 기능을 막지 않는다 (다음 방문에 설정이 안 남을 뿐)
  }
}
