import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { severityBand, severityLabel, type SeverityBand } from '../lib/eventMeta'
import { makeT } from '../lib/i18n'
import { findPoint } from '../lib/geo'
import { MAP_H, MAP_W, loadEuropeMap, type EuropeMap } from '../lib/europeMap'

interface Props {
  lang: Lang
  /** 유형·위험도 필터까지 적용한 목록. **국가 필터는 적용하지 않은 것**을 넘겨야 한다 —
   *  국가를 눌렀을 때 다른 나라가 회색으로 바뀌면 비교가 안 된다 */
  events: RiskEvent[]
  selectedCountry: string | null
  onPickCountry: (c: string | null) => void
}

interface Cell {
  count: number
  max: number
}

const MIN_ZOOM = 1
const MAX_ZOOM = 6

/**
 * 분포도 — **실제 유럽 지도**.
 *
 * 전에는 국가를 같은 크기 타일로 놓은 타일 그리드였다. 면적이 판정에 영향을 주는 것처럼
 * 보이지 않게 하려는 의도였지만, 담당자에게는 '어디가 어디인지' 바로 읽히는 실제 지도가 낫다는
 * 요청이 있었다 (→ 사용자 요청 2026-10-22).
 *
 * 면적 문제는 이렇게 푼다: 색은 **그 나라의 최고 위험도**, 숫자는 **건수**이고, 둘 다 면적과 무관하다.
 * 몰타·룩셈부르크처럼 지도에서 점만 한 나라도 숫자 배지가 같은 크기로 붙으므로 작게 보이지 않는다.
 * 지도 모양은 `world-atlas`(Natural Earth)이며 화면에 그리는 용도뿐이다 (→ lib/europeMap.ts).
 */
export function DistributionMap({ lang, events, selectedCountry, onPickCountry }: Props) {
  const t = makeT(lang)

  const [map, setMap] = useState<EuropeMap | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let off = false
    loadEuropeMap()
      .then((m) => {
        if (!off) setMap(m)
      })
      .catch(() => {
        if (!off) setFailed(true)
      })
    return () => {
      off = true
    }
  }, [])

  const { cells, unmapped } = useMemo(() => {
    const m = new Map<string, Cell>()
    const missing = new Set<string>()
    for (const e of events) {
      const p = findPoint(e.country)
      if (!p) {
        missing.add(e.country)
        continue
      }
      const cur = m.get(p.name) ?? { count: 0, max: 0 }
      cur.count++
      cur.max = Math.max(cur.max, e.severity)
      m.set(p.name, cur)
    }
    return { cells: m, unmapped: [...missing] }
  }, [events])

  // --- 확대·이동 ---------------------------------------------------------
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const clamp = (k: number, x: number, y: number) => {
    // 지도가 화면 밖으로 완전히 사라지지 않게 가장자리를 묶는다
    const minX = MAP_W - MAP_W * k
    const minY = MAP_H - MAP_H * k
    return { k, x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) }
  }

  const zoomBy = (factor: number) =>
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
      // 화면 중앙을 고정한 채 확대한다
      const cx = MAP_W / 2
      const cy = MAP_H / 2
      const x = cx - ((cx - v.x) / v.k) * k
      const y = cy - ((cy - v.y) / v.k) * k
      return clamp(k, x, y)
    })

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, vx: view.x, vy: view.y, moved: false }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const svg = svgRef.current
    if (!d || !svg) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    // 화면 픽셀 → 지도 좌표
    const scale = MAP_W / svg.getBoundingClientRect().width
    setView((v) => clamp(v.k, d.vx + dx * scale, d.vy + dy * scale))
  }
  const endDrag = () => {
    // click은 pointerup 뒤에 오므로 바로 지우지 않는다 — 끌었으면 클릭으로 치지 않기 위해
    window.setTimeout(() => {
      drag.current = null
    }, 0)
  }
  const pick = (name: string, on: boolean) => {
    if (drag.current?.moved) return
    onPickCountry(on ? null : name)
  }
  const onKey = (e: KeyboardEvent<SVGPathElement>, name: string, on: boolean) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onPickCountry(on ? null : name)
    }
  }

  const bandOf = (name: string): SeverityBand | null => {
    const c = cells.get(name)
    return c ? severityBand(c.max) : null
  }

  // 그리는 순서: 배경 → 감시 국가 → 선택한 국가(테두리가 이웃에 가려지지 않도록 맨 위)
  const ordered = useMemo(() => {
    if (!map) return []
    const rank = (c: string | null) => (c === null ? 0 : c === selectedCountry ? 2 : 1)
    return [...map.shapes].sort((a, b) => rank(a.country) - rank(b.country))
  }, [map, selectedCountry])

  return (
    <div className="tmap">
      <div className="emap">
        {!map && !failed && <div className="emap-state">{t('mapLoading')}</div>}
        {failed && <div className="emap-state error">{t('mapLoadFailed')}</div>}

        {map && (
          <>
            <svg
              ref={svgRef}
              className="emap-svg"
              viewBox={`0 0 ${MAP_W} ${MAP_H}`}
              role="group"
              aria-label={t('viewMap')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {ordered.map((s, i) => {
                  if (s.country === null) return <path key={i} className="geo ctx" d={s.d} />
                  const band = bandOf(s.country)
                  const on = selectedCountry === s.country
                  const c = cells.get(s.country)
                  const label = c
                    ? `${s.country} · ${c.count} · ${severityLabel(c.max, lang)}`
                    : `${s.country} · ${t('noEvents')}`
                  return (
                    <path
                      key={i}
                      className={['geo', band ? `sev-${band}` : 'quiet', on ? 'on' : ''].filter(Boolean).join(' ')}
                      d={s.d}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      aria-label={label}
                      vectorEffect="non-scaling-stroke"
                      onClick={() => pick(s.country!, on)}
                      onKeyDown={(e) => onKey(e, s.country!, on)}
                    >
                      <title>{label}</title>
                    </path>
                  )
                })}

                {/* 건수 배지 — 지도에서 점만 한 나라도 같은 크기로 보이게 한다 */}
                {[...cells.entries()].map(([name, c]) => {
                  const pos = map.labels[name]
                  if (!pos) return null
                  const r = 11 / view.k
                  return (
                    <g
                      key={name}
                      className={`geo-badge sev-${severityBand(c.max)}`}
                      transform={`translate(${pos.x} ${pos.y})`}
                      onClick={() => pick(name, selectedCountry === name)}
                    >
                      <circle r={r} />
                      <text fontSize={11 / view.k} dy="0.35em" textAnchor="middle">
                        {c.count}
                      </text>
                    </g>
                  )
                })}
              </g>
            </svg>

            <div className="emap-zoom" role="group">
              <button onClick={() => zoomBy(1.5)} aria-label={t('mapZoomIn')} title={t('mapZoomIn')}>
                +
              </button>
              <button onClick={() => zoomBy(1 / 1.5)} aria-label={t('mapZoomOut')} title={t('mapZoomOut')}>
                −
              </button>
              <button
                onClick={() => setView({ k: 1, x: 0, y: 0 })}
                aria-label={t('mapZoomReset')}
                title={t('mapZoomReset')}
              >
                ↺
              </button>
            </div>
          </>
        )}
      </div>

      {unmapped.length > 0 && (
        <p className="dm-unmapped">
          ⚠️ {t('mapUnmapped')}: {unmapped.join(', ')}
        </p>
      )}
    </div>
  )
}
