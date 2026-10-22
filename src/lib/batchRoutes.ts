import type { Lang, RiskEvent } from './types'
import type { TransportMode } from './eventMeta'
import { COUNTRIES } from './locations'
import { buildRouteOptions, routeDateRange, type RouteOptions } from './routeAnalysis'

/**
 * 엑셀로 여러 노선을 한 번에 조회한다 (2026-10-14 신설).
 *
 * ## 왜 엑셀인가
 * 담당 노선은 보통 여러 개이고 거의 고정이다. 그런데 이 앱에는 **개인 계정이 없다** —
 * 노선을 DB에 저장하면 "누구 것인가"의 기준이 없다(사용자 판단 2026-10-08).
 * 엑셀 파일이 곧 저장소다. 공유폴더에 두면 팀이 같은 목록을 쓰고, 계정도 로그인도 필요 없다.
 *
 * ## ⚠️ 회사 기밀 — 정해진 열만 읽는다
 * 사용자 지시(2026-10-08): **화주·오더번호 같은 사내 정보는 읽지 않는다.**
 * 그래서 아래 `FIELDS`에 없는 열은 **읽지도, 결과 파일에 쓰지도 않는다.**
 * 편의를 위해 "남는 열은 그대로 돌려준다" 같은 기능을 넣지 말 것.
 *
 * ## 파일은 서버로 가지 않는다
 * 브라우저 안에서 읽고 끝난다. 업로드도 저장도 없다.
 */

/** 양식의 열. 한국어·영어 머리글을 모두 받는다 */
type FieldKey = 'name' | 'mode' | 'origin' | 'dest' | 'via' | 'depart' | 'lead'

interface FieldDef {
  key: FieldKey
  required: boolean
  header: Record<Lang, string>
  /** 머리글 인식용 별칭 (소문자·공백제거로 비교) */
  aliases: string[]
}

export const FIELDS: FieldDef[] = [
  { key: 'name',   required: false, header: { ko: '노선명', en: 'Route name' },   aliases: ['노선명', '노선', 'routename', 'route', 'name'] },
  { key: 'mode',   required: true,  header: { ko: '운송수단', en: 'Transport' },  aliases: ['운송수단', '운송타입', 'transport', 'mode'] },
  { key: 'origin', required: true,  header: { ko: '출발국', en: 'Origin' },       aliases: ['출발국', '출발지', '출발', 'origin', 'from'] },
  { key: 'dest',   required: true,  header: { ko: '도착국', en: 'Destination' },  aliases: ['도착국', '도착지', '도착', 'destination', 'to'] },
  { key: 'via',    required: false, header: { ko: '경유지', en: 'Waypoints' },    aliases: ['경유지', '경유', 'waypoints', 'waypoint', 'via'] },
  { key: 'depart', required: true,  header: { ko: '출발일', en: 'Departure' },    aliases: ['출발일', '출발날짜', 'departure', 'departdate', 'date'] },
  { key: 'lead',   required: true,  header: { ko: '리드타임', en: 'Lead time' },  aliases: ['리드타임', '기간', '일수', 'leadtime', 'duration', 'days'] },
]

const MODES: Record<string, TransportMode> = {
  road: 'road', rail: 'rail', air: 'air', sea: 'sea',
  도로: 'road', 육상: 'road', 트럭: 'road', 철도: 'rail', 항공: 'air', 해상: 'sea',
  truck: 'road', train: 'rail', ship: 'sea', ocean: 'sea', flight: 'air',
}

export const MAX_ROWS = 100

/** 견본 줄 표시 — 양식의 예시 노선명이 이렇게 시작한다 */
export const EXAMPLE_PREFIX = 'Example: '
const EXAMPLE_NAME = /^\s*(example|예시)\s*[:：]/i

const norm = (s: unknown) => String(s ?? '').trim()
/**
 * 비교용 열쇠 — 공백·구두점·필수 표시를 모두 걷어낸다.
 *
 * ⚠️ `*`를 꼭 지워야 한다. 양식의 머리글이 "운송수단 *"처럼 필수 표시를 달고 나가기 때문이다.
 *    2026-10-14 왕복 테스트에서 "양식을 받아 그대로 올렸는데 못 읽는" 문제로 잡혔다.
 */
const key = (s: unknown) => norm(s).toLowerCase().replace(/[\s_·.*()（）]/g, '')

/** 나라 이름 찾기. 대소문자·앞뒤 공백은 봐준다. 못 찾으면 null */
export function matchCountry(raw: string): string | null {
  const k = key(raw)
  if (!k) return null
  return COUNTRIES.find((c) => key(c) === k) ?? null
}

