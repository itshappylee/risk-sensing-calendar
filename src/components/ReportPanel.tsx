import { useEffect, useRef, useState } from 'react'
import type { EventType, Lang } from '../lib/types'
import { submitReport } from '../lib/candidates'
import { TRANSPORT_ICON, TRANSPORT_MODES, TYPE_META, type TransportMode } from '../lib/eventMeta'
import { makeT } from '../lib/i18n'
import { toISODate } from '../lib/calendar'
import { resolveCity } from '../lib/locations'
import { LocationPicker, emptyLocation, type LocationValue } from './LocationPicker'
import { PickList } from './PickList'

interface Props {
  lang: Lang
  date: Date | null
  /** 로그인한 사람의 이메일. 비로그인 보고도 가능하므로 null이어도 제출된다 */
  reporter: string | null
  onClose: () => void
  onSubmitted: (msg: string) => void
}

/** 와이어프레임 2d — 위험 유형 4개 중 1개 선택 (Incident는 목록에 없다) */
const REPORT_TYPES: EventType[] = ['Driving Ban', 'Strike', 'Weather', 'Bank Holiday']

/** 30분 단위 선택 리스트 */
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
})

const TIME_OPTIONS = TIMES.map((x) => ({ value: x, label: x }))

/**
 * 2d · 위험 보고 — 캘린더 위 플로팅 패널.
 *
 * 와이어프레임: "전부 선택식. 직접 타이핑 없음(오타 방지)". 상세 내용만 자유 텍스트.
 *
 * ✅ **2026-08-27부터 실제로 저장된다.** Q-021이 지적한 세 가지를 다 풀었다:
 *   1. `risk_candidates.category` CHECK에 `driving_ban`·`weather`·`bank_holiday` 추가
 *   2. `time_start`/`time_end` 컬럼 추가 — 운행금지는 business-rules §4가 시간대로 점수를 매긴다
 *   3. RLS에 쓰기 정책 추가 (읽기는 anon 공개 유지 → DEC-020, Q-022)
 *
 * 저장은 `risk_candidates`로 간다. **바로 캘린더에 뜨지 않는다** — 승인을 거쳐야 한다.
 * 그게 DEC-023(verified = 사람 검수 통과)의 요지다.
 *
 * 2026-09-02부터 **로그인 없이도 보고할 수 있다** (사용자 결정). 사내 공유 전용이라
 * 스팸 유입 경로가 사실상 없고, 승인 게이트가 캘린더 오염을 막는다. 비로그인 보고는
 * `reported_by`가 null로 남는다.
 */
