import { analyseRows } from '../src/lib/batchRoutes'
import { buildAllRoutesCsv, buildSummaryCsv } from '../src/lib/routeCsv'
import type { RiskEvent } from '../src/lib/types'

/** 경로 분석 CSV 점검 — 노선당 1줄(요약)·경로당 1줄(전 경로)이 맞는지, 값이 안 깨지는지 */
let fail = 0
const ok = (c: boolean, m: string, x = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++ }
const ev = (country: string, sev: number, mode: string, name = 'Strike, big "one"'): RiskEvent => ({
  event_id: country + sev, event_type: 'Strike' as never, country, region: null, date_start: '2026-10-29', date_end: '2026-10-30',
  time_start: null, time_end: null, event_name: name, summary: '', transport_mode: mode, severity: sev, severity_reason: '',
  status: 'active', source_url: '', verified: 'yes' as never, upd_dtm: '2026-10-22',
})
const row = (name: string, mode: any, origin: string, dest: string, via: string[] = []) =>
  ({ excelRow: 3, name, mode, origin, dest, via, depart: '2026-10-29', lead: 3 })
const results = analyseRows([row('=SK→ES', 'road', 'Slovakia', 'Spain'), row('AT→IT', 'rail', 'Austria', 'Italy'), row('IS→DE', 'road', 'Iceland', 'Germany')],
  [ev('France', 5, 'road'), ev('Italy', 3, 'rail', '=cmd|evil')])

console.log('■ 결과 요약 CSV')
const sum = buildSummaryCsv(results).split('\r\n')
const data = sum.filter((l) => l && !l.startsWith('#'))
ok(data.length === 1 + 3, '머리글 + 노선 3줄', String(data.length))
ok(data[0].split(',').length === 20, '머리글 열 20개', String(data[0].split(',').length))
ok(sum.some((l) => l.includes('no overland route')), '육로 없는 노선을 표시한다')
ok(sum.some((l) => l.startsWith("'=SK→ES")), '=로 시작하는 노선명은 막는다 (CSV 인젝션)')
ok(buildAllRoutesCsv(results).includes('""one""'), '쉼표·따옴표가 든 값은 감싸고 따옴표를 두 번 쓴다')

console.log('■ 전 경로 CSV')
const all = buildAllRoutesCsv(results).split('\r\n').filter((l) => l && !l.startsWith('#'))
const nOptions = results.reduce((n, r) => n + r.routes.options.length, 0)
ok(all.length === 1 + nOptions, `머리글 + 경로 ${nOptions}줄`, String(all.length))
ok(results[0].routes.options.length >= 2 && all.filter((l) => l.startsWith("'=SK→ES")).length === results[0].routes.options.length, '한 노선의 대체 경로가 모두 들어간다')
ok(!all.some((l) => l.startsWith("'=SK→ES") && l.endsWith(',yes')), '등급이 모두 같으면 yes를 달지 않는다')
const skew = analyseRows([row('X', 'road', 'Slovakia', 'Spain')], [ev('Italy', 4, 'road')])
const skewCsv = buildAllRoutesCsv(skew).split('\r\n').filter((l) => l && !l.startsWith('#'))
ok(skewCsv.some((l) => l.endsWith(',yes')) && skewCsv.some((l) => l.endsWith(',')), '이탈리아 경유만 나쁠 때: 안전한 경로에만 yes')
console.log(fail ? `\n❌ ${fail}건 실패` : '\n✅ 전부 통과')
process.exit(fail ? 1 : 0)
