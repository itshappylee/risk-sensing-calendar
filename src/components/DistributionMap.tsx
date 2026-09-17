import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { GROUP_META, GROUP_OF, severityBand, severityLabel, type TypeGroup } from '../lib/eventMeta'
import { makeT } from '../lib/i18n'
import { COUNTRY_POINTS, findPoint } from '../lib/geo'

interface Props {
  lang: Lang
  events: RiskEvent[]
  selectedCountry: string | null
  onPickCountry: (c: string | null) => void
}

interface Cell {
  count: number
  max: number
  groups: Set<TypeGroup>
}

/**
 * 지도 분포도 — **타일 그리드 맵**.
 *
 * 각 국가를 같은 크기 타일로 놓되 지리적 배치에 맞춘다.
 *
 * 왜 실제 지도(면적)가 아닌가: [[business-rules]]는 severity를 **국가 규모와 무관하게**
 * 판정한다 — "파업은 인원수가 아니라 부문으로 판정한다. 항만 크레인 기사 50명이
 * 항구 전체를 멈출 수 있다." 면적으로 그리면 룩셈부르크·몰타의 severity 5가
 * 독일의 severity 1보다 작아 보여 **판정 원칙과 반대되는 인상**을 준다.
 * 타일은 모든 국가에 같은 시각적 무게를 준다.
 *
 * 부수 효과: 국경 데이터가 필요 없어 **지어낸 지리 정보가 하나도 없다.**
 * 배치가 실제 지리와 어긋나지 않는지는 `lat`/`lon`으로 회귀 테스트가 검증한다.
 */
export function DistributionMap({ lang, events, selectedCountry, onPickCountry }: Props) {
  const t = makeT(lang)

  const { cells, unmapped, rows, cols } = useMemo(() => {
    const map = new Map<string, Cell>()
    const missing = new Set<string>()

    for (const e of events) {
      const p = findPoint(e.country)
      if (!p) {
        missing.add(e.country)
        continue
      }
      const cur = map.get(p.code) ?? { count: 0, max: 0, groups: new Set<TypeGroup>() }
      cur.count++
      cur.max = Math.max(cur.max, e.severity)
      cur.groups.add(GROUP_OF[e.event_type])
      map.set(p.code, cur)
    }

    return {
      cells: map,
      unmapped: [...missing],
      rows: Math.max(...COUNTRY_POINTS.map((p) => p.row)) + 1,
      cols: Math.max(...COUNTRY_POINTS.map((p) => p.col)) + 1,
    }
  }, [events])

  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  } as CSSProperties

  return (
    <div className="tmap">
      <div className="tmap-layout">
        {/* 좌측 20% — 색과 숫자가 무슨 뜻인지. 지도만 있으면 숫자 3이 '3건'인지 '3점'인지 알 수 없다 */}
        <aside className="tmap-guide" aria-label={t('mapGuideTitle')}>
          <h3 className="tmap-guide-title">{t('mapGuideTitle')}</h3>

          <p className="tmap-guide-h">{t('mapGuideColor')}</p>
          <ul className="tmap-guide-list">
            <li className="sev-key sev-low">
              <span className="sev-key-dot" />
              {t('mapGuideLow')}
            </li>
            <li className="sev-key sev-mid">
              <span className="sev-key-dot" />
              {t('mapGuideMid')}
            </li>
            <li className="sev-key sev-high">
              <span className="sev-key-dot" />
              {t('mapGuideHigh')}
            </li>
            <li className="sev-key sev-none">
              <span className="sev-key-dot" />
              {t('mapGuideNone')}
            </li>
          </ul>

          <p className="tmap-guide-h">{t('mapGuideNumber')}</p>
          <p className="tmap-guide-desc">{t('mapGuideNumberDesc')}</p>

          {unmapped.length > 0 && (
            <p className="dm-unmapped">
              ⚠️ {t('mapUnmapped')}: {unmapped.join(', ')}
            </p>
          )}
        </aside>

        <div className="tmap-main">
          <div className="tmap-grid" style={gridStyle} role="group" aria-label={t('viewMap')}>
        {COUNTRY_POINTS.map((p) => {
          const c = cells.get(p.code)
          const band = c ? severityBand(c.max) : null
          const on = selectedCountry === p.name
          const style = { gridRow: p.row + 1, gridColumn: p.col + 1 } as CSSProperties

          return (
            <button
              key={p.code}
              className={[
                'tile',
                band ? `sev-${band}` : 'quiet',
                on ? 'on' : '',
                c ? '' : 'empty',
              ]
                .filter(Boolean)
                .join(' ')}
              style={style}
              onClick={() => onPickCountry(on ? null : p.name)}
              aria-pressed={on}
              title={
                c
                  ? `${p.name} · ${c.count} · ${severityLabel(c.max, lang)}`
                  : `${p.name} · ${t('noEvents')}`
              }
              aria-label={
                c
                  ? `${p.name}, ${c.count}, ${severityLabel(c.max, lang)}`
                  : `${p.name}, ${t('noEvents')}`
              }
            >
              <span className="tile-code">{p.code}</span>
              {c && <span className="tile-n">{c.count}</span>}
              {c && (
                <span className="tile-types" aria-hidden="true">
                  {[...c.groups].slice(0, 3).map((g) => (
                    <i key={g}>{GROUP_META[g]?.icon}</i>
                  ))}
                </span>
              )}
            </button>
          )
        })}
          </div>
        </div>
      </div>
    </div>
  )
}