export function ReportPanel({ lang, date, reporter, onClose, onSubmitted }: Props) {
  const t = makeT(lang)
  const ref = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)

  const [type, setType] = useState<EventType | null>(null)
  /** 'all' = 전체. `events.transport_mode`는 복수값(`road,rail`)이 가능하지만 보고는 단일 선택으로 둔다 */
  const [transport, setTransport] = useState<TransportMode | 'all'>('all')
  /** 나라·도시는 한 덩어리로 다룬다 (LocationPicker와 같은 모양) */
  const [loc, setLoc] = useState<LocationValue>(emptyLocation())
  const [day, setDay] = useState(toISODate(date ?? new Date()))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /** 유형·나라·날짜는 없으면 후보로서 의미가 없다. 시간과 상세는 선택 */
  const complete = Boolean(type && loc.country && day)

  async function send() {
    if (!type) return
    setBusy(true)
    setErr(null)
    const msg = await submitReport({
      type,
      transport: transport === 'all' ? null : transport,
      country: loc.country,
      city: resolveCity(loc.city, loc.customCity),
      day,
      from,
      to,
      detail,
      reporter,
    })
    setBusy(false)
    if (msg) setErr(msg)
    else {
      onSubmitted(t('reportSubmitted'))
      onClose()
    }
  }

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab' || !ref.current) return
      // 포커스 트랩 — 패널 밖으로 탭이 새면 뒤 화면을 읽게 된다
      const f = ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, [href]',
      )
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rp-title"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <div>
            <h2 id="rp-title">{t('reportTitle')}</h2>
            <p className="sheet-sub">{t('reportSubtitle')}</p>
          </div>
          <button className="sheet-x" onClick={onClose} aria-label={t('cancel')}>
            ✕
          </button>
        </header>

        <div className="sheet-body">
          <label className="fld-label">{t('fieldRiskType')}</label>
          <div className="type-picker" role="group" aria-label={t('fieldRiskType')}>
            {REPORT_TYPES.map((rt, i) => {
              const meta = TYPE_META[rt]
              return (
                <button
                  key={rt}
                  ref={i === 0 ? firstRef : undefined}
                  className={type === rt ? 'on' : ''}
                  aria-pressed={type === rt}
                  onClick={() => setType(rt)}
                >
                  <span aria-hidden="true">{meta.icon}</span>
                  {meta.label[lang]}
                </button>
              )
            })}
          </div>

          {/* 운송수단 — events.transport_mode와 대응.
              risk_candidates.transport_mode는 2026-08-20 확장에서 추가돼 지금은 그대로 저장된다 */}
          <label className="fld-label">{t('fieldTransport')}</label>
          <div className="mode-picker five" role="group" aria-label={t('fieldTransport')}>
            <button
              className={transport === 'all' ? 'on' : ''}
              aria-pressed={transport === 'all'}
              onClick={() => setTransport('all')}
            >
              <span className="mode-ico" aria-hidden="true">
                ◍
              </span>
              {t('modeAll')}
            </button>
            {TRANSPORT_MODES.map((m) => (
              <button
                key={m}
                className={transport === m ? 'on' : ''}
                aria-pressed={transport === m}
                onClick={() => setTransport(m)}
              >
                <span className="mode-ico" aria-hidden="true">
                  {TRANSPORT_ICON[m]}
                </span>
                {t(m === 'road' ? 'modeRoad' : m === 'rail' ? 'modeRail' : m === 'air' ? 'modeAir' : 'modeSea')}
              </button>
            ))}
          </div>

          <LocationPicker lang={lang} value={loc} onChange={setLoc} idPrefix="rp" />

          <div className="fld-2col">
            <div>
              <label className="fld-label" htmlFor="rp-date">
                {t('fieldDate')}
              </label>
              <input
                id="rp-date"
                className="fld"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div>
              <label className="fld-label">{t('fieldTimeRange')}</label>
              <div className="time-range">
                <PickList
                  lang={lang}
                  ariaLabel={`${t('fieldTimeRange')} from`}
                  value={from}
                  options={TIME_OPTIONS}
                  placeholder="--:--"
                  columns={3}
                  allowEmpty
                  onChange={setFrom}
                />
                <span>–</span>
                <PickList
                  lang={lang}
                  ariaLabel={`${t('fieldTimeRange')} to`}
                  value={to}
                  options={TIME_OPTIONS}
                  placeholder="--:--"
                  columns={3}
                  allowEmpty
                  onChange={setTo}
                />
              </div>
            </div>
          </div>

          <label className="fld-label" htmlFor="rp-detail">
            {t('fieldDetail')}
          </label>
          <textarea
            id="rp-detail"
            className="fld"
            rows={3}
            placeholder={t('detailPlaceholder')}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </div>

        <footer className="sheet-foot">
          {err && (
            <div className="blocked-note" role="alert">
              <strong>⛔ {err}</strong>
            </div>
          )}
          <div className="sheet-actions">
            <button className="btn" onClick={onClose}>
              {t('cancel')}
            </button>
            <button
              className="btn primary"
              onClick={send}
              disabled={!complete || busy}
              title={!complete ? t('needCountryDateType') : undefined}
            >
              {busy ? t('submitting') : t('submit')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
