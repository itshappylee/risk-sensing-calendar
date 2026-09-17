import type { RiskEvent } from './types'
import { SAMPLE_EVENTS } from './sampleData'
import { client, isConfigured } from './supabaseClient'
import { log } from './log'

export { isConfigured }

export type LoadState =
  | { kind: 'sample'; events: RiskEvent[] }
  | { kind: 'ok'; events: RiskEvent[] }
  | { kind: 'empty'; events: [] }
  | { kind: 'error'; events: []; message: string }

/**
 * 지정한 기간과 겹치는 이벤트를 가져온다.
 * 겹침 조건: date_start <= to AND date_end >= from
 */
export async function fetchEvents(from: string, to: string): Promise<LoadState> {
  if (!client) {
    return { kind: 'sample', events: SAMPLE_EVENTS }
  }

  const { data, error } = await client
    .from('events')
    .select('*')
    .lte('date_start', to)
    .gte('date_end', from)
    // 취소된 이벤트도 가져온다. WF-3 규칙은 "본문에서 빼되 **별도 표시**"이므로
    // 쿼리에서 버리면 담당자가 가장 아파하는 신호("갑작스러운 휴일 취소")를 잃는다.
    // 본문 제외는 화면에서 isActiveRisk()로 처리한다. → Q-024 #1
    .order('date_start', { ascending: true })

  if (error) {
    log('error', 'fetchEvents 실패', {
      path: 'lib/supabase.fetchEvents',
      from,
      to,
      supabaseError: error.message,
    })
    return { kind: 'error', events: [], message: error.message }
  }
  if (!data || data.length === 0) {
    // RLS가 켜져 있고 anon SELECT 정책이 없으면 에러가 아니라 빈 배열이 온다.
    // 조용히 "이벤트 없음"으로 보이는 게 가장 위험하므로 별도 상태로 구분하고 기록한다.
    log('warn', 'fetchEvents 0건 — RLS 정책 미설정 가능성', {
      path: 'lib/supabase.fetchEvents',
      from,
      to,
    })
    return { kind: 'empty', events: [] }
  }
  return { kind: 'ok', events: data as RiskEvent[] }
}

/** 국가 필터용 목록. 현재 로드된 이벤트에서 뽑는다. */
export function uniqueCountries(events: RiskEvent[]): string[] {
  return [...new Set(events.map((e) => e.country))].sort()
}
