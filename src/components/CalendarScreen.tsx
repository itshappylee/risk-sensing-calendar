import { useEffect, useMemo, useState } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { formatMonth, makeT } from '../lib/i18n'
import { buildMonthWeeks, eventsOnDay, parseISODate, toISODate } from '../lib/calendar'
import { fetchEvents, type LoadState } from '../lib/supabase'
import { isActiveRisk } from '../lib/changes'
import { setEventStatus } from '../lib/candidates'
import { GROUP_OF, type TypeGroup } from '../lib/eventMeta'
import { COUNTRIES } from '../lib/locations'
import { loadPrefs, savePrefs } from '../lib/prefs'
import { buildCsv, downloadCsv } from '../lib/exportCsv'
import { writeUrl } from '../lib/urlState'
import { ReportPanel } from './ReportPanel'
import { RiskTypeNotes } from './RiskTypeNotes'
import { CountryPicker } from './CountryPicker'
import { DistributionMap } from './DistributionMap'
import { DataFreshness } from './DataFreshness'
import { MonthGrid } from './MonthGrid'
import { RiskList } from './RiskList'
import { TypeFilter } from './TypeFilter'
import { DayDetail } from './DayDetail'
import { CountryDetailList } from './CountryDetailList'

type ViewMode = 'month' | 'map' | 'list'

interface Props {
  lang: Lang
  onToast: (msg: string) => void
  initial: { date?: string; country?: string; view?: ViewMode }
  /** 로그인한 사람의 이메일. 보고는 비로그인도 되지만, 제외 처리는 로그인이 필요하다 */
  reporter: string | null
}

const ALL = '__all__'

