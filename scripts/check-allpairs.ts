import { HUBS, buildAllPairs, pairList } from '../src/lib/allPairs'
import { buildAllRoutesCsv, buildSummaryCsv } from '../src/lib/routeCsv'
import { COUNTRIES } from '../src/lib/locations'
import type { RiskEvent } from '../src/lib/types'

/** 전 구간 위험 점검 — 쌍 개수·허브 필터·0점 제외·속도·CSV가 맞는지 */
let fail = 0
const ok = (c: boolean, m: string, x = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++ }
const ev = (country: string, sev: number, mode: string, i: number): RiskEvent => ({
  event_id: `t${i}`, event_type: 'Strike' as never, country, region: null, date_start: '2026-10-22', date_end: '2026-10-30',
  time_start: null, time_end: null, event_name: `${country} strike`, summary: '', transport_mode: mode, severity: sev,
  severity_reason: '', status: 'active', source_url: '', verified: 'yes' as never, upd_dtm: '2026-10-22',
})
const N = COUNTRIES.length
const events = [ev('France', 5, 'road', 1), ev('Poland', 3, 'rail', 2), ev('Spain', 4, 'air', 3)]

console.log('■ 쌍 목록')
for (const hub of HUBS) {
  const both = pairList({ hub, direction: 'both' })
  ok(both.length === 2 * (N - 1), `${hub} 양방향 ${2 * (N - 1)}쌍`, String(both.length))
  ok(both.every(([a, b]) => a === hub || b === hub), `${hub}: 모든 쌍에 허브가 들어 있다`)
}
const outL = pairList({ hub: 'Slovakia', direction: 'out' })
const inL = pairList({ hub: 'Slovakia', direction: 'in' })
ok(outL.length === N - 1 && outL.every(([a]) => a === 'Slovakia'), '출고: 허브가 출발', String(outL.length))
ok(inL.length === N - 1 && inL.every(([, b]) => b === 'Slovakia'), '입고: 허브가 도착', String(inL.length))
ok(!pairList({ hub: 'Slovakia', direction: 'both' }).some(([a, b]) => a === b), '같은 나라끼리는 없다')

console.log('■ 계산')
const sk = { hub: 'Slovakia' as const, direction: 'both' as const }
const t0 = Date.now()
const road = buildAllPairs(events, { modes: ['road'], scope: sk, depart: '2026-10-22' })
const ms = Date.now() - t0
ok(road.scanned === 2 * (N - 1), '모든 쌍을 훑었다', String(road.scanned))
ok(road.results.every((r) => (r.routes.options[0]?.analysis.grade ?? 0) > 0), '0점 쌍은 빠졌다')
ok(road.results.length > 0 && road.results.length < road.scanned, '위험 있는 쌍만 남았다', `${road.results.length}/${road.scanned}`)
const grades = road.results.map((r) => r.routes.options[0].analysis.grade)
ok(grades.every((g, i) => i === 0 || grades[i - 1] >= g), '위험이 높은 순')
const fr = road.results.filter((r) => r.row.origin === 'Slovakia' && r.row.dest === 'France')
ok(fr.length === 1 && fr[0].routes.options[0].analysis.grade === 5, 'Slovakia→France(프랑스 파업 5점)가 들어 있다')
ok(ms < 2000, '계산 속도', `${ms}ms`)

console.log('■ 운송수단 · 방향')
const air = buildAllPairs(events, { modes: ['air'], scope: sk, depart: '2026-10-22' })
ok(air.results.length > 0 && air.results.every((r) => [r.row.origin, r.row.dest].includes('Spain')), '항공은 출발·도착 국가의 이벤트만 본다(스페인 4점)')
const two = buildAllPairs(events, { modes: ['road', 'rail'], scope: { hub: 'Poland', direction: 'out' }, depart: '2026-10-22' })
ok(two.scanned === (N - 1) * 2, '운송수단 2개 × 출고', String(two.scanned))
ok(two.results.every((r) => r.row.origin === 'Poland'), '출고 결과는 모두 허브 출발')

console.log('■ CSV')
const sum = buildSummaryCsv(road.results).split('\r\n').filter((l) => l && !l.startsWith('#'))
ok(sum.length === road.results.length + 1, '요약 CSV: 머리글 + 쌍당 1줄', String(sum.length))
const all = buildAllRoutesCsv(road.results).split('\r\n').filter((l) => l && !l.startsWith('#'))
ok(all.length >= sum.length, '전 경로 CSV는 경로당 1줄')
console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과')
process.exit(fail ? 1 : 0)
