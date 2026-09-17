import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { FILTER_GROUPS, GROUP_META, GROUP_OF, type TypeGroup } from '../lib/eventMeta'
import { makeT } from '../lib/i18n'

interface Props {
  lang: Lang
  /** 국가 필터까지만 적용된 목록 — 유형 필터를 걸기 전 기준으로 건수를 센다 */
  events: RiskEvent[]
  selected: Set<TypeGroup>
  onToggle: (g: TypeGroup) => void
}

/**
 * 유형 필터 겸 범례.
 *
 * 전에는 범례(하단, 읽기 전용)와 필터(툴바, 국가만)가 따로였다.
 * 사용자가 *"필터에 Legend도 추가"*를 요청해 **하나로 합쳤다** (2026-08-26) —
 * 색을 설명하는 일과 그 색으로 거르는 일은 같은 자리에 있는 편이 낫다.
 *
 * 색은 캘린더 슬롯과 **같은 `--ev-*` 토큰**을 쓴다. 예전에는 범례가 유형색,
 * 캘린더가 severity색이라 두 체계가 어긋나 있었다 (→ DEC-019).
 */
export function TypeFilter({ lang, events, selected, onToggle }: Props) {
  const t = makeT(lang)

  const counts = new Map<TypeGroup, number>()
  for (const e of events) {
    if (e.severity <= 0) continue
    const g = GROUP_OF[e.event_type]
    if (!g) continue
    counts.set(g, (counts.get(g) ?? 0) + 1)
  }

  const noneSelected = selected.size === 0

  return (
    <div className="type-filter" role="group" aria-label={t('filterByType')}>
      {FILTER_GROUPS.map((g) => {
        const meta = GROUP_META[g]
        const n = counts.get(g) ?? 0
        // 아무것도 안 고르면 전부 보는 상태 — 그때는 전부 켜진 것처럼 보여야 헷갈리지 않는다
        const on = noneSelected || selected.has(g)
        const style = {
          '--tf-fg': `var(--ev-${meta.key})`,
          '--tf-bg': `var(--ev-${meta.key}-bg)`,
          '--tf-bd': `var(--ev-${meta.key}-bd)`,
        } as CSSProperties

        return (
          <button
            key={g}
            className={`tf-chip${on ? ' on' : ''}${n === 0 ? ' empty' : ''}`}
            style={style}
            aria-pressed={selected.has(g)}
            onClick={() => onToggle(g)}
            title={n === 0 ? t('noEvents') : undefined}
          >
            <span className="tf-dot" aria-hidden="true" />
            <span className="tf-ico" aria-hidden="true">
              {meta.icon}
            </span>
            <span className="tf-label">{meta.label[lang]}</span>
            <span className="tf-n">{n}</span>
          </button>
        )
      })}
    </div>
  )
}
