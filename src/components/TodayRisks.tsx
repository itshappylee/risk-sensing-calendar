import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { TYPE_META, severityBand, severityLabel } from '../lib/eventMeta'
import { makeT, pickText } from '../lib/i18n'
import { eventsOnDay } from '../lib/calendar'

interface Props {
  lang: Lang
  /** 필터가 모두 적용된 목록. 오늘 날짜에 걸린 것만 여기서 고른다 */
  events: RiskEvent[]
  onPickCountry: (country: string | null) => void
}

/**
 * 지도 왼쪽 아래 "오늘의 위험".
 * 예전에는 설명문 아래가 빈 여백이었다 — 지도를 열자마자 '오늘 무엇이 걸려 있는지'가 보이게 채웠다.
 * 위험한 것부터 정렬하고, 누르면 그 국가로 지도·상세가 걸러진다.
 */
export function TodayRisks({ lang, events, onPickCountry }: Props) {
  const t = makeT(lang)

  const today = useMemo(() => {
    // eventsOnDay는 자정 기준으로 비교한다 — 시각이 섞인 Date를 넘기면 마지막 날 오후에 빠진다
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    return [...eventsOnDay(events, midnight)].sort(
      (a, b) => b.severity - a.severity || a.country.localeCompare(b.country),
    )
  }, [events])

  return (
    <section className="today-risks" aria-label={t('mapTodayTitle')}>
      <h3 className="tmap-guide-title">
        {t('mapTodayTitle')}
        {today.length > 0 && <span className="cdl-n">{today.length}</span>}
      </h3>

      {today.length === 0 ? (
        <p className="tmap-guide-desc">{t('mapTodayEmpty')}</p>
      ) : (
        <ul className="today-list">
          {today.map((e) => {
            const meta = TYPE_META[e.event_type]
            const band = severityBand(e.severity)
            const style = {
              '--bar-fg': `var(--ev-${meta.key})`,
              '--bar-bg': `var(--ev-${meta.key}-bg)`,
            } as CSSProperties
            return (
              <li key={e.event_id}>
                <button
                  className="today-item"
                  style={style}
                  onClick={() => onPickCountry(e.country)}
                  title={severityLabel(e.severity, lang)}
                >
                  <span className={`rl-sev sev-${band}`}>{e.severity}</span>
                  <span className="today-main">
                    <span className="today-top">
                      <span aria-hidden="true">{meta.icon}</span> <b>{e.country}</b>
                    </span>
                    <span className="today-name">{pickText(lang, e.event_name_en, e.event_name)}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
