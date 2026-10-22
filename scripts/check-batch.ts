/**
 * 엑셀 양식 왕복 점검 — 양식을 만들어 **그대로 다시 읽어** 보고,
 * 틀린 줄이 제대로 걸리는지 확인한다.
 *
 * 실행: npm run check:batch
 *
 * 왜 이 테스트가 필요한가 — 양식(열 순서·머리글 위치)과 파서는 서로 맞아야 하는데
 * 두 파일에 나뉘어 있다. 한쪽만 고치면 "양식을 받아서 그대로 올렸는데 안 읽힌다"가 된다.
 */
import { buildTemplate, readBuffer } from '../src/lib/batchExcel'
import { parseRows, spanOfRows, analyseRows } from '../src/lib/batchRoutes'

let failed = 0
const check = (ok: boolean, label: string, extra = '') => {
  if (!ok) failed++
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
}

async function main() {
  {
    console.log('\n■ 양식 왕복 (파일은 항상 영어)')
    const buf = await buildTemplate()
    const cells = await readBuffer(buf)
    const asIs = parseRows(cells)
    check(asIs.fatal === null, '머리글 인식', asIs.fatal?.ko ?? '')
    check(asIs.rows.length === 0 && asIs.skipped === 2, '견본 2줄은 조회하지 않고 건너뛴다', `읽음 ${asIs.rows.length} · 건너뜀 ${asIs.skipped}`)
    // 견본 표시("Example: ")를 지우면 같은 줄이 실제 노선으로 읽힌다 — 내용 자체는 맞는지 확인
    const p = parseRows(cells.map((row) => row.map((c) => (typeof c === 'string' ? c.replace(/^Example:\s*/, '') : c))))
    check(p.rows.length === 2, '견본 표시를 지우면 2줄을 읽는다', `읽음 ${p.rows.length}`)
    check(p.problems.length === 0, '예시 줄에 오류가 없다', p.problems.map((q) => q.message.ko).join(' / '))
    if (p.rows.length) {
      const r = p.rows[0]
      check(r.origin === 'Slovakia' && r.dest === 'Spain' && r.mode === 'road', '첫 줄 값이 맞다',
        `${r.mode} ${r.origin}→${r.dest} ${r.depart} ${r.lead}`)
      check(/^\d{4}-\d{2}-\d{2}$/.test(r.depart), '날짜 형식', r.depart)
    }
    if (p.rows.length === 2) {
      check(p.rows[1].via.join() === 'Austria', '경유지를 읽는다', p.rows[1].via.join())
      const span = spanOfRows(p.rows)!
      check(span.from <= span.to, '조회 기간', `${span.from} ~ ${span.to}`)
      const res = analyseRows(p.rows, [])
      check(res.every((x) => x.routes.options.length > 0), '경로가 계산된다',
        res.map((x) => x.routes.options[0]?.countries.join('·')).join(' | '))
    }
  }

  console.log('\n■ 틀린 줄 검출')
  const H = ['노선명', '운송수단', '출발국', '도착국', '경유지', '출발일', '리드타임']
  const bad = parseRows([
    H,
    ['a', 'Road', 'Czech Rep.', 'Spain', '', '2026-10-20', 5],
    ['b', 'Road', 'Poland', 'Spain', '', '2026-13-40', 5],
    ['c', '배', 'Poland', 'Spain', '', '2026-10-20', 5],
    ['d', 'Road', 'Poland', 'Spain', '', '2026-10-20', 999],
    ['e', 'Rail', 'Poland', 'Spain', 'Fransa', '2026-10-20', 4],
  ])
  check(bad.rows.length === 0, '틀린 줄은 통과시키지 않는다', `통과 ${bad.rows.length}`)
  check(bad.problems.length === 5, '다섯 줄 모두 잡는다', `잡음 ${bad.problems.length}`)
  check(/Czechia/.test(bad.problems[0]?.message.ko ?? ''), '오타에 후보를 제안한다', bad.problems[0]?.message.ko)

  console.log('\n■ 머리글이 없는 파일')
  const f = parseRows([['화주', '오더번호'], ['A사', '12345']])
  check(f.fatal !== null, '못 읽는다고 분명히 말한다', f.fatal?.ko ?? '(fatal 없음)')

  console.log(failed === 0 ? '\n✅ 전부 통과' : `\n❌ ${failed}건 실패`)
  if (failed) process.exit(1)
}
void main()
