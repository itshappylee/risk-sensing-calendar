import type { EventType } from './types'
import { client } from './supabaseClient'
import { log } from './log'

/**
 * `risk_candidates` 읽기·쓰기.
 *
 * 이 테이블은 원래 WF-1c(AI 수집 후보) 전용이었다. 2026-08-27에 사람이 넣는 경로를
 * 같은 테이블로 합쳤다 — 승인 흐름(WF-2c)을 두 벌 돌리지 않기 위해서다 (→ DEC-024, Q-021).
 *
 * ⚠️ 승격(promoted)은 여기서 건드리지 않는다. RLS가 막고 있고, WF-2c가 service_role로만 한다.
 */

/** 화면의 위험 유형 → DB category. CHECK 제약과 1:1로 맞춰야 한다 */
const CATEGORY: Record<EventType, string> = {
  'Driving Ban': 'driving_ban',
  Strike: 'strike',
  Weather: 'weather',
  'Bank Holiday': 'bank_holiday',
  Incident: 'incident',
}

export const CATEGORY_TO_TYPE: Record<string, EventType> = {
  driving_ban: 'Driving Ban',
  strike: 'Strike',
  weather: 'Weather',
  bank_holiday: 'Bank Holiday',
  incident: 'Incident',
}

export interface Candidate {
  id: number
  category: string
  country: string | null
  region: string | null
  date_start: string | null
  date_end: string | null
  time_start: string | null
  time_end: string | null
  event_name: string | null
  raw_snippet: string | null
  source_type: string
  source_url: string
  reported_by: string | null
  admin_decision: 'pending' | 'approved' | 'rejected'
  admin_note: string | null
  promoted: boolean
  collected_at: string
  decided_at: string | null
}

export interface ReportInput {
  type: EventType
  transport: string | null
  country: string
  city: string
  day: string
  from: string
  to: string
  detail: string
  /** 로그인한 사람의 이메일. 비로그인 보고는 null이다 */
  reporter: string | null
}

/** 성공하면 null, 실패하면 메시지 */
export async function submitReport(r: ReportInput): Promise<string | null> {
  if (!client) return 'Supabase 연결이 설정되지 않았습니다'

  const where = r.city ? r.city + ' · ' + r.country : r.country
  const row = {
    source_type: 'manual',
    // NOT NULL이라 비울 수 없다. 'manual'은 WF-2의 isTrusted가 이미 인정하는 값이다 (DEC-023)
    source_url: 'manual',
    category: CATEGORY[r.type],
    country: r.country,
    region: r.city || null,
    date_start: r.day,
    date_end: r.day,
    time_start: r.from || null,
    time_end: r.to || null,
    transport_mode: r.transport,
    event_name: r.type + ' — ' + where,
    raw_title: r.type + ' — ' + where,
    raw_snippet: r.detail || null,
    reported_by: r.reporter,
    // 아래 셋은 RLS의 WITH CHECK가 요구한다. 제출하면서 스스로 승인하지 못하게 하는 장치다
    admin_decision: 'pending',
    promoted: false,
    needs_review: true,
  }

  const { error } = await client.from('risk_candidates').insert(row)
  if (error) {
    log('error', '위험 보고 저장 실패', { path: 'lib/candidates.submitReport', supabaseError: error.message })
    return error.message
  }
  return null
}

export async function fetchCandidates(): Promise<{ rows: Candidate[]; error: string | null }> {
  if (!client) return { rows: [], error: null }
  const { data, error } = await client
    .from('risk_candidates')
    .select('*')
    .eq('admin_decision', 'pending')
    .order('collected_at', { ascending: false })
  if (error) {
    log('error', '후보 조회 실패', { path: 'lib/candidates.fetchCandidates', supabaseError: error.message })
    return { rows: [], error: error.message }
  }
  return { rows: (data ?? []) as Candidate[], error: null }
}

/**
 * 오늘 처리한 것들. 승인 버튼을 누르면 목록에서 사라져 **뭘 했는지 볼 방법이 없었다**
 * (→ 사용자 지적 2026-08-28). 되돌릴 수 있으려면 먼저 보여야 한다.
 */
export async function fetchDecidedToday(): Promise<Candidate[]> {
  if (!client) return []
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { data, error } = await client
    .from('risk_candidates')
    .select('*')
    .neq('admin_decision', 'pending')
    .gte('decided_at', since.toISOString())
    .order('decided_at', { ascending: false })
  if (error) {
    log('error', '처리 이력 조회 실패', { path: 'lib/candidates.fetchDecidedToday', supabaseError: error.message })
    return []
  }
  return (data ?? []) as Candidate[]
}

/** 승인·반려를 취소하고 대기로 되돌린다. 이미 승격된 건의 events 행은 따로 제외해야 한다 */
export async function undoDecision(id: number): Promise<string | null> {
  if (!client) return 'Supabase 연결이 설정되지 않았습니다'
  const { error } = await client
    .from('risk_candidates')
    .update({ admin_decision: 'pending', admin_note: null, decided_at: null, needs_review: true })
    .eq('id', id)
  return error ? error.message : null
}

/**
 * 잘못 올라온 이벤트를 캘린더에서 내린다 (status = 'excluded').
 * 지우지 않는 이유 — 되돌릴 수 있어야 하고, 무엇을 왜 내렸는지가 남아야 한다.
 * DB 권한도 status 컬럼만 열어 뒀다 (2026-08-28 마이그레이션).
 */
export async function setEventStatus(eventId: string, status: 'active' | 'excluded'): Promise<string | null> {
  if (!client) return 'Supabase 연결이 설정되지 않았습니다'
  const { error } = await client.from('events').update({ status }).eq('event_id', eventId)
  if (error) {
    log('error', '이벤트 제외·복구 실패', { path: 'lib/candidates.setEventStatus', supabaseError: error.message })
    return error.message
  }
  return null
}

/** 승인·반려. promoted는 건드리지 않는다 — WF-2c의 몫이다 */
export async function decideCandidate(
  id: number,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<string | null> {
  if (!client) return 'Supabase 연결이 설정되지 않았습니다'
  const { error } = await client
    .from('risk_candidates')
    .update({ admin_decision: decision, admin_note: note || null, needs_review: false, decided_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    log('error', '승인·반려 저장 실패', { path: 'lib/candidates.decideCandidate', supabaseError: error.message })
    return error.message
  }
  return null
}
