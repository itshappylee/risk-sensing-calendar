import { COUNTRIES } from './locations'

/**
 * 어느 나라를 지나는가 — 육로 국경 그래프.
 *
 * ## 왜 필요했나
 * 2026-10-14 이전에는 경로 분석이 **사용자가 고른 나라만** 봤다. 오스트리아 → 스페인을
 * 조회하면 분석 대상이 그 둘뿐이라, 트럭이 실제로 지나는 독일·프랑스의 파업과 운행금지가
 * **통째로 빠졌다.** 경유지를 손으로 넣어야만 잡혔다.
 *
 * 좌표도 도로 데이터도 없지만, **"어느 나라를 거쳐야 하는가"는 국경만 알면 답할 수 있다.**
 * 이 파일이 그 국경표다. 외부 지도 API를 쓰지 않으므로 네트워크도 키도 필요 없다.
 *
 * ## 무엇을 하지 않는가
 * - 실제 도로·거리·소요시간을 계산하지 않는다. 경로 비교는 **국경 통과 수**로만 한다.
 *   화면에도 그렇게 적는다. 거리를 모르면서 "이 길이 더 빠릅니다"라고 하지 않는다.
 * - 항공·해상은 이 그래프를 쓰지 않는다. 출발·도착 국가만 본다 (중간 영공·공해는 실무상 무의미).
 *
 * ## 국경표를 고칠 때
 * `LAND`에 한쪽만 적어도 된다 — 읽을 때 양방향으로 만든다. 다만 `validateGraph()`를
 * 돌려 오타(목록에 없는 나라 이름)를 먼저 잡는다. 테스트: `npm run check:graph`
 */

/** 국경의 종류. 화면에서 페리·터널 구간을 따로 표시하려고 구분한다 */
export type BorderKind = 'land' | 'sea'

/**
 * 육로 국경. 값은 '맞닿은 나라' 목록이다.
 *
 * ⚠️ 이 앱이 다루는 42개국 안에서만 적는다. 벨라루스·러시아는 목록에 없으므로
 *    리투아니아–폴란드처럼 **42개국 안에서 이어지는 길만** 나온다. 발트 3국이
 *    폴란드를 통해서만 이어지는 것은 오류가 아니라 범위 때문이다.
 */
const LAND: Record<string, string[]> = {
  Albania: ['Montenegro', 'Kosovo', 'North Macedonia', 'Greece'],
  Austria: ['Germany', 'Czechia', 'Slovakia', 'Hungary', 'Slovenia', 'Italy', 'Switzerland', 'Liechtenstein'],
  Belgium: ['Netherlands', 'Germany', 'Luxembourg', 'France'],
  'Bosnia and Herzegovina': ['Croatia', 'Serbia', 'Montenegro'],
  Bulgaria: ['Romania', 'Serbia', 'North Macedonia', 'Greece', 'Turkey'],
  Croatia: ['Slovenia', 'Hungary', 'Serbia', 'Bosnia and Herzegovina', 'Montenegro'],
  Czechia: ['Germany', 'Poland', 'Slovakia', 'Austria'],
  Denmark: ['Germany'],
  Estonia: ['Latvia'],
  Finland: ['Sweden', 'Norway'],
  France: ['Belgium', 'Luxembourg', 'Germany', 'Switzerland', 'Italy', 'Spain'],
  Georgia: ['Turkey'],
  Germany: ['Denmark', 'Poland', 'Czechia', 'Austria', 'Switzerland', 'France', 'Luxembourg', 'Belgium', 'Netherlands'],
  Greece: ['Albania', 'North Macedonia', 'Bulgaria', 'Turkey'],
  Hungary: ['Slovakia', 'Ukraine', 'Romania', 'Serbia', 'Croatia', 'Slovenia', 'Austria'],
  Ireland: ['United Kingdom'],
  Italy: ['France', 'Switzerland', 'Austria', 'Slovenia'],
  Kosovo: ['Montenegro', 'Albania', 'North Macedonia', 'Serbia'],
  Latvia: ['Estonia', 'Lithuania'],
  Liechtenstein: ['Switzerland', 'Austria'],
  Lithuania: ['Latvia', 'Poland'],
  Luxembourg: ['Belgium', 'Germany', 'France'],
  Moldova: ['Romania', 'Ukraine'],
  Montenegro: ['Croatia', 'Bosnia and Herzegovina', 'Serbia', 'Kosovo', 'Albania'],
  Netherlands: ['Germany', 'Belgium'],
  'North Macedonia': ['Kosovo', 'Serbia', 'Bulgaria', 'Greece', 'Albania'],
  Norway: ['Sweden', 'Finland'],
  Poland: ['Germany', 'Czechia', 'Slovakia', 'Ukraine', 'Lithuania'],
  Portugal: ['Spain'],
  Romania: ['Hungary', 'Serbia', 'Bulgaria', 'Moldova', 'Ukraine'],
  Serbia: ['Hungary', 'Romania', 'Bulgaria', 'North Macedonia', 'Kosovo', 'Montenegro', 'Bosnia and Herzegovina', 'Croatia'],
  Slovakia: ['Czechia', 'Poland', 'Ukraine', 'Hungary', 'Austria'],
  Slovenia: ['Austria', 'Hungary', 'Croatia', 'Italy'],
  Spain: ['France', 'Portugal'],
  Sweden: ['Norway', 'Finland'],
  Switzerland: ['Germany', 'France', 'Italy', 'Austria', 'Liechtenstein'],
  Turkey: ['Greece', 'Bulgaria', 'Georgia'],
  Ukraine: ['Poland', 'Slovakia', 'Hungary', 'Romania', 'Moldova'],
  'United Kingdom': ['Ireland'],
}

