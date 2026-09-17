import type { RiskEvent } from './types'

/**
 * 월 캘린더 격자 + "기간만큼 연속 막대, 중첩 시 줄이 쌓인다" 레이아웃 계산.
 * 근거: wiki/spec/screen-spec.md 2c "표기 규칙"
 *
 * 주(week) 단위로 잘라서 각 주 안에서 lane(줄)을 그리디로 배정한다.
 * 한 이벤트가 여러 주에 걸치면 주마다 별도 세그먼트가 된다.
 */

/** 'YYYY-MM-DD'를 로컬 자정 Date로. new Date(str)은 UTC로 파싱돼 하루 밀릴 수 있어 직접 만든다. */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** 월요일 시작 기준 요일 인덱스 (월=0 … 일=6) */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

/** 해당 월을 덮는 주 배열. 각 주는 7일. 앞뒤로 이웃 달 날짜가 채워진다. */
export function buildMonthWeeks(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)

  const weeks: Date[][] = []
  let cursor = addDays(first, -mondayIndex(first))
  // 주의 '시작'이 월말을 넘으면 그 주는 만들지 않는다.
  // (예전에는 push 뒤에 검사해서, 통째로 다음 달인 주가 남았다)
  while (cursor <= monthEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(cursor)
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

export interface Segment {
  event: RiskEvent
  /** 0~6, 이 주 안에서 시작하는 요일 */
  startCol: number
  /** 며칠짜리 막대인가 (1~7) */
  span: number
  /** 몇 번째 줄에 쌓이는가 (0부터) */
  lane: number
  /** 이벤트의 실제 시작이 이 주 이전인가 — 막대 왼쪽을 열어둔다 */
  continuesLeft: boolean
  continuesRight: boolean
}

export interface WeekLayout {
  days: Date[]
  segments: Segment[]
  laneCount: number
  /** maxLanes 때문에 접힌 것들. "+N" 표시에 쓴다. */
  hidden: Segment[]
}

/**
 * severity 0은 캘린더에 표시하지 않는다.
 * 근거: wiki/spec/business-rules.md Driving Ban Step 0
 *   "야간 금지(21:00–06:00 안에 완전히 포함) → 위험도 0, 캘린더 미표시"
 */
export function isDisplayable(e: RiskEvent): boolean {
  return e.severity > 0
}

/**
 * ⚠️ **현재 화면에서는 쓰이지 않는다.** 캘린더 셀이 유형 단위 집계로 바뀌면서
 * 개별 이벤트 막대를 배치할 일이 없어졌다 (→ Q-025 결정 과정).
 * 이 저장소에 버전관리가 없고, 이 함수는 두 번의 버그 수정과 회귀 테스트를 거친 자산이라
 * 삭제하지 않고 남긴다. 개별 막대 표시로 돌아가면 그대로 쓴다.
 *
 * 연속한 날짜 구간(`days`)에 이벤트 막대를 겹치지 않게 배치한다.
 * 7일(한 주)뿐 아니라 한 달 전체 같은 임의 길이에도 쓴다 — 매트릭스 뷰가 그렇게 쓴다.
 *
 * @param maxLanes 이 줄 수를 넘기면 나머지는 hidden으로 접는다.
 *   접는 기준이 severity라는 게 핵심 — 예전에는 시작일·event_id 순이라
 *   국가명 알파벳 순으로 잘려 severity 5가 공휴일 뒤로 숨었다.
 */
export function layoutWeek(days: Date[], events: RiskEvent[], maxLanes?: number): WeekLayout {
  const weekStart = days[0]
  const weekEnd = days[days.length - 1]

  const overlapping = events
    .filter(isDisplayable)
    .map((event) => {
      const s = parseISODate(event.date_start)
      const e = parseISODate(event.date_end)
      return { event, s, e }
    })
    .filter(({ s, e }) => e >= weekStart && s <= weekEnd)
    // 위험한 것부터 위 줄을 차지한다. 그다음 오래 걸치는 것, 그다음 시작이 빠른 것.
    .sort((a, b) => {
      if (a.event.severity !== b.event.severity) return b.event.severity - a.event.severity
      const aLen = a.e.getTime() - a.s.getTime()
      const bLen = b.e.getTime() - b.s.getTime()
      if (aLen !== bLen) return bLen - aLen
      const aStart = a.s < weekStart ? weekStart : a.s
      const bStart = b.s < weekStart ? weekStart : b.s
      if (aStart.getTime() !== bStart.getTime()) return aStart.getTime() - bStart.getTime()
      return a.event.event_id.localeCompare(b.event.event_id)
    })

  /** 주어진 목록을 그리디로 패킹한다. lane[i] = 그 줄에서 이미 점유된 마지막 컬럼 */
  const pack = (list: typeof overlapping) => {
    const laneEnds: number[] = []
    const segments: Segment[] = []
    for (const { event, s, e } of list) {
      const clampedStart = s < weekStart ? weekStart : s
      const clampedEnd = e > weekEnd ? weekEnd : e
      const startCol = Math.round((clampedStart.getTime() - weekStart.getTime()) / 86400000)
      const endCol = Math.round((clampedEnd.getTime() - weekStart.getTime()) / 86400000)

      let lane = laneEnds.findIndex((end) => end < startCol)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(endCol)
      } else {
        laneEnds[lane] = endCol
      }

      segments.push({
        event,
        startCol,
        span: endCol - startCol + 1,
        lane,
        continuesLeft: s < weekStart,
        continuesRight: e > weekEnd,
      })
    }
    return { segments, laneCount: laneEnds.length }
  }

  if (maxLanes === undefined) {
    const { segments, laneCount } = pack(overlapping)
    return { days, segments, laneCount, hidden: [] }
  }

  // severity 내림차순 목록의 "앞에서부터 k개"만 남긴다.
  // 이렇게 잘라야 보이는 것 전부가 접힌 것 전부보다 severity가 높거나 같음이 보장된다.
  // (한 건씩 넣다가 자리 없으면 버리는 방식은, 빈틈에 끼는 낮은 severity가 살아남는다)
  // laneCount는 k에 대해 단조 비감소라 이분탐색이 가능하다.
  let lo = 0
  let hi = overlapping.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (pack(overlapping.slice(0, mid)).laneCount <= maxLanes) lo = mid
    else hi = mid - 1
  }
  const { segments, laneCount } = pack(overlapping.slice(0, lo))
  const hidden: Segment[] = overlapping.slice(lo).map(({ event, s, e }) => {
    const clampedStart = s < weekStart ? weekStart : s
    const clampedEnd = e > weekEnd ? weekEnd : e
    const startCol = Math.round((clampedStart.getTime() - weekStart.getTime()) / 86400000)
    const endCol = Math.round((clampedEnd.getTime() - weekStart.getTime()) / 86400000)
    return {
      event,
      startCol,
      span: endCol - startCol + 1,
      lane: -1,
      continuesLeft: s < weekStart,
      continuesRight: e > weekEnd,
    }
  })

  return { days, segments, laneCount, hidden }
}

export function eventsOnDay(events: RiskEvent[], day: Date): RiskEvent[] {
  return events.filter((e) => {
    if (!isDisplayable(e)) return false
    const s = parseISODate(e.date_start)
    const en = parseISODate(e.date_end)
    return day >= s && day <= en
  })
}
