import { geoArea, geoConicConformal, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, Polygon } from 'geojson'
import { findPoint } from './geo'

/**
 * 실제 유럽 지도 모양 — Natural Earth(1:50m)를 담은 `world-atlas` 패키지에서 읽는다.
 *
 * 앱에 번들로 포함하고, 지도 화면을 처음 열 때만 불러온다(동적 import). 외부 주소를 쓰지 않으므로
 * 인터넷이 막힌 사내망에서도 그려진다.
 *
 * ⚠️ 이 모양 데이터는 **화면에 그리기만** 한다. DB에는 좌표가 없고(→ geo.ts),
 * 위험 판정은 여전히 국가 단위다. 국경선이 어디냐는 판정에 쓰이지 않는다.
 */

export const MAP_W = 900
export const MAP_H = 760

export interface Shape {
  /** 감시 대상 42개국이면 `events.country`가 쓰는 영문 국가명, 아니면 null(배경 국가) */
  country: string | null
  /** SVG path */
  d: string
}

export interface EuropeMap {
  shapes: Shape[]
  /** 국가명 → 숫자(건수)를 놓을 자리. 본토 가장 큰 덩어리의 중심 */
  labels: Record<string, { x: number; y: number }>
}

/** world-atlas가 줄여 쓴 이름 → 우리 국가명 */
const NAME_ALIAS: Record<string, string> = {
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  Macedonia: 'North Macedonia',
  'N. Cyprus': 'Cyprus',
}

type Props = { name: string }
type Atlas = Topology<{ countries: GeometryCollection<Props> }>

export async function loadEuropeMap(): Promise<EuropeMap> {
  const mod = await import('world-atlas/countries-50m.json')
  const topo = ((mod as { default?: unknown }).default ?? mod) as unknown as Atlas
  const fc = feature(topo, topo.objects.countries)

  const projection = geoConicConformal()
    .rotate([-14, 0])
    .center([0, 53])
    .parallels([38, 66])
    .scale(1120)
    .translate([MAP_W / 2, MAP_H / 2])
    // 화면 밖(러시아 동쪽·해외 영토)은 그리지 않는다
    .clipExtent([
      [0, 0],
      [MAP_W, MAP_H],
    ])
  const path = geoPath(projection)

  const shapes: Shape[] = []
  const labels: Record<string, { x: number; y: number; area: number }> = {}

  for (const f of fc.features) {
    const raw = f.properties?.name ?? ''
    const point = findPoint(NAME_ALIAS[raw] ?? raw)
    const d = path(f)
    if (!d) continue
    shapes.push({ country: point ? point.name : null, d })

    if (!point) continue
    // 숫자 배지 자리 — 프랑스의 해외령처럼 멀리 떨어진 덩어리에 끌려가지 않도록 가장 큰 덩어리만 본다
    const polys: Polygon['coordinates'][] =
      f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates
        : f.geometry.type === 'Polygon'
          ? [f.geometry.coordinates]
          : []
    let best: Feature<Polygon> | null = null
    let bestArea = -1
    for (const coordinates of polys) {
      const g: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } }
      const a = geoArea(g)
      if (a > bestArea) {
        bestArea = a
        best = g
      }
    }
    if (!best) continue
    const [x, y] = path.centroid(best)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const cur = labels[point.name]
    if (!cur || bestArea > cur.area) labels[point.name] = { x, y, area: bestArea }
  }

  const outLabels: EuropeMap['labels'] = {}
  for (const [k, v] of Object.entries(labels)) outLabels[k] = { x: v.x, y: v.y }
  return { shapes, labels: outLabels }
}