/**
 * 화물차가 실제로 건너는 터널·로로(ro-ro) 페리 구간.
 *
 * 육로는 아니지만 **트럭이 차에 실린 채 건너는** 정기 항로만 넣는다. 컨테이너 해상운송은
 * 넣지 않는다 — 그건 운송 타입 'sea'의 영역이고, 경유 국가라는 개념이 다르다.
 * 넣은 근거: 화물 물동량이 많고 정기적으로 운항하는 구간.
 */
const SEA: Record<string, string[]> = {
  'United Kingdom': ['France', 'Belgium', 'Netherlands', 'Ireland'],
  Ireland: ['France'],
  Denmark: ['Sweden', 'Norway'],
  Sweden: ['Germany', 'Poland', 'Denmark'],
  Finland: ['Estonia'],
  Italy: ['Greece', 'Albania', 'Malta'],
}

export interface Edge {
  to: string
  kind: BorderKind
}

/** 양방향으로 펼친 인접 목록. 한 번만 만든다 */
const ADJ: Map<string, Edge[]> = (() => {
  const m = new Map<string, Edge[]>()
  const add = (a: string, b: string, kind: BorderKind) => {
    if (a === b) return
    const list = m.get(a) ?? []
    if (!list.some((e) => e.to === b)) list.push({ to: b, kind })
    m.set(a, list)
  }
  for (const [a, list] of Object.entries(LAND)) for (const b of list) { add(a, b, 'land'); add(b, a, 'land') }
  for (const [a, list] of Object.entries(SEA)) for (const b of list) { add(a, b, 'sea'); add(b, a, 'sea') }
  for (const list of m.values()) list.sort((x, y) => x.to.localeCompare(y.to))
  return m
})()

export function neighbours(country: string): Edge[] {
  return ADJ.get(country) ?? []
}

/** 육로·페리로 어디와도 이어지지 않는 나라 (아이슬란드·키프로스 등) */
export function isIsolated(country: string): boolean {
  return neighbours(country).length === 0
}

export interface RoutePath {
  /** 출발 → 도착까지 지나는 나라, 순서대로. 양 끝 포함 */
  countries: string[]
  /** 국경 통과 수 = countries.length - 1 */
  hops: number
  /** 그중 페리·터널 구간 수 */
  seaHops: number
}

const MAX_NODES = 60000

/**
 * 두 나라 사이의 경로를 짧은 것부터 최대 `max`개 찾는다.
 *
 * 최단 거리(d)를 먼저 재고, `d + extra`홉 이내의 단순 경로만 훑는다.
 * 42개국짜리 작은 그래프라 이 정도면 즉시 끝난다.
 */
