import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { TYPE_META, severityBand } from '../lib/eventMeta'
import { makeT, timeAgo, timeRange, transportLabel, pickText } from '../lib/i18n'
import { parseISODate } from '../lib/calendar'

interface Props {
  events: RiskEvent[]
  lang: Lang
}

type Bucket = 'now' | 'soon' | 'later' | 'past'

/**
 * 임박순 — 전체 폭 테이블.
 *
 * 근거: wiki/spec/workflows.md WF-3 리포트 구성이 "이번 주 — 심각도 정렬 / 다음 주 미리보기"였다.
 * 실제로 사람에게 값을 전달해온 유일한 산출물의 구조가 격자가 아니라 정렬된 목록이었다.
 *
 * `transport_mode` 열: events 필수 필드인데 지금까지 화면 어디에도 없었다.
 * 물류에서 도로/철도/항공/해상 구분은 판단에 직접 쓰이므로 열로 꺼냈다.
 *
 * `시간` 열: 운행금지는 몇 시부터 몇 시까지인지가 곧 판단이다(business-rules §4).
 * 날짜만 보이면 "오전에 통과하면 되는 건인지"를 알 수 없어 열을 더했다.
 * 나머지 유형은 대부분 종일이라 회색으로 낮춰 표시한다. (→ 2026-09-09 사용자 요청)
 */
export function RiskList({ events, lang }: Props) {
  const t = makeT(lang)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const bucketOf = (e: RiskEvent): Bucket => {
    const s = parseISODate(e.date_start)
    const en = parseISODate(e.date_end)
    if (en < today) return 'past'
    if (s <= today) return 'now'
    return Math.round((s.getTime() - today.getTime()) / 86400000) <= 3 ? 'soon' : 'later'
  }

  const groups: { key: Bucket; label: string; items: RiskEvent[] }[] = [
    { key: 'now', label: lang === 'ko' ? '지금 진행 중' : 'In progress', items: [] },
    { key: 'soon', label: lang === 'ko' ? '3일 내' : 'Within 3 days', items: [] },
    { key: 'later', label: lang === 'ko' ? '예정' : 'Upcoming', items: [] },
    { key: 'past', label: lang === 'ko' ? '지남' : 'Past', items: [] },
  ]

  for (const e of events) {
    if (e.severity <= 0) continue
    groups.find((g) => g.key === bucketOf(e))?.items.push(e)
  }
  for (const g of groups) {
    g.items.sort((a, b) => b.severity - a.severity || a.date_start.localeCompare(b.date_start))
  }

  const visible = groups.filter((g) => g.items.length > 0)
  if (visible.length === 0) return <div className="detail-empty">{t('noEvents')}</div>

  return (
    <div className="risk-list">
      <div className="rl-colhead" aria-hidden="true">
        <span />
        <span>{lang === 'ko' ? '국가' : 'Country'}</span>
        <span>{lang === 'ko' ? '유형' : 'Type'}</span>
        <span>{t('colEvent')}</span>
        <span>{t('colMode')}</span>
        <span>{t('colPeriod')}</span>
        <span>{t('colTime')}</span>
        <span className="rl-gap" />
        <span>{t('colUpdated')}</span>
      </div>

      {visible.map((g) => (
        <section key={g.key} className={`rl-group rl-${g.key}`}>
          <h3 className="rl-head">
            {g.label} <span className="rl-count">{g.items.length}</span>
          </h3>

          {g.items.map((e) => {
            const meta = TYPE_META[e.event_type]
            const band = severityBand(e.severity)
            const style = {
              '--bar-fg': `var(--ev-${meta.key})`,
              '--bar-bg': `var(--ev-${meta.key}-bg)`,
              '--row-accent': `var(--sev-${band})`,
            } as CSSProperties
            const period =
              e.date_start === e.date_end ? e.date_start : `${e.date_start} → ${e.date_end}`
            const time = timeRange(e, lang)

            return (
              <div key={e.event_id} className={`rl-row sev-${band}`} style={style} tabIndex={0}>
                <span className={`rl-sev sev-${band}`}>{e.severity}</span>
                <span className="rl-country">{e.country}</span>
                <span className="rl-type chip type">
                  {meta.icon} {meta.label[lang]}
                </span>
                <span className="rl-name">
                  {pickText(lang, e.event_name_en, e.event_name)}
                  {e.verified !== 'yes' && <em className="rl-flag">{t('unverified')}</em>}
                </span>
                <span className="rl-mode">{transportLabel(e.transport_mode, lang)}</span>
                <span className="rl-period">{period}</span>
                <span className={`rl-time${time.allDay ? ' quiet' : ''}`}>
                  {time.span}
                  {time.duration && <em className="rl-dur">({time.duration})</em>}
                </span>
                <span className="rl-gap" />
                <span className="rl-updated">{timeAgo(e.upd_dtm, lang)}</span>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
