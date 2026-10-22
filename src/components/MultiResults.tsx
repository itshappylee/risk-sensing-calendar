import { useMemo, useState } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { makeT, pickText } from '../lib/i18n'
import { severityBand, severityLabel, TYPE_META, type SeverityBand } from '../lib/eventMeta'
import { regionLabel, useRegionLabels } from '../lib/regionLabels'
import type { BatchResult, BatchRow } from '../lib/batchRoutes'
import { safestIndex } from '../lib/routeAnalysis'

/**
 * 여러 건 조회 결과 — 오른쪽 결과 영역에 노선당 1줄로 그린다.
 *
 * - 맨 위에 **요약 한 줄**(높음·보통·낮음·없음 몇 건)을 두고, **위험이 높은 노선부터** 정렬한다.
 *   매일 여는 담당자가 먼저 알고 싶은 것은 "내 노선 중 조치할 것이 무엇인가"이기 때문이다.
 * - 줄을 누르면 그 아래로 **상세**(대체 경로별 등급 + 걸린 이벤트)가 펼쳐진다.
 *   등급만 있으면 "왜 5점인가"를 확인하려고 한 건 조회로 다시 입력해야 했다.
 * - 한 줄의 등급은 **기본(가장 짧은) 경로** 기준이다. 전부 비교하려면 "전 경로 CSV".
 */

const DETAIL_EVENTS = 8
const BAND_ORDER: SeverityBand[] = ['high', 'mid', 'low']

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const BAND_KEY: Record<SeverityBand, 'routeCountsHigh' | 'routeCountsMid' | 'routeCountsLow'> = {
  high: 'routeCountsHigh',
  mid: 'routeCountsMid',
  low: 'routeCountsLow',
}

interface Props {
  lang: Lang
  results: BatchResult[]
  /** 이 노선을 한 건 조회 화면으로 가져가 전체 분석을 본다 */
  onOpenSingle: (row: BatchRow) => void
  /** 표에 그릴 최대 줄 수 (요약은 전체 기준). 전 구간처럼 줄이 많을 때만 쓴다 */
  limit?: number
}

export function MultiResults({ lang, results, onOpenSingle, limit }: Props) {
  useRegionLabels()
  const t = makeT(lang)
  const [open, setOpen] = useState<string | null>(null)

  const sorted = useMemo(
    () =>
      results
        .map((r) => ({ r, grade: r.routes.options[0]?.analysis.grade ?? 0 }))
        .sort((a, b) => b.grade - a.grade || a.r.row.excelRow - b.r.row.excelRow),
    [results],
  )

  const tally = useMemo(() => {
    const n: Record<SeverityBand, number> = { high: 0, mid: 0, low: 0 }
    let none = 0
    for (const { grade } of sorted) {
      if (grade > 0) n[severityBand(grade)]++
      else none++
    }
    return { n, none }
  }, [sorted])

  return (
    <>
      <div className="multi-summary" role="status">
        <b>
          {results.length} {t('multiRoutes')}
        </b>
        {BAND_ORDER.map((b) => (
          <span key={b} className="ms-item">
            <span className={`rl-sev sev-${b}`}>{tally.n[b]}</span> {t(BAND_KEY[b])}
          </span>
        ))}
        <span className="ms-item">
          <span className="rl-sev sev-low quiet">{tally.none}</span> {t('notApplicable')}
        </span>
        <span className="ms-sort">{t('multiSorted')}</span>
      </div>

      <div className="batch-table" role="table">
        <div className="batch-head" role="row">
          <span role="columnheader">{t('batchColRoute')}</span>
          <span role="columnheader">{t('batchColPath')}</span>
          <span role="columnheader">{t('batchColWindow')}</span>
          <span role="columnheader">{t('batchColRisk')}</span>
          <span role="columnheader">{t('batchColDriver')}</span>
        </div>

        {(limit ? sorted.slice(0, limit) : sorted).map(({ r, grade }) => {
          const id = `${r.row.excelRow}-${r.row.name}`
          const isOpen = open === id
          const best = r.routes.options[0]
          const a = best?.analysis
          const top = a?.relevant[0] ?? null
          const toggle = () => setOpen(isOpen ? null : id)
          return (
            <div className={`batch-item${isOpen ? ' open' : ''}`} key={id}>
              <div
                className="batch-row clickable"
                role="row"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle()
                  }
                }}
              >
                <span className="b-name" role="cell">
                  <span className="b-chev" aria-hidden="true">
                    {isOpen ? '▾' : '▸'}
                  </span>
                  {r.row.name}
                  <em>{r.row.mode}</em>
                </span>
                <span className="b-path" role="cell">
                  {r.routes.kind === 'blocked' && (
                    <span className="chip status-unverified">{t('batchBlocked')}</span>
                  )}{' '}
                  {best ? best.countries.join(' · ') : '—'}
                  {best && best.hops > 0 && <em title={t('multiBorders')}>{best.hops}</em>}
                </span>
                <span className="b-when" role="cell">
                  {r.from} → {r.to}
                </span>
                <span className="b-risk" role="cell">
                  <span className={`rl-sev sev-${severityBand(grade)}`} title={severityLabel(grade, lang)}>
                    {grade > 0 ? grade : '—'}
                  </span>
                  {a && (
                    <em className="b-counts">
                      <span>{a.counts.high} {t('routeCountsHigh').toLowerCase()}</span>
                      <span>{a.counts.mid} {t('routeCountsMid').toLowerCase()}</span>
                      <span>{a.counts.low} {t('routeCountsLow').toLowerCase()}</span>
                    </em>
                  )}
                </span>
                <span className="b-driver" role="cell">
                  {top ? (
                    <>
                      <span className="chip type">
                        {TYPE_META[top.event_type].icon} {TYPE_META[top.event_type].label[lang]}
                      </span>{' '}
                      {top.country}
                      {top.region ? ` · ${regionLabel(top.region, lang)}` : ''} · {top.date_start} ·{' '}
                      {pickText(lang, top.event_name_en, top.event_name)}
                    </>
                  ) : (
                    t('batchNone')
                  )}
                </span>
              </div>

              {isOpen && <RowDetail lang={lang} result={r} onOpenSingle={onOpenSingle} />}
            </div>
          )
        })}
      </div>
      {limit !== undefined && sorted.length > limit && (
        <p className="route-note">
          {limit} / {sorted.length} — {t('allShowing')}
        </p>
      )}
    </>
  )
}

