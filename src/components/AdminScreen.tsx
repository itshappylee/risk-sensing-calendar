import { useState, type CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { TYPE_META, severityBand, severityLabel } from '../lib/eventMeta'
import { makeT, timeAgo, pickText } from '../lib/i18n'
import {
  CATEGORY_TO_TYPE,
  decideCandidate,
  setEventStatus,
  undoDecision,
  type Candidate,
} from '../lib/candidates'

interface Props {
  lang: Lang
  events: RiskEvent[]
  /** 승인 대기 후보. 로그인 안 했으면 RLS가 막아 항상 빈 배열이다 */
  candidates: Candidate[]
  /** 오늘 처리한 것들 — 눌렀는데 사라져서 뭘 했는지 볼 수 없던 문제 (2026-08-28) */
  decided: Candidate[]
  signedIn: boolean
  onSignIn: () => void
  onDecided: () => void
  onToast: (msg: string) => void
}

/**
 * 2e · Admin 대시보드.
 *
 * 위쪽 표("승인 대기")는 2026-08-27부터 **실제로 동작한다** — `risk_candidates`의 pending 행을
 * 보여주고 승인·반려를 DB에 쓴다. 그전까지는 Supabase Table Editor에서 `admin_decision`을
 * 손으로 바꾸는 것이 유일한 경로였다 (→ DEC-024, Q-021).
 *
 * ⚠️ **승격(promoted)은 여기서 안 한다.** 승인만 표시하고, `events`로 올리는 것은 WF-2c가
 * service_role로 한다. RLS도 그렇게 막아 뒀다.
 *
 * 아래쪽("수집 리스크 정보")의 수정·제외는 아직 연결돼 있지 않다.
 */
export function AdminScreen({ lang, events, candidates, decided, signedIn, onSignIn, onDecided, onToast }: Props) {
  const t = makeT(lang)
  const [busyId, setBusyId] = useState<number | null>(null)
  /** 반려 사유를 받는 중인 행. window.prompt를 쓰지 않는다 — 브라우저 모달은 화면을 통째로 막는다 */
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [note, setNote] = useState('')

  async function toggleExclude(eventId: string, next: 'active' | 'excluded') {
    const err = await setEventStatus(eventId, next)
    onToast(err ?? (next === 'excluded' ? t('excludedDone') : t('restoredDone')))
    if (!err) onDecided()
  }

  async function undo(c: Candidate) {
    const err = await undoDecision(c.id)
    onToast(err ?? (c.promoted ? t('undoneButPromoted') : t('undone')))
    if (!err) onDecided()
  }

  async function decide(id: number, decision: 'approved' | 'rejected', reason?: string) {
    setBusyId(id)
    const err = await decideCandidate(id, decision, reason)
    setBusyId(null)
    setRejectingId(null)
    setNote('')
    onToast(err ?? t('decided'))
    if (!err) onDecided()
  }

  const needsReview = events.filter((e) => e.verified !== 'yes' && e.severity > 0)
  // 상위 12건만 보여주면 낮은 점수로 잘못 들어온 건은 찾을 수가 없다.
  // 제외된 건은 **개수와 무관하게 항상** 넣는다 — 그래야 복구가 가능하다 (2026-08-28)
  const byRank = (a: RiskEvent, b: RiskEvent) =>
    b.severity - a.severity || a.country.localeCompare(b.country)
  const excluded = events.filter((e) => e.status === 'excluded').sort(byRank)
  const managed = [
    ...events.filter((e) => e.severity > 0 && e.status !== 'excluded').sort(byRank).slice(0, 12),
    ...excluded,
  ]

  const kpis = [
    {
      label: t('kpiPending'),
      value: candidates.length,
      tone: candidates.length > 0 ? ('warn' as const) : ('muted' as const),
    },
    { label: t('kpiApprovedToday'), value: decided.length, tone: 'muted' as const },
    {
      label: t('kpiNeedsReview'),
      value: needsReview.length,
      tone: needsReview.length > 0 ? ('warn' as const) : ('muted' as const),
    },
  ]

  return (
    <div className="admin-screen">
      <div className="banner info">ℹ️ {t('adminNote')}</div>

      <div className="admin-main">
        <div className="kpi-row">
          {kpis.map((k) => (
            <div className={`kpi kpi-${k.tone}`} key={k.label}>
              <span className="kpi-n">{k.value}</span>
              <span className="kpi-l">{k.label}</span>
            </div>
          ))}
        </div>

        {/* ===== 미검증 사용자 보고 — 빈 상태가 정상 =====
            표 머리글은 남겨둔다. 무엇이 들어올 자리인지 보이는 편이
            아이콘 하나만 띄우는 것보다 정보량이 크다. */}
        <section className="panel admin-sec">
          <h2 className="sec-title">{t('tblUnverified')}</h2>

          <div className="rtbl-head" aria-hidden="true">
            <span>{t('colType')}</span>
            <span>{t('colWhere')}</span>
            <span>{t('colWhen')}</span>
            <span>{t('colReporter')}</span>
            <span>{t('colAction')}</span>
          </div>

          {candidates.map((c) => {
            const et = CATEGORY_TO_TYPE[c.category]
            const meta = et ? TYPE_META[et] : null
            const where = [c.country, c.region].filter(Boolean).join(' · ') || '—'
            const when = c.date_start
              ? c.date_start + (c.time_start ? ' ' + c.time_start.slice(0, 5) : '')
              : '—'
            return (
              <div className="rtbl-row" key={c.id}>
                <span className="chip type">
                  {meta ? meta.icon + ' ' + meta.label[lang] : c.category}
                </span>
                <span className="atbl-where">
                  <b>{where}</b>
                  {c.raw_snippet ? ' — ' + c.raw_snippet : ''}
                </span>
                <span className="atbl-when">{when}</span>
                <span className="atbl-upd">
                  {c.source_type === 'manual' ? t('manualBadge') : t('aiBadge')}
                  {c.reported_by ? ' · ' + c.reported_by : ''}
                </span>
                <span className="atbl-act">
                  {rejectingId === c.id ? (
                    <>
                      {/* 반려 사유는 나중에 같은 건이 또 올라왔을 때의 판단 근거다 (screen-spec 2e).
                          비워도 반려는 된다 — 사유를 강제하면 급할 때 아무 글자나 넣게 된다 */}
                      <input
                        className="fld tiny-input"
                        autoFocus
                        placeholder={t('rejectReason')}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') decide(c.id, 'rejected', note.trim() || undefined)
                          if (e.key === 'Escape') setRejectingId(null)
                        }}
                      />
                      <button
                        className="btn tiny"
                        disabled={busyId === c.id}
                        onClick={() => decide(c.id, 'rejected', note.trim() || undefined)}
                      >
                        {t('confirmReject')}
                      </button>
                      <button className="btn tiny" onClick={() => setRejectingId(null)}>
                        {t('cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn tiny"
                        disabled={busyId === c.id}
                        onClick={() => decide(c.id, 'approved')}
                      >
                        {t('approve')}
                      </button>
                      <button
                        className="btn tiny"
                        disabled={busyId === c.id}
                        onClick={() => {
                          setNote('')
                          setRejectingId(c.id)
                        }}
                      >
                        {t('reject')}
                      </button>
                    </>
                  )}
                </span>
              </div>
            )
          })}

          {candidates.length === 0 && (
            <div className="admin-empty">
              <span className="ae-ico" aria-hidden="true">
                🗂
              </span>
              <p>{signedIn ? t('adminEmpty') : t('adminLoginNeeded')}</p>
              {!signedIn && (
                <div className="ae-actions">
                  <button className="btn tiny" onClick={onSignIn}>
                    {t('signIn')}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===== 오늘 처리한 것 — 되돌릴 수 있으려면 먼저 보여야 한다 ===== */}
        {decided.length > 0 && (
          <section className="panel admin-sec">
            <h2 className="sec-title">
              {t('recentDecisions')} <span className="sec-n">{decided.length}</span>
            </h2>
            {decided.map((c) => {
              const et = CATEGORY_TO_TYPE[c.category]
              const meta = et ? TYPE_META[et] : null
              const where = [c.country, c.region].filter(Boolean).join(' · ') || '—'
              return (
                <div className="rtbl-row" key={c.id}>
                  <span className="chip type">
                    {meta ? meta.icon + ' ' + meta.label[lang] : c.category}
                  </span>
                  <span className="atbl-where">
                    <b>{where}</b>
                    {c.date_start ? ' · ' + c.date_start : ''}
                    {c.admin_note ? ' — ' + c.admin_note : ''}
                  </span>
                  <span className="atbl-when">
                    {c.admin_decision === 'approved' ? t('approve') : t('reject')}
                  </span>
                  <span className="atbl-upd">{c.promoted ? t('promoted') : '—'}</span>
                  <span className="atbl-act">
                    <button className="btn tiny" onClick={() => undo(c)}>
                      {t('undo')}
                    </button>
                  </span>
                </div>
              )
            })}
            <p className="rtn-foot">{t('recentDecisionsNote')}</p>
          </section>
        )}

        {/* ===== 수집 리스크 정보 — 실제 데이터 ===== */}
        <section className="panel admin-sec">
          <h2 className="sec-title">
            {t('tblAiManaged')} <span className="sec-n">{managed.length}</span>
          </h2>

          <div className="atbl">
            <div className="atbl-head" aria-hidden="true">
              <span>{t('colType')}</span>
              <span>{t('colWhere')}</span>
              <span>{t('colWhen')}</span>
              <span>{t('severityLabel')}</span>
              <span>{t('colUpdated')}</span>
              <span>{t('colAction')}</span>
            </div>

            {managed.map((e) => {
              const meta = TYPE_META[e.event_type]
              const band = severityBand(e.severity)
              const style = {
                '--bar-fg': `var(--ev-${meta.key})`,
                '--bar-bg': `var(--ev-${meta.key}-bg)`,
                '--row-accent': `var(--sev-${band})`,
              } as CSSProperties
              return (
                <div
                  className={`atbl-row${e.status === 'excluded' ? ' is-excluded' : ''}`}
                  key={e.event_id}
                  style={style}
                  tabIndex={0}
                >
                  <span className="chip type">
                    {meta.icon} {meta.label[lang]}
                    {e.status === 'excluded' ? ` · ${t('excludedBadge')}` : ''}
                  </span>
                  <span className="atbl-where">
                    <b>{e.country}</b>
                    {e.region ? ` · ${e.region}` : ''} — {pickText(lang, e.event_name_en, e.event_name)}
                  </span>
                  <span className="atbl-when">{e.date_start}</span>
                  <span className={`rl-sev sev-${band}`} title={severityLabel(e.severity, lang)}>
                    {e.severity}
                  </span>
                  <span className="atbl-upd">{timeAgo(e.upd_dtm, lang)}</span>
                  <span className="atbl-act">
                    {e.status === 'excluded' ? (
                      <button className="btn tiny" onClick={() => toggleExclude(e.event_id, 'active')}>
                        {t('restore')}
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn tiny"
                          disabled
                          title={t('adminActionPending')}
                          onClick={() => onToast(t('adminActionPending'))}
                        >
                          {t('edit')}
                        </button>
                        <button className="btn tiny" onClick={() => toggleExclude(e.event_id, 'excluded')}>
                          {t('exclude')}
                        </button>
                      </>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
