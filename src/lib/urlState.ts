import { COUNTRIES } from './locations'

/**
 * URL 해시에 화면 상태를 담는다. 목적은 둘이다.
 *   1) 새로고침해도 보던 자리가 유지된다
 *   2) "8월 15일 이거 봐줘"를 동료에게 **링크로** 보낼 수 있다
 *      — 별도 "링크 복사" 버튼은 두지 않는다. 사용자가 주소창에서 그대로 복사하기 때문
 *        (→ 사용자 확인 2026-08-26). 버튼은 중복이었다.
 *
 * 구 형식(`#/main`) 하위호환 매핑은 두지 않는다 — **아직 외부로 공유된 링크가 없다**
 * (→ 사용자 확인 2026-08-26). 실제로 공유가 시작되면 그때 URL이 계약이 되고,
 * 화면 구조를 바꿀 때마다 매핑이 필요해진다.
 *
 * 라우터 라이브러리를 넣지 않고 해시만 쓴다 — 정적 호스팅에서 서버 설정 없이 동작하고,
 * 의존성이 늘지 않는다.
 *
 *   #/calendar?d=2026-08-15&c=Germany&v=month
 */

/** 경로 분석(한 건 조회)의 입력 — 주소에 담아 링크로 보낼 수 있다 */
export interface RouteQuery {
  mode: 'road' | 'rail' | 'air' | 'sea'
  from: string
  to: string
  via: string[]
  dep: string
  n: number
}

export interface UrlState {
  screen: 'calendar' | 'route' | 'info' | 'admin'
  /** 선택 날짜 YYYY-MM-DD */
  date?: string
  /** 국가 필터. 없으면 전체 */
  country?: string
  view?: 'month' | 'map' | 'list'
  /** 경로 분석 화면에서만 쓴다 */
  route?: RouteQuery
}

const ROUTE_MODES = ['road', 'rail', 'air', 'sea'] as const
const SCREENS = ['calendar', 'route', 'info', 'admin'] as const

export function readUrl(): Partial<UrlState> {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (!h) return {}
  const [path, query] = h.split('?')
  const p = new URLSearchParams(query ?? '')

  // 모르는 경로는 screen을 비워 둔다 — 호출부가 기본 화면으로 떨어뜨린다.
  // 쿼리(d·c·v)는 경로와 무관하게 파싱되므로 옛 링크도 날짜·국가는 살아남는다.
  const screen = (SCREENS as readonly string[]).includes(path)
    ? (path as UrlState['screen'])
    : undefined
  const date = p.get('d')
  const country = p.get('c')
  const view = p.get('v')

  const route = readRouteQuery(p)

  return {
    ...(screen ? { screen } : {}),
    ...(route ? { route } : {}),
    ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    ...(country ? { country } : {}),
    ...(view === 'month' || view === 'map' || view === 'list' ? { view } : {}),
  }
}

/**
 * 경로 분석 쿼리 — `#/route?m=road&from=Slovakia&to=Spain&via=Austria,Italy&dep=2026-10-29&n=5`
 * 출발·도착이 없거나 모르는 국가면 통째로 무시한다(반쪽짜리 입력으로 분석을 돌리지 않는다).
 */
function readRouteQuery(p: URLSearchParams): RouteQuery | undefined {
  const from = p.get('from')
  const to = p.get('to')
  if (!from || !to || !COUNTRIES.includes(from) || !COUNTRIES.includes(to)) return undefined
  const m = p.get('m')
  const mode = (ROUTE_MODES as readonly string[]).includes(m ?? '') ? (m as RouteQuery['mode']) : 'road'
  const via = (p.get('via') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => COUNTRIES.includes(v))
    .slice(0, 5)
  const dep = p.get('dep')
  const n = Number(p.get('n'))
  return {
    mode,
    from,
    to,
    via,
    dep: dep && /^\d{4}-\d{2}-\d{2}$/.test(dep) ? dep : '',
    n: Number.isInteger(n) && n >= 1 && n <= 60 ? n : 3,
  }
}

/** 히스토리를 오염시키지 않도록 replaceState를 쓴다 (뒤로가기가 필터 변경마다 걸리면 성가시다) */
export function writeUrl(s: UrlState): void {
  const p = new URLSearchParams()
  if (s.route) {
    p.set('m', s.route.mode)
    p.set('from', s.route.from)
    p.set('to', s.route.to)
    if (s.route.via.length) p.set('via', s.route.via.join(','))
    if (s.route.dep) p.set('dep', s.route.dep)
    p.set('n', String(s.route.n))
  }
  if (s.date) p.set('d', s.date)
  if (s.country) p.set('c', s.country)
  if (s.view && s.view !== 'month') p.set('v', s.view)
  const q = p.toString()
  const next = `#/${s.screen}${q ? `?${q}` : ''}`
  if (window.location.hash !== next) {
    window.history.replaceState(null, '', next)
  }
}