function RowDetail({
  lang,
  result,
  onOpenSingle,
}: {
  lang: Lang
  result: BatchResult
  onOpenSingle: (row: BatchRow) => void
}) {
  const t = makeT(lang)
  const opts = result.routes.options
  const safer = safestIndex(opts)
  const events: RiskEvent[] = opts[0]?.analysis.relevant ?? []

  return (
    <div className="batch-detail">
      {result.routes.kind === 'blocked' && <p className="route-note warn">{t('routeBlocked')}</p>}

      <h4 className="bd-title">
        {t('multiOptions')} <span className="detail-count">{opts.length}</span>
      </h4>
      <ul className="bd-options">
        {opts.map((o, i) => (
          <li key={o.countries.join('>')} className={i === safer ? 'safer' : ''}>
            <span className="bd-tag">{i === 0 ? t('multiMain') : `${t('multiAlt')} ${i}`}</span>
            <span className="bd-path">{o.countries.join(' · ')}</span>
            <em>
              {o.hops} {t('multiBorders')}
            </em>
            {i === safer && <span className="chip bd-safer">{t('multiLower')}</span>}
            <span className={`rl-sev sev-${severityBand(o.analysis.grade)}`}>
              {o.analysis.grade > 0 ? o.analysis.grade : '—'}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="bd-title">
        {t('multiEvents')} <span className="detail-count">{events.length}</span>
      </h4>
      {events.length === 0 ? (
        <p className="route-note">{t('batchNone')}</p>
      ) : (
        <ul className="bd-events">
          {events.slice(0, DETAIL_EVENTS).map((e) => (
            <li key={e.event_id}>
              <span className={`rl-sev sev-${severityBand(e.severity)}`}>{e.severity}</span>
              <span className="chip type">
                {TYPE_META[e.event_type].icon} {TYPE_META[e.event_type].label[lang]}
              </span>
              <span className="bd-ev-main">
                <b>{e.country}</b>
                {e.region ? ` · ${regionLabel(e.region, lang)}` : ''} · {e.date_start}
                {e.date_end !== e.date_start ? ` → ${e.date_end}` : ''} ·{' '}
                {pickText(lang, e.event_name_en, e.event_name)}
              </span>
              {e.source_url && e.source_url !== 'manual' && (
                <a href={e.source_url} target="_blank" rel="noreferrer">
                  {hostOf(e.source_url)}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {events.length > DETAIL_EVENTS && (
        <p className="route-note">
          +{events.length - DETAIL_EVENTS} {t('multiMore')}
        </p>
      )}

      <button className="btn" onClick={() => onOpenSingle(result.row)}>
        {t('multiOpenSingle')} →
      </button>
    </div>
  )
}
