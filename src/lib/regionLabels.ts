import { useSyncExternalStore } from 'react'
import { client } from './supabaseClient'
import type { Lang } from './types'
import { log } from './log'

/**
 * 지역 코드를 사람이 읽는 이름으로 바꾼다.
 *
 * 왜 필요한가 — `events.region` 한 칸에 두 가지가 섞여 들어온다.
 *   공휴일(Nager.Date) → `ES-VC`, `CH-AG`  같은 ISO 3166-2 **코드**
 *   기상(Meteoalarm)   → `Kriti`, `Kreis Soest` 같은 **이름**
 * 코드가 그대로 화면과 메일에 나가서 받는 사람이 무슨 뜻인지 몰랐다 (2026-10-08 사용자 보고).
 *
 * ⚠️ 이름표를 이 파일에 적지 않는다. 출처는 Supabase `region_labels` 한 곳뿐이고
 *    리포트 SQL도 같은 표를 본다. 코드에 복제해 두면 둘이 조용히 어긋난다 —
 *    이 프로젝트에서 이미 두 번 겪은 실패다(앱 필터 vs 리포트 SQL, n8n 주기 vs config).
 */

type Label = { en: string; ko: string }

let MAP: Record<string, Label> = {}
let status: 'idle' | 'loading' | 'done' | 'failed' = 'idle'
let version = 0
const listeners = new Set<() => void>()

function emit() {
  version++
  for (const f of listeners) f()
}

/** 한 번만 불러온다. 실패해도 코드가 그대로 보일 뿐 화면은 멀쩡하다 */
export async function loadRegionLabels(): Promise<void> {
  if (status === 'loading' || status === 'done') return
  if (!client) {
    status = 'done'
    return
  }
  status = 'loading'
  const { data, error } = await client.from('region_labels').select('code, name_en, name_ko')
  if (error) {
    status = 'failed'
    log('warn', 'region_labels 로드 실패 — 지역 코드가 그대로 보인다', {
      path: 'lib/regionLabels.loadRegionLabels',
      supabaseError: error.message,
    })
    return
  }
  const next: Record<string, Label> = {}
  for (const row of data ?? []) {
    next[String(row.code)] = { en: String(row.name_en), ko: String(row.name_ko) }
  }
  MAP = next
  status = 'done'
  emit()
}

function subscribe(f: () => void): () => void {
  listeners.add(f)
  void loadRegionLabels()
  return () => {
    listeners.delete(f)
  }
}

const getVersion = () => version

/**
 * 이름표가 준비되면 다시 그리게 한다.
 * 쓰는 쪽은 이 훅을 한 번 부르고 `regionLabel()`을 그대로 쓰면 된다.
 */
export function useRegionLabels(): void {
  useSyncExternalStore(subscribe, getVersion, getVersion)
}

/**
 * `region` 값을 표시용 문자열로. 쉼표로 여러 개면 각각 바꾼다.
 * 표에 없는 값은 **그대로 돌려준다** — 기상 지역명은 이미 사람이 읽는 이름이고,
 * 모르는 코드를 빈칸으로 만들면 정보가 사라진다.
 */
export function regionLabel(region: string | null | undefined, lang: Lang): string {
  const raw = (region ?? '').trim()
  if (!raw) return ''
  return raw
    .split(',')
    .map((part) => {
      const code = part.trim()
      if (!code) return ''
      const hit = MAP[code]
      if (!hit) return code
      return lang === 'ko' ? hit.ko : hit.en
    })
    .filter(Boolean)
    .join(', ')
}

/** 테스트·디버깅용 — 지금 몇 개나 들고 있는지 */
export function regionLabelCount(): number {
  return Object.keys(MAP).length
}