export function findPaths(
  from: string,
  to: string,
  opts: { max?: number; extra?: number } = {},
): RoutePath[] {
  const max = opts.max ?? 4
  const extra = opts.extra ?? 1
  if (!from || !to) return []
  if (from === to) return [{ countries: [from], hops: 0, seaHops: 0 }]
  if (!ADJ.has(from) || !ADJ.has(to)) return []

  // ① 도착지까지 남은 최단 홉 수 — **도착지에서** 너비 우선으로 잰다.
  //    ⚠️ 출발지 기준으로 재면 안 된다. 아래 가지치기가 "여기서 도착까지 몇 홉 남았나"를
  //       묻기 때문이다. 2026-10-14에 출발지 기준으로 잘못 재서 2홉 이상 경로가 전부
  //       잘려 나갔다(이웃 나라만 찾아졌다). 국경은 양방향이라 도착지 기준 BFS로 바로 구한다.
  const distTo = new Map<string, number>([[to, 0]])
  const queue = [to]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    const d = distTo.get(cur)!
    for (const e of neighbours(cur)) {
      if (distTo.has(e.to)) continue
      distTo.set(e.to, d + 1)
      queue.push(e.to)
    }
  }
  const best = distTo.get(from)
  if (best === undefined) return [] // 이어지지 않는다 (섬 등)

  // ② best + extra 홉 이내의 단순 경로 수집
  const limit = best + extra
  const found: RoutePath[] = []
  const path: string[] = [from]
  const seen = new Set<string>([from])
  let seaHops = 0
  let visited = 0

  const walk = (cur: string) => {
    if (found.length >= max * 4 || visited > MAX_NODES) return
    visited++
    if (cur === to) {
      found.push({ countries: [...path], hops: path.length - 1, seaHops })
      return
    }
    if (path.length - 1 >= limit) return
    for (const e of neighbours(cur)) {
      if (seen.has(e.to)) continue
      // 남은 홉으로는 도착할 수 없는 가지를 미리 잘라낸다.
      // 그 나라로 가면 홉이 path.length가 되고, 거기서 최소 rest홉이 더 필요하다.
      const rest = distTo.get(e.to)
      if (rest === undefined) continue
      if (path.length + rest > limit) continue
      seen.add(e.to)
      path.push(e.to)
      if (e.kind === 'sea') seaHops++
      walk(e.to)
      if (e.kind === 'sea') seaHops--
      path.pop()
      seen.delete(e.to)
    }
  }
  walk(from)

  // ③ 짧은 것 → 페리가 적은 것 → 이름순. 같은 경로는 한 번만
  found.sort(
    (a, b) =>
      a.hops - b.hops ||
      a.seaHops - b.seaHops ||
      a.countries.join('>').localeCompare(b.countries.join('>')),
  )
  const out: RoutePath[] = []
  const keys = new Set<string>()
  for (const p of found) {
    const k = p.countries.join('>')
    if (keys.has(k)) continue
    keys.add(k)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/**
 * 출발 → (경유지…) → 도착 전체 경로를 짧은 것부터 최대 `max`개.
 *
 * 구간마다 후보를 뽑아 이어 붙인다. 같은 나라를 두 번 지나는 조합은 버린다 —
 * 경유지를 일부러 그렇게 찍은 경우가 아니면 분석에서 중복 집계가 된다.
 */
export function findRoutes(points: string[], opts: { max?: number } = {}): RoutePath[] {
  const max = opts.max ?? 4
  const stops = points.map((p) => (p || '').trim()).filter(Boolean)
  if (stops.length === 0) return []
  if (stops.length === 1) return [{ countries: [stops[0]], hops: 0, seaHops: 0 }]

  let combos: RoutePath[] = [{ countries: [stops[0]], hops: 0, seaHops: 0 }]
  for (let i = 0; i < stops.length - 1; i++) {
    const legs = findPaths(stops[i], stops[i + 1], { max: max + 2 })
    if (legs.length === 0) return [] // 한 구간이라도 못 이으면 경로 없음
    const next: RoutePath[] = []
    for (const base of combos) {
      for (const leg of legs) {
        const merged = base.countries.concat(leg.countries.slice(1))
        // 같은 나라를 두 번 지나는 조합은 버린다 (경유지로 지정한 경우는 제외)
        const dup = merged.length !== new Set(merged).size
        if (dup) continue
        next.push({
          countries: merged,
          hops: base.hops + leg.hops,
          seaHops: base.seaHops + leg.seaHops,
        })
      }
    }
    if (next.length === 0) return []
    next.sort((a, b) => a.hops - b.hops || a.seaHops - b.seaHops)
    combos = next.slice(0, 40) // 조합 폭발 방지
  }

  combos.sort(
    (a, b) =>
      a.hops - b.hops ||
      a.seaHops - b.seaHops ||
      a.countries.join('>').localeCompare(b.countries.join('>')),
  )
  const out: RoutePath[] = []
  const keys = new Set<string>()
  for (const p of combos) {
    const k = p.countries.join('>')
    if (keys.has(k)) continue
    keys.add(k)
    out.push(p)
    if (out.length >= max) break
  }
  return out
}

/** 두 나라 사이가 페리·터널인지 */
export function borderKind(a: string, b: string): BorderKind | null {
  return neighbours(a).find((e) => e.to === b)?.kind ?? null
}

/** 경로 안의 페리·터널 구간 목록 — 화면에서 "페리" 표시를 붙일 때 쓴다 */
export function seaSegments(countries: string[]): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < countries.length - 1; i++) {
    if (borderKind(countries[i], countries[i + 1]) === 'sea') out.push([countries[i], countries[i + 1]])
  }
  return out
}

/** 오타 점검 — 국경표의 모든 이름이 42개국 목록에 있는지, 양방향이 맞는지 */
export function validateGraph(): string[] {
  const problems: string[] = []
  const known = new Set(COUNTRIES)
  for (const [table, name] of [[LAND, 'LAND'], [SEA, 'SEA']] as const) {
    for (const [a, list] of Object.entries(table)) {
      if (!known.has(a)) problems.push(`${name}: 모르는 나라 '${a}'`)
      for (const b of list) if (!known.has(b)) problems.push(`${name}: '${a}' 의 이웃 '${b}' 를 모른다`)
    }
  }
  for (const [a, list] of ADJ) {
    for (const e of list) {
      const back = (ADJ.get(e.to) ?? []).find((x) => x.to === a)
      if (!back) problems.push(`양방향 아님: ${a} → ${e.to}`)
      else if (back.kind !== e.kind) problems.push(`종류 불일치: ${a} ↔ ${e.to}`)
    }
  }
  return problems
}
