import { COUNTRIES } from './locations'
import type { TransportMode } from './eventMeta'
import type { RiskEvent } from './types'
import { buildRouteOptions, routeDateRange } from './routeAnalysis'
import type { BatchResult } from './batchRoutes'

/**
 * "전 구간 위험" — 검색 없이, 선택한 허브와 모든 국가의 쌍을 한 번에 훑는다 (사용자 요청 2026-10-22).
 *
 * 규칙
 * - 기간은 **오늘부터 7일**로 모든 쌍에 똑같이 둔다. 쌍마다 리드타임(마스터)이 생기면 그때 쌍별 기간으로 바꾼다.
 * - **위험 등급이 0인 쌍은 뺀다.** 파일이 커지는 것을 막고, 담당자가 볼 것만 남긴다.
 * - 결과는 한 건 조회와 같은 모양(`BatchResult`)이라 표·상세·CSV 두 종류를 그대로 쓴다.
 *
 * ⚠️ 판정은 국가 단위다 (DEC-022). 등급 0은 "수집·검증된 이벤트가 없다"일 뿐 안전 보장이 아니다.
 */

/** 주요 허브 — 사용자 확인 2026-10-22 */
export const HUBS = ['Netherlands', 'Slovakia', 'Poland'] as const

/** 한 번에 훑는 기간(일) */
export const ALL_PAIRS_DAYS = 7

export type Hub = (typeof HUBS)[number]

/** 허브 기준 방향 — out: 허브 → 각국(출고), in: 각국 → 허브(입고), both: 둘 다 */
export type Direction = 'both' | 'out' | 'in'

export interface PairScope {
  hub: Hub
  direction: Direction
}

export interface AllPairsOptions {
  modes: TransportMode[]
  scope: PairScope
  /** 시작일 YYYY-MM-DD */
  depart: string
  days?: number
}

/**
 * 대상 국가 쌍 — 선택한 허브와 나머지 **모든 국가**의 쌍이다 (방향이 있다: A→B와 B→A는 다른 쌍).
 * 허브별로 따로 받게 한 것은 사용자 결정(2026-10-22): 담당 허브의 노선만 한눈에 보기 위해서다.
 */
export function pairList(scope: PairScope): [string, string][] {
  const out: [string, string][] = []
  for (const c of COUNTRIES) {
    if (c === scope.hub) continue
    if (scope.direction !== 'in') out.push([scope.hub, c])
    if (scope.direction !== 'out') out.push([c, scope.hub])
  }
  return out
}

/**
 * 모든 쌍의 위험을 계산해 **위험이 있는 쌍만**, 높은 순으로 돌려준다.
 * `events`는 기간으로 걸러 한 번만 읽어 온 것을 넘긴다 (DB 조회는 1회).
 */
export function buildAllPairs(events: RiskEvent[], opts: AllPairsOptions): { results: BatchResult[]; scanned: number } {
  const days = opts.days ?? ALL_PAIRS_DAYS
  const range = routeDateRange(opts.depart, days)
  const pairs = pairList(opts.scope)
  const results: BatchResult[] = []
  let n = 0
  for (const mode of opts.modes) {
    for (const [origin, dest] of pairs) {
      n++
      const routes = buildRouteOptions(events, [{ country: origin }, { country: dest }], mode, range)
      const grade = routes.options[0]?.analysis.grade ?? 0
      if (grade <= 0) continue
      results.push({
        row: { excelRow: results.length + 1, name: `${origin} → ${dest}`, mode, origin, dest, via: [], depart: opts.depart, lead: days },
        routes,
        from: range.from,
        to: range.to,
      })
    }
  }
  results.sort((a, b) => (b.routes.options[0]?.analysis.grade ?? 0) - (a.routes.options[0]?.analysis.grade ?? 0))
  return { results, scanned: n }
}
