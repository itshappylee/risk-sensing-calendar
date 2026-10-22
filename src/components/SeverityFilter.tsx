import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import {
  SEVERITY_BANDS,
  SEVERITY_NAME,
  SEVERITY_RANGE,
  severityBand,
  type SeverityBand,
} from '../lib/eventMeta'
import { makeT } from '../lib/i18n'

interface Props {
  lang: Lang
  /** 국가·유형 필터까지 적용된 목록 — 위험도 필터를 걸기 전 기준으로 건수를 센다 */
  events: RiskEvent[]
  selected: Set<SeverityBand>
  onToggle: (b: SeverityBand) => void
}

/**
 * 위험도 필터 — 낮음(1–2) / 보통(3) / 높음(4–5).
 *
 * 경계는 지도 범례와 같은 `severityBand()`를 쓴다. 필터와 범례가 서로 다른 기준을 쓰면
 * "빨강만 보기"를 눌렀는데 4점이 아닌 건이 남거나 그 반대가 생긴다 (→ 사용자 결정 2026-10-22).
 * 모양은 유형 필터(TypeFilter)와 같다 — 아무것도 안 고르면 전체를 본다.
 */
export function SeverityFilter({ lang, events, selected, onToggle }: Props) {
  const t = makeT(lang)

  const counts = new Map<SeverityBand, number>()
  for (const e of events) {
    if (e.severity <= 0) continue
    const b = severityBand(e.severity)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }

  const noneSelected = selected.size === 0

  return (
    <div className="type-filter sev-filter" role="group" aria-label={t('filterBySeverity')}>
      <span className="sev-filter-cap">{t('severityFilterLabel')}</span>
      {SEVERITY_BANDS.map((b) => {
        const n = counts.get(b) ?? 0
        const on = noneSelected || selected.has(b)
        const style = {
          '--tf-fg': `var(--sev-${b})`,
          '--tf-bg': `var(--sev-${b}-bg)`,
          '--tf-bd': `var(--sev-${b}-bd)`,
        } as CSSProperties

        return (
          <button
            key={b}
            className={`tf-chip${on ? ' on' : ''}${n === 0 ? ' empty' : ''}`}
            style={style}
            aria-pressed={selected.has(b)}
            onClick={() => onToggle(b)}
            title={`${SEVERITY_NAME[b][lang]} (${SEVERITY_RANGE[b]})`}
          >
            <span className="tf-dot" aria-hidden="true" />
            <span className="tf-label">{SEVERITY_RANGE[b]}</span>
            <span className="tf-n">{n}</span>
          </button>
        )
      })}
    </div>
  )
}
