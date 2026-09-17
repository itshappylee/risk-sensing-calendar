import type { EventType, Lang } from './types'

/**
 * 이벤트 유형별 표시 메타.
 * 근거: wiki/spec/screen-spec.md 2c 범례 (파업 / 운전금지 / 공휴일 / 기상 / 미검증)
 *       wiki/spec/requirements.md FR-2.2 "캘린더 시각화 (유형별 색·아이콘)"
 *
 * ※ Incident는 와이어프레임 범례에 없다. DB CHECK 제약에는 존재하므로
 *   렌더링은 하되 별도 색을 준다. → 위키에 [확인필요]로 기록함.
 */
export const EVENT_TYPES: EventType[] = [
  'Strike',
  'Driving Ban',
  'Bank Holiday',
  'Weather',
  'Incident',
]

interface TypeMeta {
  label: Record<Lang, string>
  icon: string
  /** CSS 변수 접미사 — styles.css의 --ev-* 와 대응 */
  key: string
}

export const TYPE_META: Record<EventType, TypeMeta> = {
  Strike: {
    label: { ko: '파업', en: 'Strike' },
    icon: '🚫',
    key: 'strike',
  },
  'Driving Ban': {
    label: { ko: '운전금지', en: 'Driving Ban' },
    icon: '⛔',
    key: 'ban',
  },
  'Bank Holiday': {
    label: { ko: '공휴일', en: 'Bank Holiday' },
    icon: '🏛',
    key: 'holiday',
  },
  Weather: {
    label: { ko: '기상', en: 'Weather' },
    icon: '🌧',
    key: 'weather',
  },
  Incident: {
    label: { ko: '사고', en: 'Incident' },
    icon: '⚠️',
    key: 'incident',
  },
}

/**
 * severity → 3색 매핑.
 * 근거: wiki/spec/business-rules.md — 1–2 🟢 / 3 🟠 / 4–5 🔴
 * Q-010 결론: 1~5는 저장·계산 척도, 3색은 화면 표시 척도. 상충이 아니라 층이 다르다.
 */
export type SeverityBand = 'low' | 'mid' | 'high'

export function severityBand(severity: number): SeverityBand {
  if (severity >= 4) return 'high'
  if (severity === 3) return 'mid'
  return 'low'
}

export function severityLabel(severity: number, lang: Lang): string {
  const band = severityBand(severity)
  const labels: Record<SeverityBand, Record<Lang, string>> = {
    low: { ko: '낮음', en: 'Low' },
    mid: { ko: '보통', en: 'Medium' },
    high: { ko: '높음', en: 'High' },
  }
  return labels[band][lang]
}

/**
 * 운송수단 — `events.transport_mode`(road/rail/air/sea)와 대응.
 * 아이콘은 경로 분석(2b)과 위험 보고(2d)가 함께 쓴다.
 */
export type TransportMode = 'road' | 'rail' | 'air' | 'sea'

export const TRANSPORT_MODES: TransportMode[] = ['road', 'rail', 'air', 'sea']

export const TRANSPORT_ICON: Record<TransportMode, string> = {
  road: '🚚',
  rail: '🚆',
  air: '✈️',
  sea: '🚢',
}

/* ==========================================================================
   표시 그룹 — 화면에서 묶어 보여주는 단위
   ========================================================================== */

/**
 * 파업(Strike)과 사고(Incident)를 **한 그룹으로 묶는다** (→ 사용자 결정 2026-08-26).
 * 둘 다 "예정에 없던 교통 두절"이라 담당자 입장에서 대응이 같고,
 * 슬롯이 4개에서 3개로 줄어 셀 높이도 낮아진다.
 */
export type TypeGroup = 'ban' | 'weather' | 'disruption' | 'holiday'

export const GROUP_OF: Record<EventType, TypeGroup> = {
  'Driving Ban': 'ban',
  Weather: 'weather',
  Strike: 'disruption',
  Incident: 'disruption',
  'Bank Holiday': 'holiday',
}

interface GroupMeta {
  label: Record<Lang, string>
  icon: string
  /** CSS 변수 접미사 — styles.css의 --ev-* 와 대응 */
  key: string
}

export const GROUP_META: Record<TypeGroup, GroupMeta> = {
  ban: { label: { ko: '운전금지', en: 'Driving Ban' }, icon: '⛔', key: 'ban' },
  weather: { label: { ko: '기상', en: 'Weather' }, icon: '🌧', key: 'weather' },
  disruption: { label: { ko: '파업·사고', en: 'Strike & Incident' }, icon: '🚫', key: 'disruption' },
  holiday: { label: { ko: '공휴일', en: 'Bank Holiday' }, icon: '🏛', key: 'holiday' },
}

/** 캘린더 셀 슬롯 순서 — **항상 고정**. 공휴일은 슬롯이 아니라 상단 띠로 표시한다 */
export const SLOT_GROUPS: TypeGroup[] = ['ban', 'weather', 'disruption']

/** 필터·범례에 노출하는 순서 */
export const FILTER_GROUPS: TypeGroup[] = ['ban', 'weather', 'disruption', 'holiday']