/** 첫 로딩에 "이벤트 없음"을 확정적으로 보여주지 않기 위한 자리 표시 */
function CalendarSkeleton() {
  return (
    <div className="sk-grid" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }, (_, w) => (
        <div className="sk-row" key={w}>
          {Array.from({ length: 7 }, (_, d) => (
            <div className="sk-cell" key={d} style={{ animationDelay: `${(w * 7 + d) * 18}ms` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 2c · 리스크 캘린더 — 앱의 랜딩 화면 (DEC-010으로 2a 역할 선택을 걷어냄) */
export function CalendarScreen({ lang, onToast, initial, reporter }: Props) {
  const t = makeT(lang)
  const today = new Date()

  const prefs0 = useMemo(() => loadPrefs(), [])
  const initDate = initial.date ? parseISODate(initial.date) : today

  const [view, setView] = useState<ViewMode>(initial.view ?? prefs0.view)
  const [cursor, setCursor] = useState(new Date(initDate.getFullYear(), initDate.getMonth(), 1))
  const [selected, setSelected] = useState<Date | null>(initDate)
  const [country, setCountry] = useState<string>(initial.country ?? prefs0.country ?? ALL)
  const [state, setState] = useState<LoadState>({ kind: 'ok', events: [] })
  const [loading, setLoading] = useState(true)
  const [reportOpen, setReportOpen] = useState(false)
  /** 새로고침 트리거 — 값이 바뀌면 재조회한다 */
  /** 유형 필터 — 비어 있으면 전체 */
  const [types, setTypes] = useState<Set<TypeGroup>>(new Set())

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  // 화면에 보이는 격자 전체 범위(이웃 달 포함)로 조회한다.
  // 세 뷰가 같은 데이터를 보도록 조회 범위는 뷰와 무관하게 이 달 기준으로 통일한다 — 비교가 공정하려면.
  const [rangeFrom, rangeTo] = useMemo(() => {
    const weeks = buildMonthWeeks(year, month)
    return [toISODate(weeks[0][0]), toISODate(weeks[weeks.length - 1][6])]
  }, [year, month])


  /** 제외 같은 화면 내 변경 뒤에 다시 읽기 위한 카운터 */
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchEvents(rangeFrom, rangeTo)
      // fetch 자체가 reject되면(오프라인·CORS·DNS) then이 안 돌아 로딩이 영원히 안 끝난다
      .catch((err): LoadState => ({ kind: 'error', events: [], message: String(err) }))
      .then((res) => {
        if (!cancelled) {
          setState(res)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [rangeFrom, rangeTo, reloadTick])

  /**
   * 국가 필터 목록은 **42개국 전체**를 쓴다 (locations.ts).
   *
   * 그전에는 '이번 달에 이벤트가 있는 나라'만 뽑아 19개국만 보였고, 담당 국가로 저장해 둔
   * 나라가 그 달에 조용하면 필터가 스스로 '전체'로 풀려버렸다. 이제 0건인 나라도 고를 수 있고,
   * 건수 배지로 데이터 유무를 보여준다.
   */
  const countryCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of state.events) {
      if (e.severity <= 0) continue
      m.set(e.country, (m.get(e.country) ?? 0) + 1)
    }
    return m
  }, [state.events])

  const visibleEvents = useMemo(
    () => (country === ALL ? state.events : state.events.filter((e) => e.country === country)),
    [state.events, country],
  )

  /**
   * 집계·판정에 쓰는 것.
   * - 취소된 건 더 이상 위험이 아니다 (WF-3 "본문에서 뺀다")
   * - **출처 확인이 안 된 건(`verified != 'yes'`)은 캘린더에서 뺀다** (→ 사용자 결정 2026-08-26).
   *   검증된 것과 섞이면 혼선이 생긴다. 관리자 화면에서는 그대로 보인다.
   */
  const activeEvents = useMemo(
    () => visibleEvents.filter((e) => isActiveRisk(e) && e.verified === 'yes'),
    [visibleEvents],
  )

  /** 유형 필터를 적용한 최종 목록. 아무 유형도 안 고르면 전체를 뜻한다 */
  const shownEvents = useMemo(
    () =>
      types.size === 0
        ? activeEvents
        : activeEvents.filter((e) => types.has(GROUP_OF[e.event_type])),
    [activeEvents, types],
  )

  const toggleType = (g: TypeGroup) =>
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      // 전부 고르면 필터가 없는 것과 같다 — 비워서 "전체"로 되돌린다
      return next.size === 4 ? new Set() : next
    })


  // 설정 저장 — 매일 반복되는 클릭을 없앤다
  useEffect(() => {
    savePrefs({ country: country === ALL ? null : country, view, lang })
  }, [country, view, lang])

  // URL에 상태를 남겨 새로고침 유지 + 링크 공유가 되게 한다
  useEffect(() => {
    writeUrl({
      screen: 'calendar',
      date: selected ? toISODate(selected) : undefined,
      country: country === ALL ? undefined : country,
      view,
    })
  }, [selected, country, view])


  // 상세는 위험한 것부터. 조회 순서(date_start)를 그대로 쓰면 5점을 스크롤로 찾아야 한다
  const selectedEvents: RiskEvent[] = useMemo(
    () =>
      selected
        ? [...eventsOnDay(shownEvents, selected)].sort(
            (a, b) => b.severity - a.severity || a.country.localeCompare(b.country),
          )
        : [],
    [shownEvents, selected],
  )

  // 임박순 토글 배지 — 오늘~3일 내 severity 4+ 건수. 안 눌러보면 모르는 문제를 공간 없이 해결한다
  const urgentCount = useMemo(() => {
    const t0 = new Date()
    t0.setHours(0, 0, 0, 0)
    const t3 = new Date(t0.getTime() + 3 * 86400000)
    return shownEvents.filter(
      (e) => e.severity >= 4 && parseISODate(e.date_end) >= t0 && parseISODate(e.date_start) <= t3,
    ).length
  }, [shownEvents])

  /** 제외 처리 — 날짜별 상세(DayDetail)와 국가별 상세(CountryDetailList)가 함께 쓴다 */
  const excludeEvent = reporter
    ? async (id: string) => {
        const err = await setEventStatus(id, 'excluded')
        onToast(err ?? t('excludedDone'))
        if (!err) setReloadTick((n) => n + 1)
      }
    : null

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    setCursor(next)
    setSelected(next)
  }


  return (
    <div className="cal-screen">
      {state.kind === 'sample' && <div className="banner info">ℹ️ {t('sampleBanner')}</div>}
      {state.kind === 'empty' && <div className="banner warn">⚠️ {t('rlsBanner')}</div>}
      {state.kind === 'error' && (
        <div className="banner error">
          ⚠️ {t('errorBanner')} — {state.message}
        </div>
      )}

      <DataFreshness lang={lang} events={state.events} />

      <div className="cal-toolbar">
        {/* 형태 비교 — 같은 데이터를 세 형태로 보고 무엇이 물류에 맞는지 고른다.
            결정되면 나머지 둘은 지운다. → Q-025 */}
        <div className="view-toggle" role="group" aria-label={t('viewMode')}>
          <button aria-pressed={view === 'month'} onClick={() => setView('month')}>
            {t('viewMonth')}
          </button>
          <button aria-pressed={view === 'map'} onClick={() => setView('map')}>
            {t('viewMap')}
          </button>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            {t('viewList')}
            {urgentCount > 0 && (
              <span className="tab-badge" title={t('urgentBadge')}>
                {urgentCount}
              </span>
            )}
          </button>
        </div>

        <div className="month-nav">
          <button onClick={() => shiftMonth(-1)} aria-label={t('prevMonth')}>
            ‹
          </button>
          <span className="month-label">{formatMonth(cursor, lang)}</span>
          <button onClick={() => shiftMonth(1)} aria-label={t('nextMonth')}>
            ›
          </button>
        </div>

        <button
          className="btn"
          style={{ flex: 'none', padding: '6px 12px' }}
          onClick={() => {
            const n = new Date()
            setCursor(new Date(n.getFullYear(), n.getMonth(), 1))
            setSelected(n)
          }}
        >
          {t('today')}
        </button>

        <CountryPicker
          lang={lang}
          countries={COUNTRIES}
          counts={countryCounts}
          value={country === ALL ? null : country}
          onChange={(c) => setCountry(c ?? ALL)}
        />

        <TypeFilter lang={lang} events={activeEvents} selected={types} onToggle={toggleType} />

        {/* 필터 초기화 — 국가·유형을 한 번에 푼다 (사용자 요청 2026-08-26).
            여러 칩을 하나씩 다시 눌러 되돌리는 게 번거롭다는 지적에서 나왔다.
            '전체' 상태 = 국가 ALL + 유형 선택 없음(= 전부 표시)이므로 그 상태로 되돌린다.
            걸린 필터가 없으면 비활성 — 눌러도 아무 일이 없는 버튼을 활성으로 두지 않는다. */}
        <button
          className="btn btn-reset"
          onClick={() => {
            setCountry(ALL)
            setTypes(new Set())
          }}
          disabled={country === ALL && types.size === 0}
          title={t('resetFiltersHint')}
        >
          ↺ {t('resetFilters')}
        </button>

        <span className="toolbar-spacer" />

        <button
          className="btn"
          onClick={() => {
            downloadCsv(
              buildCsv(shownEvents, { country: country === ALL ? null : country }),
              `SELS_${toISODate(cursor).slice(0, 7)}${country === ALL ? '' : `_${country}`}.csv`,
            )
            onToast(t('exported'))
          }}
        >
          ↓ {t('exportCsv')}
        </button>

        {loading && <span className="detail-count">{t('loading')}</span>}
      </div>

      <div className={`cal-main${view === 'month' ? '' : ' full'}`} key={view}>
        {view === 'map' && (
          <>
            <div className="panel">
              <DistributionMap
                lang={lang}
                events={shownEvents}
                selectedCountry={country === ALL ? null : country}
                onPickCountry={(c) => setCountry(c ?? ALL)}
              />
            </div>
            {/* 타일만으로는 '무슨 일이 왜 그 점수인지'를 알 수 없다 → 국가별 상세 카드를 아래에 편다 */}
            <div className="panel cdl-panel">
              <CountryDetailList lang={lang} events={shownEvents} onExclude={excludeEvent} />
            </div>
          </>
        )}
        {view === 'month' ? (
          <>
            {/* 격자와 유형 안내를 한 칸에 묶는다 — .cal-main이 2열 격자라
                형제로 두면 안내가 우측 상세 칸으로 밀려난다 */}
            <div className="cal-left">
              <div className="panel">
                {loading && state.events.length === 0 ? (
                  <CalendarSkeleton />
                ) : (
                  <MonthGrid
                    year={year}
                    month={month}
                    events={shownEvents}
                    selected={selected}
                    lang={lang}
                    onSelect={setSelected}
                  />
                )}
              </div>
              <RiskTypeNotes lang={lang} />
            </div>
            <DayDetail
                lang={lang}
                date={selected}
                events={selectedEvents}
                onExclude={excludeEvent}
              />
          </>
        ) : view === 'list' ? (
          <div className="panel">
            <RiskList events={shownEvents} lang={lang} />
          </div>
        ) : null}
      </div>

      {/* 하단 위험 보고 버튼 → 2d 플로팅 패널 */}
      {view === 'month' && (
        <button className="report-fab" onClick={() => setReportOpen(true)}>
          ✎ {t('reportRisk')}
        </button>
      )}

      {reportOpen && (
        <ReportPanel
          lang={lang}
          date={selected}
          reporter={reporter}
          onClose={() => setReportOpen(false)}
          onSubmitted={onToast}
        />
      )}
    </div>
  )
}
