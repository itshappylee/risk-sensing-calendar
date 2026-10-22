import { severityLabel } from './eventMeta'
import { cell } from './exportCsv'
import { regionLabel } from './regionLabels'
import type { BatchResult } from './batchRoutes'
import type { RouteOption } from './routeAnalysis'

/**
 * 경로 분석 결과 CSV — 한 건 조회와 여러 건 조회가 같은 길을 쓴다.
 *
 * 두 가지를 낸다:
 * ① 결과 요약   — 입력한 노선 1개당 1줄. 기본(가장 짧은) 경로의 등급 + 대체 경로 중 가장 낮은 등급
 * ② 전 경로     — 노선마다 **계산된 모든 대체 경로**를 1줄씩. 어느 길이 얼마나 위험한지 비교용
 *
 * ⚠️ 내용은 화면 언어와 무관하게 항상 영어다 (이벤트 CSV와 같은 규칙 → exportCsv.ts).
 * ⚠️ 위험 판정은 국가 단위다 (DEC-022). "이벤트 없음"이 "그 길이 안전하다"는 뜻은 아니다.
 */

const L = 'en' as const

const driverOf = (o: RouteOption | undefined): string => {
  const top = o?.analysis.relevant[0]
  if (!top) return 'none'
  const region = top.region ? ` · ${regionLabel(top.region, L)}` : ''
  return `${top.country}${region} ${top.date_start} ${top.event_type} — ${top.event_name_en || top.event_name}`
}

const gradeLabel = (g: number) => (g > 0 ? severityLabel(g, L) : 'none')

const INPUT_COLS = [
  'route', 'transport', 'origin', 'destination', 'waypoints', 'departure', 'lead_days',
  'window_from', 'window_to',
]

function inputCells(r: BatchResult): (string | number)[] {
  return [
    r.row.name, r.row.mode, r.row.origin, r.row.dest, r.row.via.join(' / '),
    r.row.depart, r.row.lead, r.from, r.to,
  ]
}

function footer(): string[] {
  return [
    '',
    cell('# NOTE: risk is matched at country level. No event listed does not mean the route is free of risk.'),
    cell('# NOTE: unverified items are excluded. Cancelled events are not counted.'),
    cell(`# generated: ${new Date().toISOString()}`),
  ]
}

/** ① 노선당 1줄 */
export function buildSummaryCsv(results: BatchResult[]): string {
  const rows = [
    [...INPUT_COLS, 'route_status', 'default_route', 'borders', 'risk_grade', 'risk_level',
      'high', 'mid', 'low', 'main_driver', 'route_options', 'lowest_grade_among_options'].join(','),
  ]
  for (const r of results) {
    const opts = r.routes.options
    const best = opts[0]
    const a = best?.analysis
    const min = opts.length ? Math.min(...opts.map((o) => o.analysis.grade)) : 0
    rows.push(
      [
        ...inputCells(r),
        r.routes.kind === 'blocked' ? 'no overland route' : r.routes.kind === 'direct' ? 'direct' : 'overland',
        best ? best.countries.join(' > ') : '',
        best ? best.hops : '',
        a?.grade ?? 0, gradeLabel(a?.grade ?? 0),
        a?.counts.high ?? 0, a?.counts.mid ?? 0, a?.counts.low ?? 0,
        driverOf(best), opts.length, min,
      ].map(cell).join(','),
    )
  }
  return [...rows, ...footer()].join('\r\n')
}

/** ② 노선 × 대체 경로 */
export function buildAllRoutesCsv(results: BatchResult[]): string {
  const rows = [
    [...INPUT_COLS, 'option', 'countries', 'borders', 'sea_crossings', 'risk_grade', 'risk_level',
      'high', 'mid', 'low', 'main_driver', 'lowest_risk_option'].join(','),
  ]
  for (const r of results) {
    const opts = r.routes.options
    const grades = opts.map((o) => o.analysis.grade)
    const min = grades.length ? Math.min(...grades) : 0
    // 모든 경로의 등급이 같으면 '더 안전한 경로'가 없는 것이다 — 전부 yes로 표시하지 않는다
    const hasSafer = grades.length > 1 && Math.max(...grades) > min
    opts.forEach((o, i) => {
      rows.push(
        [
          ...inputCells(r), i + 1, o.countries.join(' > '), o.hops, o.seaHops,
          o.analysis.grade, gradeLabel(o.analysis.grade),
          o.analysis.counts.high, o.analysis.counts.mid, o.analysis.counts.low,
          driverOf(o),
          hasSafer && o.analysis.grade === min ? 'yes' : '',
        ].map(cell).join(','),
      )
    })
  }
  return [...rows, ...footer()].join('\r\n')
}
