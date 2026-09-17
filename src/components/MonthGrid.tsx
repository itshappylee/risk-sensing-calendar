import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { GROUP_META, GROUP_OF, SLOT_GROUPS, severityBand, type TypeGroup } from '../lib/eventMeta'
import { WEEKDAYS } from '../lib/i18n'
import { buildMonthWeeks, eventsOnDay, isSameDay, toISODate } from '../lib/calendar'

interface Props {
  year: number
  month: number
  events: RiskEvent[]
  selected: Date | null
  lang: Lang
  onSelect: (d: Date) => void
}

/**
 * 셀 슬롯은 `SLOT_GROUPS`(운전금지 → 기상 → 파업·사고) **순서 고정**.
 * 매일 같은 자리에 같은 유형이 있어야 눈이 위치를 학습한다(신호등과 같은 이유).
 *
 * 공휴일은 슬롯이 아니다 — business-rules가 "공휴일 자체는 위험이 아니고 그날 걸리는
 * 운행금지가 위험"이라 규정하고 기본 1점이므로, 44~50개국이 겹쳐도 조용해야 한다.
 * → 칩 대신 날짜 칸 상단 띠 + 작은 배지로 강등했다.
 *
 * 색은 **유형 그룹**을 따른다 (범례·필터와 같은 토큰). severity는 슬롯 왼쪽 얇은 띠로 남겼다 —
 * 예전에는 칠 자체가 severity였는데, 범례와 색 체계가 어긋나 혼선이 있었다 (→ DEC-019).
 */

interface Bucket {
  group: TypeGroup
  count: number
  maxSeverity: number
}

function bucketize(dayEvents: RiskEvent[]): { slots: Bucket[]; holidays: RiskEvent[] } {
  const map = new Map<TypeGroup, Bucket>()
  const holidays: RiskEvent[] = []

  for (const e of dayEvents) {
    const g = GROUP_OF[e.event_type]
    if (g === 'holiday') {
      holidays.push(e)
      continue
    }
    const b = map.get(g) ?? { group: g, count: 0, maxSeverity: 0 }
    b.count++
    b.maxSeverity = Math.max(b.maxSeverity, e.severity)
    map.set(g, b)
  }

  // 슬롯 순서를 항상 고정한다 — 있는 것만 순서대로
  return { slots: SLOT_GROUPS.filter((g) => map.has(g)).map((g) => map.get(g)!), holidays }
}

export function MonthGrid({ year, month, events, selected, lang, onSelect }: Props) {
  const weeks = buildMonthWeeks(year, month)
  const today = new Date()

  return (
    <div className="cal-grid">
      <div className="weekday-row">
        {WEEKDAYS[lang].map((w, i) => (
          <div key={w} className={`weekday${i >= 5 ? ' weekend' : ''}`}>
            {w}
          </div>
        ))}
      </div>

      {weeks.map((days) => (
        <div className="week" key={toISODate(days[0])}>
          {days.map((d) => {
            const dayEvents = eventsOnDay(events, d)
            const { slots, holidays } = bucketize(dayEvents)
            const outside = d.getMonth() !== month
            const isToday = isSameDay(d, today)
            const isSelected = selected !== null && isSameDay(d, selected)

            return (
              <button
                key={toISODate(d)}
                className={[
                  'day-cell',
                  outside ? 'outside' : '',
                  isToday ? 'today' : '',
                  isSelected ? 'selected' : '',
                  holidays.length ? 'has-holiday' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelect(d)}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                aria-label={
                  lang === 'ko'
                    ? `${d.getMonth() + 1}월 ${d.getDate()}일, ${
                        dayEvents.length ? `이벤트 ${dayEvents.length}건` : '이벤트 없음'
                      }`
                    : `${toISODate(d)}, ${dayEvents.length} events`
                }
              >
                <span className="day-top">
                  <span className="day-num">{d.getDate()}</span>
                  {holidays.length > 0 && (
                    <span className="day-holiday" title={holidays.map((h) => h.country).join(', ')}>
                      🏛 {holidays.length}
                    </span>
                  )}
                </span>

                {/* 유형 슬롯 — 칠=유형(범례와 같은 색), 왼쪽 띠=severity. 높이는 항상 3칸분 고정 */}
                <span className="slots">
                  {slots.map((b) => {
                    const meta = GROUP_META[b.group]
                    const band = severityBand(b.maxSeverity)
                    const style = {
                      '--slot-fg': `var(--ev-${meta.key})`,
                      '--slot-bg': `var(--ev-${meta.key}-bg)`,
                      '--slot-bd': `var(--ev-${meta.key}-bd)`,
                      '--slot-sev': `var(--sev-${band})`,
                    } as CSSProperties
                    return (
                      <span key={b.group} className="slot" style={style}>
                        <span className="slot-icon" aria-hidden="true">
                          {meta.icon}
                        </span>
                        <span className="slot-label">{meta.label[lang]}</span>
                        <span className="slot-count">{b.count}</span>
                      </span>
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
