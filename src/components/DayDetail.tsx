import type { CSSProperties } from 'react'
import type { EventType, Lang, RiskEvent } from '../lib/types'
import { EVENT_TYPES, TYPE_META, severityBand, severityLabel } from '../lib/eventMeta'
import { makeT, timeAgo, pickText } from '../lib/i18n'
import { isActiveRisk, runLength } from '../lib/changes'

interface Props {
  lang: Lang
  date: Date | null
  events: RiskEvent[]
  /**
   * 잘못 올라온 건을 여기서 바로 내릴 수 있게 한다 (→ 사용자 지적 2026-08-28).
   * 관리자 표에도 제외 버튼이 있지만 그 표는 이 달 상위 12건만 보여줘서,
   * 낮은 점수로 잘못 들어온 건은 **찾을 수가 없다.** 잘못을 발견하는 자리는 캘린더다.
   * 로그인하지 않았으면 null — 버튼을 그리지 않는다.
   */
  onExclude?: ((eventId: string) => void) | null
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    console.warn('[components/DayDetail.hostOf] source_url이 URL 형식이 아님', { url })
    return url
  }
}

/**
 * 선택한 날짜의 상세 — **유형별로 묶고 그 안에 국가 리스트**.
 *
 * 캘린더 셀은 유형 단위로만 집계해서 보여주므로(44~50개국이면 국가별 표시가 불가능),
 * "어느 나라인가"는 여기서 답한다.
 */
export function DayDetail({ lang, date, events, onExclude }: Props) {
  const t = makeT(lang)

  if (!date) {
    return (
      <div className="panel detail">
        <div className="detail-empty">{t('selectDate')}</div>
      </div>
    )
  }

  const label =
    lang === 'ko'
      ? `${date.getMonth() + 1}월 ${date.getDate()}일`
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  // WF-3 규칙: 취소된 이벤트는 본문에서 빼되 **별도 표시**한다
  const active = events.filter(isActiveRisk)
  const cancelled = events.filter((e) => e.status === 'cancelled')

  // 유형 순서는 캘린더 슬롯과 동일하게 고정
  const groups = EVENT_TYPES.map((type: EventType) => ({
    type,
    items: active
      .filter((e) => e.event_type === type)
      .sort((a, b) => b.severity - a.severity || a.country.localeCompare(b.country)),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="panel detail">
      <div className="detail-head">
        <span className="detail-date">{label}</span>
        <span className="detail-count">
          {events.length > 0 ? `${events.length}${lang === 'ko' ? '' : ' '}${t('eventsOn')}` : ''}
        </span>
      </div>

      {groups.length === 0 && cancelled.length === 0 ? (
        <div className="detail-empty">{t('noEvents')}</div>
      ) : (
        <div className="detail-list">
          {groups.map(({ type, items }) => {
            const meta = TYPE_META[type]
            const style = {
              '--bar-fg': `var(--ev-${meta.key})`,
              '--bar-bg': `var(--ev-${meta.key}-bg)`,
            } as CSSProperties

            return (
              <section className="dt-group" key={type} style={style}>
                <h4 className="dt-group-head">
                  <span className="chip type">
                    {meta.icon} {meta.label[lang]}
                  </span>
                  <span className="dt-group-n">{items.length}</span>
                </h4>

                {items.map((e) => {
                  const band = severityBand(e.severity)
                  const run = runLength(e, date)
                  const period =
                    e.date_start === e.date_end
                      ? e.date_start
                      : `${e.date_start} → ${e.date_end}`
                  const time =
                    e.time_start && e.time_end
                      ? `${e.time_start.slice(0, 5)}–${e.time_end.slice(0, 5)}`
                      : t('allDay')

                  return (
                    <article className="detail-card" key={e.event_id}>
                      <div className="detail-card-top">
                        <span className={`rl-sev sev-${band}`}>{e.severity}</span>
                        <strong className="dt-country">{e.country}</strong>
                        <span className="dt-region">
                          {e.region ? e.region : t('nationwide')}
                        </span>
                        {e.status === 'updated' && (
                          <span className="chip st-updated">{t('statusUpdated')}</span>
                        )}
                        {e.verified !== 'yes' && (
                          <span className="chip status-unverified">{t('unverified')}</span>
                        )}
                      </div>

                      <p className="detail-name">{pickText(lang, e.event_name_en, e.event_name)}</p>
                      <p className="detail-meta">
                        {period} · {time} · {severityLabel(e.severity, lang)}
                      </p>

                      {/* 연속 구간 — business-rules가 "진짜 문제"라 규정한 지점.
                          2일 이상 연속이면 severity가 +1 되므로 근거를 눈으로 확인할 수 있어야 한다 */}
                      {run.total > 1 && (
                        <div className="runbar" title={`${run.total}${t('runOf')}`}>
                          <span className="run-text">
                            {run.total}
                            {t('runOf')} {run.index}
                            {t('dayOrdinal')}
                          </span>
                          <span className="run-dots" aria-hidden="true">
                            {Array.from({ length: Math.min(run.total, 10) }, (_, i) => (
                              <i key={i} className={i + 1 === run.index ? 'on' : ''} />
                            ))}
                            {run.total > 10 && <em>+{run.total - 10}</em>}
                          </span>
                        </div>
                      )}
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
            )
          })}

          {cancelled.length > 0 && (
            <section className="dt-group dt-cancelled">
              <h4 className="dt-group-head">
                <span className="chip st-cancelled">✕ {t('cancelledSection')}</span>
                <span className="dt-group-n">{cancelled.length}</span>
              </h4>
              {cancelled.map((e) => (
                <article className="detail-card is-cancelled" key={e.event_id}>
                  <div className="detail-card-top">
                    <strong className="dt-country">{e.country}</strong>
                    <span className="dt-region">{e.region ? e.region : t('nationwide')}</span>
                  </div>
                  <p className="detail-name">{pickText(lang, e.event_name_en, e.event_name)}</p>
                  <div className="detail-source">
                    <span>{timeAgo(e.upd_dtm, lang)}</span>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