/** 오타일 때 "혹시 이것?"을 제안한다. 글자 겹침이 많은 순 */
export function suggestCountry(raw: string): string | null {
  const k = key(raw)
  if (k.length < 2) return null
  const starts = COUNTRIES.filter((c) => key(c).startsWith(k.slice(0, 3)))
  if (starts.length) return starts[0]
  const contains = COUNTRIES.filter((c) => key(c).includes(k) || k.includes(key(c)))
  return contains[0] ?? null
}

/** 엑셀 셀의 날짜를 YYYY-MM-DD로. 실패하면 null — 추측하지 않는다 */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // 엑셀 날짜는 UTC 자정으로 들어온다. 현지 변환으로 하루가 밀리지 않게 UTC로 읽는다
    return v.toISOString().slice(0, 10)
  }
  const s = norm(v)
  if (!s) return null
  const m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  // 2026-02-31 같은 값을 걸러낸다
  return new Date(t).toISOString().slice(0, 10) === iso ? iso : null
}

export interface BatchRow {
  /** 엑셀에서의 행 번호 (머리글 제외하고 1부터가 아니라, 사람이 보는 실제 행 번호) */
  excelRow: number
  name: string
  mode: TransportMode
  origin: string
  dest: string
  via: string[]
  depart: string
  lead: number
}

export interface BatchProblem {
  excelRow: number
  field: FieldKey | 'row'
  message: Record<Lang, string>
}

export interface BatchParse {
  rows: BatchRow[]
  /** 노선명이 "Example:"/"예시:"로 시작해 건너뛴 줄 수 — 양식에 들어 있는 견본 줄이다 */
  skipped: number
  problems: BatchProblem[]
  /** 머리글을 못 찾았을 때 — 파일 전체를 못 읽는다 */
  fatal: Record<Lang, string> | null
}

