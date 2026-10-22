import type { EventType, RiskEvent } from './types'
import { isActiveRisk } from './changes'
import type { TransportMode } from './eventMeta'
import { findRoutes, isIsolated, seaSegments, type RoutePath } from './routeGraph'

/**
 * 2b 경로 분석의 계산 규칙.
 *
 * 근거: wiki/spec/business-rules.md §6 "여러 이벤트를 하나의 등급으로 — 집계 규칙 v1"
 *
 * ```
 * ① 롤업        여러 행 → 하나의 사건        (WF-2가 이미 함)
 * ② 개별 점수    사건마다 §1~5로 1~5점        (WF-2가 이미 함)
 * ③ 관련성 필터  운송 타입에 안 맞는 건 제외   (§6.1 — 여기서)
 * ④ 대표값       남은 것 중 최댓값            (§6.2 — 여기서)
 * ```
 *
 * ⚠️ **지리 축은 국가 단위다** (→ DEC-022-country-level-matching).
 * `events`에 좌표가 없어 "경로 위에 있는가"를 판정할 수 없으므로, 사용자가 고른
 * 출발·경유·도착 **국가에 속하면 전부 걸린다.** 마르세유 파업이 파리–릴 경로에도
 * 잡히는 과다 경보를 감수한다 — 놓치는 것보다 낫기 때문이다.
 *
 * ⚠️ **여기서 계산하지 않는 것**: 예상 지연시간, 실제 도로 노선, 거리.
 * 거리·속도 데이터가 없다 (→ Q-012). 지어내느니 등급과 그 이유까지만 보여준다.
 *
 * 2026-10-14 추가 — **지나는 나라는 이제 [[routeGraph]]가 국경표로 계산한다.**
 * 그전에는 사용자가 고른 나라만 봐서, 오스트리아 → 스페인에 프랑스·독일의 파업이
 * 통째로 빠져 있었다. 대체 경로도 같은 계산에서 나온다.
 */

/** 경로 위험 등급을 계산할 때 쓰는 운송 타입. `events.transport_mode`의 값과 같다 */
export type RouteMode = TransportMode

/** 한 국가 구간 — 화면의 국가 구간 바 한 칸 */
export interface RouteLeg {
  country: string
  /** 사용자가 직접 고른 나라인가 (출발·경유·도착). 아니면 국경표가 채운 통과국이다 */
  picked: boolean
  /** 그 나라에서의 최고 severity. 관련 이벤트가 없으면 0 */
  grade: number
  /** 그 나라의 관련 이벤트 수 */
  count: number
}

/** 유형별 카드 한 장 */
export interface RouteTypeRisk {
  type: EventType
  /** 그 유형 중 가장 높은 이벤트. 없으면 null → "해당 없음" */
  top: RiskEvent | null
  count: number
}

export interface RouteAnalysisResult {
  /** 경로가 지나는 국가 (입력 순서, 중복 제거) */
  countries: string[]
  legs: RouteLeg[]
  /** §6.2 대표값 = 관련 있는 사건들의 최댓값. 하나도 없으면 0 */
  grade: number
  /** 최댓값의 단점 보완 — 건수 분포를 병기한다 (§6.2) */
  counts: { high: number; mid: number; low: number }
  /** 배지에 반영된 이벤트. severity 내림차순 */
  relevant: RiskEvent[]
  /**
   * 운송 타입이 안 맞아 배지에서 뺀 이벤트.
   * §6.1 "제외된 사건은 버리지 않는다" — 화면에서는 계속 보여준다.
   */
  excluded: RiskEvent[]
  byType: RouteTypeRisk[]
  /** 이 분석이 실제로 조회한 날짜 범위 */
  from: string
  to: string
}

/** 카드 순서 — screen-spec 2b의 리스크 카드 4개. Incident는 파업과 같은 칸에 묶지 않고 별도로 센다 */
export const ROUTE_CARD_TYPES: EventType[] = ['Strike', 'Driving Ban', 'Bank Holiday', 'Weather']

