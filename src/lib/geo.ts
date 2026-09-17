/**
 * 국가 → 대표 좌표 (수도 기준, 소수점 1자리 근사).
 *
 * ⚠️ **DB에는 좌표가 없다.** 이 표는 화면 배치를 위한 **정적 참조**이며,
 * `events`의 데이터가 아니다 (→ wiki/spec/data-model.md "아직 없는 것").
 * 즉 이 표로 할 수 있는 것은 **국가 단위 분포 표시**뿐이고,
 * 경로 교차 판정(2b)은 여전히 불가능하다 — 그건 이벤트별 지리 정보가 필요하다.
 *
 * 화면은 `row`/`col`(타일 그리드)만 쓴다. `lat`/`lon`은 **그 배치가 실제 지리와
 * 어긋나지 않는지 회귀 테스트가 검증하는 용도**로 남겨 둔다 (→ DEC-015).
 *
 * 키는 `events.country`가 쓰는 영문 국가명이고, `config.countries`의 ISO 코드도 함께 받는다.
 * 대상 42개국은 config에서 확인된 목록이다 (→ data-model.md `config` 절).
 */

export interface GeoPoint {
  /** ISO 3166-1 alpha-2 */
  code: string
  name: string
  /** 실제 위치(수도 기준). 타일 배치가 지리와 어긋나지 않는지 **검증**하는 데 쓴다 */
  lat: number
  lon: number
  /** 타일 그리드 좌표 — row는 북→남, col은 서→동 */
  row: number
  col: number
}

export const COUNTRY_POINTS: GeoPoint[] = [
  { code: 'IS', name: 'Iceland', lat: 64.1, lon: -21.9, row: 0, col: 0 },
  { code: 'IE', name: 'Ireland', lat: 53.3, lon: -6.3, row: 2, col: 3 },
  { code: 'GB', name: 'United Kingdom', lat: 51.5, lon: -0.1, row: 2, col: 4 },
  { code: 'PT', name: 'Portugal', lat: 38.7, lon: -9.1, row: 6, col: 2 },
  { code: 'ES', name: 'Spain', lat: 40.4, lon: -3.7, row: 6, col: 3 },
  { code: 'FR', name: 'France', lat: 48.9, lon: 2.4, row: 5, col: 4 },
  { code: 'BE', name: 'Belgium', lat: 50.8, lon: 4.4, row: 4, col: 4 },
  { code: 'NL', name: 'Netherlands', lat: 52.4, lon: 4.9, row: 3, col: 5 },
  { code: 'LU', name: 'Luxembourg', lat: 49.6, lon: 6.1, row: 4, col: 5 },
  { code: 'CH', name: 'Switzerland', lat: 46.9, lon: 7.4, row: 5, col: 5 },
  { code: 'LI', name: 'Liechtenstein', lat: 47.1, lon: 9.5, row: 5, col: 6 },
  { code: 'IT', name: 'Italy', lat: 41.9, lon: 12.5, row: 6, col: 4 },
  { code: 'MT', name: 'Malta', lat: 35.9, lon: 14.5, row: 7, col: 4 },
  { code: 'DE', name: 'Germany', lat: 52.5, lon: 13.4, row: 3, col: 6 },
  { code: 'DK', name: 'Denmark', lat: 55.7, lon: 12.6, row: 2, col: 6 },
  { code: 'NO', name: 'Norway', lat: 59.9, lon: 10.8, row: 1, col: 6 },
  { code: 'SE', name: 'Sweden', lat: 59.3, lon: 18.1, row: 1, col: 7 },
  { code: 'FI', name: 'Finland', lat: 60.2, lon: 24.9, row: 1, col: 8 },
  { code: 'EE', name: 'Estonia', lat: 59.4, lon: 24.8, row: 2, col: 8 },
  { code: 'LV', name: 'Latvia', lat: 56.9, lon: 24.1, row: 3, col: 8 },
  { code: 'LT', name: 'Lithuania', lat: 54.7, lon: 25.3, row: 4, col: 8 },
  { code: 'PL', name: 'Poland', lat: 52.2, lon: 21.0, row: 3, col: 7 },
  { code: 'CZ', name: 'Czechia', lat: 50.1, lon: 14.4, row: 4, col: 6 },
  { code: 'AT', name: 'Austria', lat: 48.2, lon: 16.4, row: 5, col: 7 },
  { code: 'SK', name: 'Slovakia', lat: 48.1, lon: 17.1, row: 4, col: 7 },
  { code: 'HU', name: 'Hungary', lat: 47.5, lon: 19.0, row: 5, col: 8 },
  { code: 'SI', name: 'Slovenia', lat: 46.1, lon: 14.5, row: 6, col: 5 },
  { code: 'HR', name: 'Croatia', lat: 45.8, lon: 16.0, row: 6, col: 6 },
  { code: 'BA', name: 'Bosnia and Herzegovina', lat: 43.9, lon: 18.4, row: 7, col: 6 },
  { code: 'RS', name: 'Serbia', lat: 44.8, lon: 20.5, row: 6, col: 7 },
  { code: 'ME', name: 'Montenegro', lat: 42.4, lon: 19.3, row: 7, col: 7 },
  { code: 'XK', name: 'Kosovo', lat: 42.7, lon: 21.2, row: 8, col: 7 },
  { code: 'MK', name: 'North Macedonia', lat: 42.0, lon: 21.4, row: 8, col: 8 },
  { code: 'AL', name: 'Albania', lat: 41.3, lon: 19.8, row: 8, col: 6 },
  { code: 'GR', name: 'Greece', lat: 38.0, lon: 23.7, row: 8, col: 9 },
  { code: 'BG', name: 'Bulgaria', lat: 42.7, lon: 23.3, row: 7, col: 8 },
  { code: 'RO', name: 'Romania', lat: 44.4, lon: 26.1, row: 6, col: 8 },
  { code: 'MD', name: 'Moldova', lat: 47.0, lon: 28.9, row: 5, col: 9 },
  { code: 'UA', name: 'Ukraine', lat: 50.5, lon: 30.5, row: 4, col: 9 },
  { code: 'CY', name: 'Cyprus', lat: 35.2, lon: 33.4, row: 8, col: 10 },
  { code: 'TR', name: 'Turkey', lat: 39.9, lon: 32.9, row: 7, col: 9 },
  { code: 'GE', name: 'Georgia', lat: 41.7, lon: 44.8, row: 6, col: 10 },
]

/** `events.country`가 다른 표기를 쓸 수 있어 별칭을 받아 준다 */
const ALIASES: Record<string, string> = {
  'czech republic': 'Czechia',
  uk: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  'bosnia & herzegovina': 'Bosnia and Herzegovina',
  bosnia: 'Bosnia and Herzegovina',
  macedonia: 'North Macedonia',
  türkiye: 'Turkey',
  turkiye: 'Turkey',
  holland: 'Netherlands',
}

const INDEX = new Map<string, GeoPoint>()
for (const p of COUNTRY_POINTS) {
  INDEX.set(p.name.toLowerCase(), p)
  INDEX.set(p.code.toLowerCase(), p)
}

export function findPoint(country: string): GeoPoint | null {
  const k = country.trim().toLowerCase()
  return INDEX.get(k) ?? INDEX.get(ALIASES[k]?.toLowerCase() ?? '') ?? null
}