/** 엑셀 한 장을 행 배열로 바꾼다. `cells[r][c]` 형태, r·c는 0부터 */
export function parseRows(cells: unknown[][]): BatchParse {
  const problems: BatchProblem[] = []
  const rows: BatchRow[] = []
  let skipped = 0

  // ① 머리글 줄 찾기 — 필수 열이 가장 많이 맞는 줄
  let headRow = -1
  let colOf: Partial<Record<FieldKey, number>> = {}
  for (let r = 0; r < Math.min(cells.length, 10); r++) {
    const map: Partial<Record<FieldKey, number>> = {}
    ;(cells[r] ?? []).forEach((cell, c) => {
      const k = key(cell)
      if (!k) return
      const f = FIELDS.find((x) => x.aliases.includes(k))
      if (f && map[f.key] === undefined) map[f.key] = c
    })
    const hit = FIELDS.filter((f) => f.required && map[f.key] !== undefined).length
    const bestHit = FIELDS.filter((f) => f.required && colOf[f.key] !== undefined).length
    if (hit > bestHit) { headRow = r; colOf = map }
  }
  const missing = FIELDS.filter((f) => f.required && colOf[f.key] === undefined)
  if (headRow < 0 || missing.length) {
    const ko = missing.map((f) => f.header.ko).join(', ')
    const en = missing.map((f) => f.header.en).join(', ')
    return {
      rows: [], problems: [], skipped: 0,
      fatal: {
        ko: `양식의 머리글을 찾지 못했습니다${ko ? ` (없는 열: ${ko})` : ''}. 위의 "양식 받기"로 받은 파일을 쓰세요.`,
        en: `Could not find the template header${en ? ` (missing: ${en})` : ''}. Please use the file from "Download template".`,
      },
    }
  }

  const get = (row: unknown[], k: FieldKey) => {
    const c = colOf[k]
    return c === undefined ? '' : norm(row[c])
  }
  const raw = (row: unknown[], k: FieldKey) => {
    const c = colOf[k]
    return c === undefined ? undefined : row[c]
  }

  // ② 각 줄 검사
  for (let r = headRow + 1; r < cells.length; r++) {
    const row = cells[r] ?? []
    const excelRow = r + 1
    const anything = FIELDS.some((f) => get(row, f.key) !== '')
    if (!anything) continue
    // 양식에 들어 있는 견본 줄은 조회하지 않는다 — 지우는 것을 잊어도 가짜 노선이 결과에 섞이지 않게
    if (EXAMPLE_NAME.test(get(row, 'name'))) {
      skipped++
      continue
    }
    if (rows.length >= MAX_ROWS) {
      problems.push({ excelRow, field: 'row', message: {
        ko: `${MAX_ROWS}개까지만 조회합니다. 이 줄부터는 건너뜁니다.`,
        en: `Only ${MAX_ROWS} routes are analysed. Rows from here were skipped.`,
      } })
      break
    }

    let bad = false
    const fail = (field: FieldKey | 'row', ko: string, en: string) => {
      problems.push({ excelRow, field, message: { ko, en } }); bad = true
    }

    const modeRaw = get(row, 'mode')
    const mode = MODES[key(modeRaw)]
    if (!mode) fail('mode', `운송수단 '${modeRaw || '(비어 있음)'}'을 모릅니다. Road / Rail / Air / Sea 중 하나로 적어 주세요.`,
                            `Unknown transport '${modeRaw || '(empty)'}'. Use Road, Rail, Air or Sea.`)

    const originRaw = get(row, 'origin')
    const origin = matchCountry(originRaw)
    if (!origin) {
      const s = suggestCountry(originRaw)
      fail('origin', `출발국 '${originRaw || '(비어 있음)'}'을 찾을 수 없습니다.${s ? ` ${s} 인가요?` : ' 국가목록 시트에서 골라 주세요.'}`,
                     `Origin '${originRaw || '(empty)'}' not found.${s ? ` Did you mean ${s}?` : ' Pick one from the Countries sheet.'}`)
    }

    const destRaw = get(row, 'dest')
    const dest = matchCountry(destRaw)
    if (!dest) {
      const s = suggestCountry(destRaw)
      fail('dest', `도착국 '${destRaw || '(비어 있음)'}'을 찾을 수 없습니다.${s ? ` ${s} 인가요?` : ' 국가목록 시트에서 골라 주세요.'}`,
                   `Destination '${destRaw || '(empty)'}' not found.${s ? ` Did you mean ${s}?` : ' Pick one from the Countries sheet.'}`)
    }

    const via: string[] = []
    for (const part of get(row, 'via').split(',').map(norm).filter(Boolean)) {
      const hit = matchCountry(part)
      if (!hit) {
        const s = suggestCountry(part)
        fail('via', `경유지 '${part}'을 찾을 수 없습니다.${s ? ` ${s} 인가요?` : ''}`,
                    `Waypoint '${part}' not found.${s ? ` Did you mean ${s}?` : ''}`)
      } else via.push(hit)
    }

    const depart = parseDate(raw(row, 'depart'))
    if (!depart) fail('depart', `출발일을 읽을 수 없습니다 ('${get(row, 'depart') || '(비어 있음)'}'). 2026-10-20 형식으로 적어 주세요.`,
                                `Could not read the departure date ('${get(row, 'depart') || '(empty)'}'). Use the format 2026-10-20.`)

    const leadNum = Number(get(row, 'lead'))
    const lead = Number.isFinite(leadNum) ? Math.floor(leadNum) : NaN
    if (!Number.isFinite(lead) || lead < 1 || lead > 60) {
      fail('lead', `리드타임은 1~60 사이의 숫자여야 합니다 ('${get(row, 'lead') || '(비어 있음)'}').`,
                   `Lead time must be a number between 1 and 60 ('${get(row, 'lead') || '(empty)'}').`)
    }

    if (bad || !origin || !dest || !depart || !mode) continue
    rows.push({
      excelRow,
      name: get(row, 'name') || `${origin} → ${dest}`,
      mode, origin, dest, via, depart, lead,
    })
  }

  return { rows, problems, skipped, fatal: null }
}

/** 모든 줄을 덮는 조회 기간 — DB는 한 번만 읽는다 */
export function spanOfRows(rows: BatchRow[]): { from: string; to: string } | null {
  if (rows.length === 0) return null
  let from = '9999-12-31'
  let to = '0000-01-01'
  for (const r of rows) {
    const g = routeDateRange(r.depart, r.lead)
    if (g.from < from) from = g.from
    if (g.to > to) to = g.to
  }
  return { from, to }
}

export interface BatchResult {
  row: BatchRow
  routes: RouteOptions
  /** 기본 경로의 분석 */
  from: string
  to: string
}

/**
 * 읽어 들인 줄마다 경로·위험도를 계산한다.
 *
 * `events`는 `spanOfRows()` 범위로 **한 번만** 조회한 것을 넘긴다.
 * 노선이 50개여도 DB 조회는 1회다.
 */
export function analyseRows(rows: BatchRow[], events: RiskEvent[]): BatchResult[] {
  return rows.map((row) => {
    const range = routeDateRange(row.depart, row.lead)
    const picks = [{ country: row.origin }, ...row.via.map((v) => ({ country: v })), { country: row.dest }]
    return { row, routes: buildRouteOptions(events, picks, row.mode, range), from: range.from, to: range.to }
  })
}
