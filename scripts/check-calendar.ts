/**
 * 캘린더 막대 레이아웃 회귀 점검. 브라우저 없이 순수 로직만 검증한다.
 *   npm run check:calendar
 */
import {
  buildMonthWeeks,
  layoutWeek,
  eventsOnDay,
  parseISODate,
  toISODate,
} from '../src/lib/calendar.ts'
import { SAMPLE_EVENTS } from '../src/lib/sampleData.ts'
import { isActiveRisk, runLength } from '../src/lib/changes.ts'
import { buildCsv } from '../src/lib/exportCsv.ts'
import { COUNTRY_POINTS, findPoint } from '../src/lib/geo.ts'
import { readUrl } from '../src/lib/urlState.ts'

let fail = 0
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${msg}`)
  if (!cond) fail++
}

// --- 1. 월 격자 ---
const weeks = buildMonthWeeks(2026, 7) // 2026-08
ok(weeks.length >= 4 && weeks.length <= 6, `2026-08 주 수 = ${weeks.length}`)
ok(weeks.every((w) => w.length === 7), '모든 주가 7일')
ok(weeks[0][0].getDay() === 1, `격자 시작이 월요일 (getDay=${weeks[0][0].getDay()})`)

const allDays = weeks.flat()
const augDays = allDays.filter((d) => d.getMonth() === 7)
ok(augDays.length === 31, `8월 날짜가 31개 모두 포함 (${augDays.length})`)

// 연속성: 하루씩 증가
let continuous = true
for (let i = 1; i < allDays.length; i++) {
  if (allDays[i].getTime() - allDays[i - 1].getTime() !== 86400000) continuous = false
}
ok(continuous, '격자 날짜가 하루 간격으로 연속')

// --- 1b. 회귀: 이번 달 날짜가 하나도 없는 주가 생기면 안 된다 (2021-02 등에서 발생했던 버그) ---
let outsideWeeks = 0
for (let yy = 2015; yy <= 2035; yy++)
  for (let mm = 0; mm < 12; mm++) {
    const w = buildMonthWeeks(yy, mm)
    if (!w[w.length - 1].some((d) => d.getMonth() === mm)) outsideWeeks++
  }
ok(outsideWeeks === 0, `달 밖 주가 생기는 달 (2015~2035 전수): ${outsideWeeks}건`)

// --- 2. 막대 레이아웃 ---
console.log('\n주별 세그먼트:')
let totalSegments = 0
for (const week of weeks) {
  const { segments, laneCount } = layoutWeek(week, SAMPLE_EVENTS)
  totalSegments += segments.length
  if (segments.length) {
    console.log(
      `  ${toISODate(week[0])} ~ ${toISODate(week[6])}: ${segments.length}개 세그먼트, ${laneCount}줄`,
    )
    for (const s of segments) {
      console.log(
        `      lane${s.lane} col${s.startCol}+${s.span} ${s.event.country.padEnd(12)} ${s.event.event_name}`,
      )
    }
  }
}
ok(totalSegments > 0, `세그먼트가 생성됨 (${totalSegments})`)

// 같은 lane 안에서 겹치면 안 된다
let overlapBug = false
for (const week of weeks) {
  const { segments } = layoutWeek(week, SAMPLE_EVENTS)
  const byLane = new Map<number, { s: number; e: number }[]>()
  for (const seg of segments) {
    const arr = byLane.get(seg.lane) ?? []
    const range = { s: seg.startCol, e: seg.startCol + seg.span - 1 }
    for (const other of arr) {
      if (range.s <= other.e && other.s <= range.e) overlapBug = true
    }
    arr.push(range)
    byLane.set(seg.lane, arr)
  }
}
ok(!overlapBug, '같은 lane에서 막대가 겹치지 않음')

// 세그먼트가 주 경계를 넘지 않는다
let boundsBug = false
for (const week of weeks) {
  for (const seg of layoutWeek(week, SAMPLE_EVENTS).segments) {
    if (seg.startCol < 0 || seg.startCol + seg.span > 7 || seg.span < 1) boundsBug = true
  }
}
ok(!boundsBug, '모든 세그먼트가 0~6 컬럼 안에 있음')

// 여러 주에 걸치는 이벤트(ES 항만파업 8/20~8/24)
const esSegs = weeks.flatMap((w) =>
  layoutWeek(w, SAMPLE_EVENTS).segments.filter((s) => s.event.event_id === 'ES-ST-20260820-CAT'),
)
const esDays = esSegs.reduce((n, s) => n + s.span, 0)
ok(esDays === 5, `ES 항만파업(8/20~8/24)이 총 5일로 렌더 (${esDays}일)`)

// --- 3. severity 0 제외 ---
const withZero = [
  ...SAMPLE_EVENTS,
  { ...SAMPLE_EVENTS[0], event_id: 'ZZ-NIGHT-0', severity: 0, date_start: '2026-08-05', date_end: '2026-08-05' },
]
const zeroShown = weeks.some((w) =>
  layoutWeek(w, withZero).segments.some((s) => s.event.event_id === 'ZZ-NIGHT-0'),
)
ok(!zeroShown, 'severity 0 이벤트는 캘린더에 표시되지 않음 (business-rules Step 0)')

// --- 4. 날짜별 조회 ---
const aug15 = parseISODate('2026-08-15')
const on15 = eventsOnDay(SAMPLE_EVENTS, aug15)
ok(on15.length === 4, `8/15에 4건 (DE운행금지·SK·AT·BE 공휴일) — 실제 ${on15.length}건`)
console.log('   →', on15.map((e) => `${e.country}/${e.event_type}`).join(', '))

const aug22 = parseISODate('2026-08-22')
ok(
  eventsOnDay(SAMPLE_EVENTS, aug22).some((e) => e.event_id === 'ES-ST-20260820-CAT'),
  '기간 중간 날짜(8/22)에도 다일 이벤트가 잡힘',
)

// --- 4b. 회귀: 접힐 때 severity 높은 것이 밀려나면 안 된다 ---
const crowd = Array.from({ length: 8 }, (_, i) =>
  ({ ...SAMPLE_EVENTS[0], event_id: `Z${i}`, country: `C${i}`, severity: i === 7 ? 5 : 1,
     date_start: '2026-08-15', date_end: '2026-08-15' }))
const wk15 = weeks.find((w) => w.some((d) => d.getDate() === 15 && d.getMonth() === 7))!
const packed = layoutWeek(wk15, crowd, 3)
ok(
  packed.segments.some((s) => s.event.severity === 5),
  `severity 우선 표시 — 붐비는 날에도 severity 5가 보인다 (보임 ${packed.segments.length} / 접힘 ${packed.hidden.length})`,
)
ok(
  packed.hidden.every((h) => h.event.severity <= Math.min(...packed.segments.map((s) => s.event.severity))),
  '접힌 것이 보이는 것보다 severity가 높지 않다',
)

// --- 5. 타임존 안전성 ---
ok(toISODate(parseISODate('2026-01-01')) === '2026-01-01', 'parse→format 왕복이 날짜를 밀지 않음')
ok(toISODate(parseISODate('2026-12-31')) === '2026-12-31', '연말 날짜도 밀리지 않음')

// --- 6. 데이터 기준 시각 (MAX upd_dtm) ---
console.log('\n=== 데이터 기준 시각 ===')
const now = Date.now()
const mk2 = (id: string, hoursAgo: number) => ({
  ...SAMPLE_EVENTS[0], event_id: id,
  upd_dtm: new Date(now - hoursAgo * 3600_000).toISOString(),
})
const latestOf = (evs: { upd_dtm: string }[]) =>
  evs.reduce<string | null>((acc, e) => (!acc || e.upd_dtm > acc ? e.upd_dtm : acc), null)

const pool2 = [mk2('OLD', 50), mk2('NEW', 1), mk2('MID', 10)]
ok(latestOf(pool2) === pool2[1].upd_dtm, '가장 최근 upd_dtm을 고른다')
ok(latestOf([]) === null, '이벤트가 없으면 null (화면은 "데이터 없음"으로 표시)')

// --- 7. 취소는 위험 집계에서 빠진다 (WF-3 "본문에서 뺀다") ---
ok(!isActiveRisk({ ...SAMPLE_EVENTS[0], status: 'cancelled' as const }), '취소된 이벤트는 활성 위험이 아니다')
ok(isActiveRisk({ ...SAMPLE_EVENTS[0], status: 'active' as const }), 'active는 활성 위험이다')
ok(!isActiveRisk({ ...SAMPLE_EVENTS[0], severity: 0 }), 'severity 0도 활성 위험이 아니다')

// --- 8. 연속 구간 (business-rules "진짜 문제") ---
const es = SAMPLE_EVENTS.find((e) => e.event_id === 'ES-ST-20260820-CAT')!
const r1 = runLength(es, parseISODate('2026-08-20'))
const r3 = runLength(es, parseISODate('2026-08-22'))
const r5 = runLength(es, parseISODate('2026-08-24'))
ok(r1.total === 5 && r1.index === 1, `8/20은 5일 중 1일째 (${r1.total}/${r1.index})`)
ok(r3.index === 3, `8/22는 3일째 (${r3.index})`)
ok(r5.index === 5, `8/24는 5일째 (${r5.index})`)
const one = runLength(SAMPLE_EVENTS.find((e) => e.date_start === e.date_end)!, parseISODate('2026-08-15'))
ok(one.total === 1, '하루짜리는 1일 (연속 표시 안 함)')

// --- 9. CSV 내보내기 ---
console.log('\n=== CSV 내보내기 ===')
const csv = buildCsv(SAMPLE_EVENTS, { country: null })
const lines = csv.split('\r\n')
ok(lines[0] === 'date_start,date_end,country,region,type,severity,grade,status,event_name,summary,severity_reason,transport_mode,time_start,time_end,verified,source_url,updated_at',
   'CSV 머리글이 영어 컬럼 17개다')
// 따옴표 안 쉼표 때문에 split(',')로는 열을 셀 수 없다 — 제대로 파싱한다
const parseCsvLine = (line: string): string[] => {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

// 앱이 만드는 값(유형 라벨·등급·운송수단)은 전부 영어여야 한다.
// event_name·summary·severity_reason은 DB에서 온 원문이라 앱이 번역할 수 없다 —
// 그 언어는 n8n WF-2가 결정한다 (→ Q-026).
const APP_COLS = { type: 4, grade: 6, mode: 11 }
const appVals = lines
  .slice(1)
  .filter((l) => l && !l.includes('# '))
  .flatMap((l) => {
    const f = parseCsvLine(l)
    return [f[APP_COLS.type], f[APP_COLS.grade], f[APP_COLS.mode]]
  })
  .filter(Boolean)

ok(appVals.length > 0, `앱 생성 값 ${appVals.length}개를 검사 대상으로 추출`)
ok(!/[가-힣]/.test(appVals.join('')), '앱이 만드는 값(유형·등급·운송수단)에 한글이 없다')
ok(appVals.includes('Bank Holiday') || appVals.includes('Weather'), '유형 라벨이 영어로 나온다')
ok(appVals.some((v) => ['Low', 'Medium', 'High'].includes(v)), '등급이 영어로 나온다')
ok(appVals.some((v) => v.includes('Road') || v.includes('Rail')), '운송수단이 영어로 나온다')
ok(parseCsvLine(lines[1])[0].startsWith('2026-'), '열 파싱이 맞다 — 첫 열이 날짜')
const dataLines = lines.filter((l, i) => i > 0 && l && !l.includes('# '))
ok(
  dataLines.length === SAMPLE_EVENTS.filter((e) => e.severity > 0).length,
  `이벤트당 1줄 (데이터 ${dataLines.length}줄 / 샘플 ${SAMPLE_EVENTS.length}건)`,
)
ok(csv.includes('not being collected'), 'CSV에도 미수집 경고가 들어간다 (영어)')
ok(csv.includes('unverified items'), 'CSV에 미검증 제외 안내가 들어간다')

// 쉼표·따옴표가 든 값이 깨지면 열이 밀린다 — summary·severity_reason에 흔하다
const q = String.fromCharCode(34) // "
const tricky = [
  {
    ...SAMPLE_EVENTS[0],
    event_id: 'T1',
    event_name: `파업, 그리고 ${q}확대${q}`,
    summary: '줄바꿈\n포함',
    severity_reason: 'a,b,c',
  },
]
const t1 = buildCsv(tricky, { country: null })
ok(t1.includes(`${q}파업, 그리고 ${q}${q}확대${q}${q}${q}`), '따옴표가 CSV 규칙대로 두 번 쓰인다')
ok(t1.includes(`${q}줄바꿈\n포함${q}`), '줄바꿈이 든 값이 따옴표로 감싸진다')
ok(t1.includes(`${q}a,b,c${q}`), '쉼표가 든 값이 따옴표로 감싸진다')

// 데이터가 외부 크롤링에서 오므로 =·+·@로 시작하면 엑셀이 수식으로 실행한다
const evil = [{ ...SAMPLE_EVENTS[0], event_id: 'X1', event_name: '=1+1', summary: '@SUM(A1)' }]
const t2 = buildCsv(evil, { country: null })
ok(t2.includes("'=1+1"), 'CSV 인젝션 방어 — = 로 시작하는 값에 따옴표 접두')
ok(t2.includes("'@SUM(A1)"), 'CSV 인젝션 방어 — @ 로 시작하는 값에 따옴표 접두')

// 취소분은 버리지 않고 맨 뒤로 (WF-3 "본문에서 빼되 별도 표시")
const withCancel = [
  { ...SAMPLE_EVENTS[0], event_id: 'C1', status: 'cancelled' as const },
  ...SAMPLE_EVENTS,
]
const t3 = buildCsv(withCancel, { country: null }).split('\r\n')
const cancelIdx = t3.findIndex((l) => l.includes(',cancelled,') && !l.includes('# '))
ok(cancelIdx > 1, `취소된 이벤트가 포함되고 유효 건 뒤에 온다 (${cancelIdx}번째 줄)`)

// --- 10. 지도 분포도의 지리 계층 ---
console.log('\n=== 지도 분포도 ===')
// config.countries 실제 값 (→ wiki/spec/data-model.md, 사용자 확인 2026-08-09)
const CONFIG_COUNTRIES =
  'AT,BE,BG,CY,CZ,DE,DK,EE,ES,FI,FR,GR,HR,HU,IE,IT,LT,LU,LV,MT,NL,PL,PT,RO,SE,SI,SK,IS,LI,NO,CH,AL,BA,GE,MD,ME,MK,RS,TR,UA,XK,GB'.split(',')

const haveCodes = new Set(COUNTRY_POINTS.map((p) => p.code))
const missingFromMap = CONFIG_COUNTRIES.filter((c) => !haveCodes.has(c))
const extraInMap = [...haveCodes].filter((c) => !CONFIG_COUNTRIES.includes(c))
ok(missingFromMap.length === 0, `config의 42개국이 전부 위치를 가짐 (누락: ${missingFromMap.join(',') || '없음'})`)
ok(extraInMap.length === 0, `위치표에 config 밖 국가가 없음 (초과: ${extraInMap.join(',') || '없음'})`)
ok(COUNTRY_POINTS.length === CONFIG_COUNTRIES.length, `국가 수 일치 (${COUNTRY_POINTS.length}/${CONFIG_COUNTRIES.length})`)

// 타일이 겹치면 한 국가가 화면에서 사라진다
const seenCell = new Map<string, string>()
const dupes: string[] = []
for (const p of COUNTRY_POINTS) {
  const k = `${p.row},${p.col}`
  if (seenCell.has(k)) dupes.push(`${seenCell.get(k)}/${p.code}@${k}`)
  seenCell.set(k, p.code)
}
ok(dupes.length === 0, `타일 좌표가 전부 고유함 (겹침: ${dupes.join(' ') || '없음'})`)

// ★ 손으로 배치한 격자가 실제 지리와 어긋나지 않는지 위경도로 전수 교차검증한다.
//   타일 그리드는 원래 지리를 조금 구부리므로, 명백한 차이(위도 8도·경도 10도 초과)만 본다.
const latFlips: string[] = []
const lonFlips: string[] = []
for (const a2 of COUNTRY_POINTS) {
  for (const b2 of COUNTRY_POINTS) {
    if (a2.code >= b2.code) continue
    if (a2.lat - b2.lat > 8 && a2.row > b2.row) latFlips.push(`${a2.code}>${b2.code}`)
    if (b2.lat - a2.lat > 8 && b2.row > a2.row) latFlips.push(`${b2.code}>${a2.code}`)
    if (a2.lon - b2.lon > 10 && a2.col < b2.col) lonFlips.push(`${a2.code}<${b2.code}`)
    if (b2.lon - a2.lon > 10 && b2.col < a2.col) lonFlips.push(`${b2.code}<${a2.code}`)
  }
}
ok(latFlips.length === 0, `북쪽 나라가 아래로 내려간 배치 없음 (${latFlips.slice(0, 5).join(' ') || '없음'})`)
ok(lonFlips.length === 0, `동쪽 나라가 왼쪽으로 간 배치 없음 (${lonFlips.slice(0, 5).join(' ') || '없음'})`)

// 몇 가지 상식으로 방향 재확인
const g = (c: string) => findPoint(c)!
ok(g('Iceland').row === 0 && g('Iceland').col === 0, '아이슬란드가 좌상단 모서리')
ok(g('Finland').row < g('Greece').row, '핀란드가 그리스보다 위')
ok(g('Portugal').col < g('Ukraine').col, '포르투갈이 우크라이나보다 왼쪽')
ok(g('Estonia').row < g('Latvia').row && g('Latvia').row < g('Lithuania').row,
   '발트 3국이 북→남으로 EE·LV·LT 순서')

// 샘플 데이터의 국가명이 전부 위치로 해석되는가 (events.country는 영문 정식명)
const unresolved = [...new Set(SAMPLE_EVENTS.map((e) => e.country))].filter((c) => !findPoint(c))
ok(unresolved.length === 0, `샘플 국가명이 전부 매칭됨 (미해석: ${unresolved.join(',') || '없음'})`)
ok(findPoint('Czech Republic')?.code === 'CZ', '별칭 매칭 — Czech Republic → CZ')
ok(findPoint('UK')?.code === 'GB', '별칭 매칭 — UK → GB')
ok(findPoint('Atlantis') === null, '모르는 국가는 null (조용히 엉뚱한 곳에 찍지 않는다)')

// --- 11. URL 상태 · 하위호환 ---
console.log('\n=== URL 상태 ===')
const withHash = (h: string) => {
  ;(globalThis as { window?: unknown }).window = { location: { hash: h } }
  return readUrl()
}
ok(withHash('#/calendar?d=2026-08-15&c=Germany&v=list').screen === 'calendar', '현재 형식 파싱 — screen')
ok(withHash('#/calendar?d=2026-08-15&c=Germany&v=list').date === '2026-08-15', '현재 형식 파싱 — 날짜')
ok(withHash('#/calendar?c=Germany').country === 'Germany', '현재 형식 파싱 — 국가')
ok(withHash('#/calendar?v=map').view === 'map', '현재 형식 파싱 — 뷰')
ok(withHash('#/admin').screen === 'admin', 'admin 화면')

// 모르는 경로여도 쿼리는 살아남는다 — 호출부가 기본 화면으로 떨어뜨리므로 날짜는 유지된다
ok(withHash('#/wat?d=2026-08-15').screen === undefined, '모르는 경로는 screen을 비운다')
ok(withHash('#/wat?d=2026-08-15').date === '2026-08-15', '경로를 몰라도 날짜 파라미터는 살아남는다')

ok(withHash('#/calendar?d=nonsense').date === undefined, '이상한 날짜는 무시한다')
ok(withHash('').date === undefined, '빈 해시에 폭발하지 않는다')

console.log(`\n${fail === 0 ? '✅ 전부 통과' : `❌ ${fail}건 실패`}`)
process.exit(fail === 0 ? 0 : 1)
