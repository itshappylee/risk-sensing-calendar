/**
 * 국경표 점검 — 오타, 양방향, 연결성, 대표 경로.
 * 실행: npm run check:graph
 */
import { COUNTRIES } from '../src/lib/locations'
import { findPaths, findRoutes, isIsolated, seaSegments, validateGraph } from '../src/lib/routeGraph'

let failed = 0
const check = (ok: boolean, label: string, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

const problems = validateGraph()
check(problems.length === 0, '국경표에 오타·비대칭이 없다', problems.join(' / '))

const islands = COUNTRIES.filter(isIsolated)
check(islands.join() === 'Cyprus,Iceland', '육로가 없는 나라는 키프로스·아이슬란드뿐', islands.join(', '))

const bad: string[] = []
for (const a of COUNTRIES) {
  for (const b of COUNTRIES) {
    if (a >= b || isIsolated(a) || isIsolated(b)) continue
    if (findPaths(a, b, { max: 1 }).length === 0) bad.push(`${a}→${b}`)
  }
}
check(bad.length === 0, '섬이 아닌 나라끼리는 모두 이어진다', bad.slice(0, 5).join(', '))

// 대표 경로 — 숫자가 바뀌면 국경표를 건드린 것이다
const cases: [string, string, number][] = [
  ['Austria', 'Spain', 3],
  ['Slovakia', 'Spain', 4],
  ['Portugal', 'Poland', 4],
  ['Slovakia', 'Germany', 2],
  ['United Kingdom', 'Spain', 2],
]
for (const [a, b, hops] of cases) {
  const p = findPaths(a, b, { max: 1 })[0]
  check(p?.hops === hops, `${a} → ${b} 최단 ${hops}국경`, p ? `${p.countries.join('·')} (${p.hops})` : '경로 없음')
}

const at = findPaths('Austria', 'Spain', { max: 3 })
check(at.length >= 3 && at.every((p) => p.countries.includes('France')),
  '오스트리아→스페인은 어느 길이든 프랑스를 지난다', at.map((p) => p.countries.join('·')).join(' | '))

const via = findRoutes(['Slovakia', 'Italy', 'Spain'], { max: 2 })
check(via.length > 0 && via.every((p) => p.countries.includes('Italy')), '경유지는 반드시 지난다',
  via.map((p) => p.countries.join('·')).join(' | '))

const t0 = Date.now()
for (let i = 0; i < 500; i++) findPaths('Portugal', 'Turkey', { max: 4 })
const ms = Date.now() - t0
check(ms < 2000, '속도 (Portugal→Turkey 500회)', ms + 'ms')

const seas = seaSegments(findPaths('United Kingdom', 'Spain', { max: 1 })[0].countries)
check(seas.length === 1, '영국→스페인은 페리·터널 1구간', JSON.stringify(seas))

console.log(failed === 0 ? '\n✅ 전부 통과' : `\n❌ ${failed}건 실패`)
if (failed) process.exit(1)