/** 출발·경유·도착에서 국가 목록을 뽑는다. 빈 값과 중복은 버리고 입력 순서를 지킨다 */
export function routeCountries(picks: { country: string }[]): string[] {
  const out: string[] = []
  for (const p of picks) {
    const c = p.country?.trim()
    if (c && !out.includes(c)) out.push(c)
  }
  return out
}

/** 출발일 + 기간(일) → 조회 범위. 3일이면 출발일 포함 3일이므로 +2일까지다 */
export function routeDateRange(depart: string, days: number): { from: string; to: string } {
  const d = new Date(`${depart}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return { from: depart, to: depart }
  const span = Math.max(1, Math.floor(days || 1))
  const end = new Date(d.getTime() + (span - 1) * 86400000)
  return { from: depart, to: end.toISOString().slice(0, 10) }
}

/**
 * §6.1 관련성 필터 — 운송 타입 축.
 *
 * - **공휴일은 항상 관련 있다.** 위키에 `transport_mode` 규정이 없고, 어차피 1점이라
 *   최댓값을 차지할 일이 거의 없다 (§6.1 [미확정] 항목).
 * - **비어 있거나 `unknown`이면 포함한다.** 모르는 것을 조용히 빼면 위험이 없는 것처럼
 *   보이게 된다 (§6.1 "`transport_mode`가 비어 있으면").
 */
export function isModeRelevant(event: RiskEvent, mode: RouteMode): boolean {
  if (event.event_type === 'Bank Holiday') return true
  const raw = (event.transport_mode ?? '').trim().toLowerCase()
  if (!raw || raw === 'unknown') return true
  return raw
    .split(',')
    .map((m) => m.trim())
    .includes(mode)
}

/**
 * §6 ③④ — 관련성 필터 후 최댓값.
 *
 * `events`는 이미 기간으로 걸러서 넘어온다고 본다(`fetchEvents(from, to)`).
 * 여기서는 국가·운송 타입·표시 여부만 본다.
 */
export function analyzeRoute(
  events: RiskEvent[],
  countries: string[],
  mode: RouteMode,
  range: { from: string; to: string },
  picked: string[] = countries,
): RouteAnalysisResult {
  const onRoute = events.filter((e) => isActiveRisk(e) && countries.includes(e.country))

  const relevant: RiskEvent[] = []
  const excluded: RiskEvent[] = []
  for (const e of onRoute) {
    if (isModeRelevant(e, mode)) relevant.push(e)
    else excluded.push(e)
  }
  const bySeverity = (a: RiskEvent, b: RiskEvent) =>
    b.severity - a.severity || a.date_start.localeCompare(b.date_start)
  relevant.sort(bySeverity)
  excluded.sort(bySeverity)

  // §6.2 대표값 — 합산도 평균도 아닌 최댓값. 위험은 상쇄되지 않는다
  const grade = relevant.reduce((max, e) => Math.max(max, e.severity), 0)

  const counts = { high: 0, mid: 0, low: 0 }
  for (const e of relevant) {
    if (e.severity >= 4) counts.high++
    else if (e.severity === 3) counts.mid++
    else counts.low++
  }

  const legs: RouteLeg[] = countries.map((country) => {
    const mine = relevant.filter((e) => e.country === country)
    return {
      country,
      picked: picked.includes(country),
      grade: mine.reduce((max, e) => Math.max(max, e.severity), 0),
      count: mine.length,
    }
  })

  const byType: RouteTypeRisk[] = ROUTE_CARD_TYPES.map((type) => {
    const mine = relevant.filter((e) => e.event_type === type)
    return { type, top: mine[0] ?? null, count: mine.length }
  })

  return { countries, legs, grade, counts, relevant, excluded, byType, from: range.from, to: range.to }
}

// ────────────────────────────────────────────────────────────────────
// 경로 후보 — 2026-10-14 신설
// ────────────────────────────────────────────────────────────────────

/** 경로 하나와 그 위험 분석 */
export interface RouteOption {
  /** 지나는 나라 전체 (출발·통과·도착) */
  countries: string[]
  /** 국경 통과 수 */
  hops: number
  /** 그중 페리·터널 구간 */
  seaHops: number
  /** 페리·터널 구간 목록 — 화면 표시용 */
  seaLegs: [string, string][]
  analysis: RouteAnalysisResult
}

export interface RouteOptions {
  /**
   * - `graph` : 국경표로 통과국을 계산했다 (육로·철도)
   * - `direct`: 출발·도착만 본다 (항공·해상 — 중간 영공·공해는 실무상 무의미하다)
   * - `blocked`: 육로로 이을 수 없다 (아이슬란드·키프로스 등)
   */
  kind: 'graph' | 'direct' | 'blocked'
  /** 짧은 것부터. [0]이 기본 경로, 나머지가 대체 경로 */
  options: RouteOption[]
  /** 사용자가 직접 고른 나라 (출발·경유·도착) */
  picked: string[]
  /** `blocked`일 때 어디서 끊겼는지 — 화면 안내용 */
  blockedAt: string[]
}

/** 육로 그래프를 쓰는 운송 타입. 항공·해상은 통과 국가라는 개념이 다르다 */
const GRAPH_MODES: RouteMode[] = ['road', 'rail']

/**
 * 출발·경유·도착에서 **대체 경로까지** 뽑아 각각 위험도를 매긴다.
 *
 * 순서: 짧은 것(국경 통과 수) → 페리가 적은 것. **거리로 정렬하지 않는다** —
 * 거리 데이터가 없으므로 "이게 더 빠르다"고 말할 근거가 없다. 화면에도 그렇게 적는다.
 */
export function buildRouteOptions(
  events: RiskEvent[],
  picks: { country: string }[],
  mode: RouteMode,
  range: { from: string; to: string },
  max = 4,
): RouteOptions {
  const picked = routeCountries(picks)
  if (picked.length === 0) return { kind: 'direct', options: [], picked, blockedAt: [] }

  const analyse = (countries: string[]): RouteAnalysisResult =>
    analyzeRoute(events, countries, mode, range, picked)

  if (!GRAPH_MODES.includes(mode)) {
    return {
      kind: 'direct',
      picked,
      blockedAt: [],
      options: [{ countries: picked, hops: Math.max(0, picked.length - 1), seaHops: 0, seaLegs: [], analysis: analyse(picked) }],
    }
  }

  const paths: RoutePath[] = findRoutes(picked, { max })
  if (paths.length === 0) {
    // 어디서 끊겼는지 알려 준다 — "안 됩니다"보다 "아이슬란드는 육로가 없습니다"가 낫다
    const blockedAt = picked.filter(isIsolated)
    return {
      kind: 'blocked',
      picked,
      blockedAt,
      // 끊겨도 고른 나라의 위험은 보여 준다. 분석을 통째로 비우지 않는다
      options: [{ countries: picked, hops: 0, seaHops: 0, seaLegs: [], analysis: analyse(picked) }],
    }
  }

  return {
    kind: 'graph',
    picked,
    blockedAt: [],
    options: paths.map((p) => ({
      countries: p.countries,
      hops: p.hops,
      seaHops: p.seaHops,
      seaLegs: seaSegments(p.countries),
      analysis: analyse(p.countries),
    })),
  }
}

/**
 * 위험 등급이 **실제로 더 낮은** 경로의 인덱스. 없으면 -1.
 *
 * ⚠️ 건수만 적은 것은 "더 안전"이라고 하지 않는다. 최고 등급이 같으면 가장 아픈 사건을
 *    똑같이 맞는다는 뜻이다 (§6.2 최댓값). 건수 차이는 표에 숫자로 보여 주고 판단은 사람이 한다.
 */
export function safestIndex(options: RouteOption[]): number {
  if (options.length < 2) return -1
  let best = 0
  for (let i = 1; i < options.length; i++) {
    if (options[i].analysis.grade < options[best].analysis.grade) best = i
  }
  return best === 0 ? -1 : best
}
