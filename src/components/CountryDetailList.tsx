import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { TYPE_META, severityBand, severityLabel } from '../lib/eventMeta'
import { makeT, timeAgo, pickText } from '../lib/i18n'
import { isActiveRisk } from '../lib/changes'

interface Props {
  lang: Lang
  events: RiskEvent[]
  /** 로그인한 관리자만 제외할 수 있다. null이면 버튼을 감춘다 */
  onExclude?: ((eventId: string) => void) | null
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * 분포도 아래에 붙는 **국가별 상세 목록**.
 *
 * 타일은 "어디가 몇 건, 얼마나 심각한가"까지만 답한다. 무슨 일이 왜 그 점수인지는
 * 타일 안에 넣을 수 없어서, 캘린더의 날짜별 상세 카드와 같은 카드를 국가별로 다시 세운다.
 * 카드 구성은 DayDetail과 일부러 똑같이 맞췄다 — 두 화면에서 같은 것을 다르게 읽으면 안 된다.
 *
 * 정렬은 위험도 우선이다. 심각한 나라를 스크롤로 찾게 하지 않는다.
 */
export function CountryDetailList({ lang, events, onExclude }: Props) {
  const t = makeT(lang)

  const groups = useMemo(() => {
    const byCountry = new Map<string, RiskEvent[]>()
    for (const e of events) {
      if (!isActiveRisk(e)) continue
      const list = byCountry.get(e.country)
      if (list) list.push(e)
      else byCountry.set(e.country, [e])
    }

    return [...byCountry.entries()]
      .map(([country, items]) => ({
        country,
        items: items.sort(
          (a, b) => b.severity - a.severity || a.date_start.localeCompare(b.date_start),
        ),
        max: items.reduce((n, e) => Math.max(n, e.severity), 0),
      }))
      .sort((a, b) => b.max - a.max || b.items.length - a.items.length || a.country.localeCompare(b.country))
  }, [events])

  if (groups.length === 0) {
    return <div className="detail-empty">{t('noEvents')}</div>
  }

  return (
    <section className="cdl" aria-label={t('byCountryTitle')}>
      <h3 className="cdl-title">{t('byCountryTitle')}</h3>

      <div className="cdl-groups">
        {groups.map(({ country, items, max }) => (
          <section className="cdl-group" key={country}>
            <h4 className="cdl-head">
              <span className={`rl-sev sev-${severityBand(max)}`}>{max}</span>
              <strong className="cdl-country">{country}</strong>
              <span className="cdl-n">{items.length}</span>
            </h4>

            {items.map((e) => {
              const meta = TYPE_META[e.event_type]
              const band = severityBand(e.severity)
              const period = e.date_start === e.date_end ? e.date_start : `${e.date_start} → ${e.date_end}`
              const time =
                e.time_start && e.time_end
                  ? `${e.time_start.slice(0, 5)}–${e.time_end.slice(0, 5)}`
                  : t('allDay')
              const style = {
                '--bar-fg': `var(--ev-${meta.key})`,
                '--bar-bg': `var(--ev-${meta.key}-bg)`,
              } as CSSProperties

              return (
                <article className="detail-card" key={e.event_id} style={style}>
                  <div className="detail-card-top">
                    <span className={`rl-sev sev-${band}`}>{e.severity}</span>
                    <span className="chip type">
                      {meta.icon} {meta.label[lang]}
                    </span>
                    <span className="dt-region">{e.region ? e.region : t('nationwide')}</span>
                    {e.status === 'updated' && <span className="chip st-updated">{t('statusUpdated')}</span>}
                    {e.verified !== 'yes' && <span className="chip status-unverified">{t('unverified')}</span>}
                  </div>

                  <p className="detail-name">{pickText(lang, e.event_name_en, e.event_name)}</p>
                  <p className="detail-meta">
                    {period} · {time} · {severityLabel(e.severity, lang)}
                  </p>

                  <p className="detail-summary">{pickText(lang, e.summary_en, e.summary)}</p>
                  {e.severity_reason && (
                    <p className="detail-reason">{pickText(lang, e.severity_reason_en, e.severity_reason)}</p>
                  )}

                  <div className="detail-source">
                    <span>{t('source')}:</span>
                    <a href={e.source_url} target="_blank" rel="noreferrer">
                      {hostOf(e.source_url)}
                    </a>
                    <span>· {timeAgo(e.upd_dtm, lang)}</span>
                    {onExclude && (
                      <button
                        className="btn tiny dt-exclude"
                        title={t('excludeHint')}
                        onClick={() => onExclude(e.event_id)}
                      >
                        {t('exclude')}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </section>
        ))}
      </div>
    </section>
  )
}
