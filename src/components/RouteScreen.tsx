import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Lang, RiskEvent } from '../lib/types'
import { makeT, pickText, timeAgo } from '../lib/i18n'
import { TYPE_META, TRANSPORT_ICON, severityBand, severityLabel, type TransportMode } from '../lib/eventMeta'
import { LocationPicker, emptyLocation, type LocationValue } from './LocationPicker'
import { fetchEvents } from '../lib/supabase'
import {
  buildRouteOptions,
  routeDateRange,
  safestIndex,
  type RouteOptions,
} from '../lib/routeAnalysis'
import { toISODate } from '../lib/calendar'
import { COUNTRIES } from '../lib/locations'
import { regionLabel, useRegionLabels } from '../lib/regionLabels'
import { BatchInput } from './BatchInput'
import { MultiResults } from './MultiResults'
import { AllPairsInput } from './AllPairsInput'
import { ALL_PAIRS_DAYS, buildAllPairs, type PairScope } from '../lib/allPairs'
import { analyseRows, spanOfRows, type BatchResult, type BatchRow } from '../lib/batchRoutes'
import { buildAllRoutesCsv, buildSummaryCsv } from '../lib/routeCsv'
import { downloadCsv } from '../lib/exportCsv'
import { writeUrl, type RouteQuery } from '../lib/urlState'

interface Props {
  lang: Lang
  onToast: (msg: string) => void
  /** 링크(`#/route?from=…`)로 들어왔을 때의 입력. 있으면 채우고 바로 조회한다 */
  initial?: RouteQuery
}

/** 한 번의 조회에 쓰는 입력 — 화면 상태, 링크, 저장해 둔 값이 모두 이 모양으로 오간다 */
interface Inputs {
  mode: TransportMode
  from: string
  to: string
  via: string[]
  dep: string
  n: number
}

/**
 * 마지막으로 조회한 노선을 이 브라우저에 기억해 다음에 열 때 채운다.
 * 개인 계정이 없어 서버에 저장하지 않는다(노선은 DB에 두지 않는다는 결정, 2026-10-08) — 브라우저 안에서만 쓴다.
 * 출발일은 기억하지 않는다: 어제의 날짜로 열리면 오히려 틀린 조회가 된다.
 */
const LAST_KEY = 'sels.route.last.v1'

function loadLast(): Partial<Inputs> {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as Partial<Inputs> | null
    if (!v || typeof v !== 'object') return {}
    const ok = (c: unknown) => typeof c === 'string' && COUNTRIES.includes(c)
    return {
      ...(MODES.includes(v.mode as TransportMode) ? { mode: v.mode } : {}),
      ...(ok(v.from) ? { from: v.from } : {}),
      ...(ok(v.to) ? { to: v.to } : {}),
      ...(Array.isArray(v.via) ? { via: v.via.filter(ok).slice(0, 5) } : {}),
      ...(Number.isInteger(v.n) && v.n! >= 1 && v.n! <= 60 ? { n: v.n } : {}),
    }
  } catch {
    return {} // 저장소가 막혀 있거나 값이 깨져 있어도 화면은 기본값으로 열린다
  }
}

function saveLast(i: Inputs) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ mode: i.mode, from: i.from, to: i.to, via: i.via, n: i.n }))
  } catch {
    /* 저장 못 해도 조회에는 영향이 없다 */
  }
}


const MODES: TransportMode[] = ['road', 'rail', 'air', 'sea']

const MODE_KEY: Record<TransportMode, 'modeRoad' | 'modeRail' | 'modeAir' | 'modeSea'> = {
  road: 'modeRoad',
  rail: 'modeRail',
  air: 'modeAir',
  sea: 'modeSea',
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; routes: RouteOptions; sample: boolean; row: BatchRow }

type MultiPhase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; results: BatchResult[]; sample: boolean }

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * 2b · 경로 분석 — 실제 `events` 데이터로 계산한다 (2026-09-05, 목업 해제).
 *
 * 계산 규칙은 `lib/routeAnalysis.ts`(= business-rules §6)에 있고, 이 파일은 화면만 그린다.
 *
 * ⚠️ **여전히 없는 것** (→ Q-012-route-analysis-not-built):
 * ⑴ 진짜 노선 지도 — 좌표가 없어 "이 선을 따라가면 무엇에 걸리나"를 못 푼다.
 *    대신 지나는 **국가를 순서대로 늘어놓은 구간 바**를 그린다. 지도인 척하지 않는다.
 * ⑵ 예상 지연시간 — 거리·속도 데이터가 없다. 등급과 그 이유까지만 보여주고 숫자는 지어내지 않는다.
 *
 * 도시 입력은 2026-10-14에 뺐다 — 판정이 국가 단위(DEC-022)라 넣어도 결과가 달라지지 않았다.
 */
export function RouteScreen({ lang, onToast, initial }: Props) {
  useRegionLabels()
  const t = makeT(lang)

  // 처음 채울 값: 링크 > 마지막 조회(이 브라우저) > 기본값
  const [start] = useState<Inputs>(() => {
    const base: Inputs = { mode: 'road', from: 'Germany', to: 'France', via: [], dep: toISODate(new Date()), n: 3, ...loadLast() }
    return initial ? { ...base, ...initial, dep: initial.dep || base.dep } : base
  })
  const [mode, setMode] = useState<TransportMode>(start.mode)
  // 경로 분석은 국가 단위라 도시를 받지 않는다 (2026-10-14) → LocationPicker countryOnly
  const [origin, setOrigin] = useState<LocationValue>(emptyLocation(start.from))
  const [dest, setDest] = useState<LocationValue>(emptyLocation(start.to))
  const [waypoints, setWaypoints] = useState<LocationValue[]>(start.via.map((v) => emptyLocation(v)))
  const [depart, setDepart] = useState(start.dep)
  const [days, setDays] = useState(start.n)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  /** 여러 경로 중 지금 보고 있는 것. 조회할 때마다 기본 경로로 돌아간다 */
  const [selected, setSelected] = useState(0)
  /** 한 건 조회(기본) / 여러 건 조회(엑셀) — 입력 폼 맨 위에서 고른다. 결과는 둘 다 오른쪽에 나온다 */
  const [kind, setKind] = useState<'single' | 'multi' | 'all'>('single')
  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const [multi, setMulti] = useState<MultiPhase>({ kind: 'idle' })
  /** 전 구간 위험 — 검색 없이 모든 국가 쌍을 훑는다 */
  const [allScope, setAllScope] = useState<PairScope>({ hub: 'Slovakia', direction: 'both' })
  const [allModes, setAllModes] = useState<TransportMode[]>(['road', 'rail'])
  const [allRes, setAllRes] = useState<(MultiPhase & { scanned?: number }) | { kind: 'idle' }>({ kind: 'idle' })

  const inputsNow = (): Inputs => ({
    mode,
    from: origin.country,
    to: dest.country,
    via: waypoints.map((w) => w.country).filter(Boolean),
    dep: depart,
    n: days,
  })

  /** 폼을 이 입력으로 맞춘다 — 링크로 들어왔을 때, 여러 건 결과에서 노선을 가져올 때 */
  function applyInputs(i: Inputs) {
    setMode(i.mode)
    setOrigin(emptyLocation(i.from))
    setDest(emptyLocation(i.to))
    setWaypoints(i.via.map((v) => emptyLocation(v)))
    setDepart(i.dep)
    setDays(i.n)
  }

  async function run(inp: Inputs = inputsNow()) {
    if (!inp.from || !inp.to) {
      onToast(t('routeNeedInput'))
      return
    }
    const range = routeDateRange(inp.dep, inp.n)
    setPhase({ kind: 'loading' })
    const load = await fetchEvents(range.from, range.to)
    if (load.kind === 'error') {
      setPhase({ kind: 'error', message: load.message })
      return
    }
    saveLast(inp)
    // 주소에 입력을 담는다 — 주소창을 그대로 복사해 동료에게 보내면 같은 조회가 열린다
    writeUrl({ screen: 'route', route: { mode: inp.mode, from: inp.from, to: inp.to, via: inp.via, dep: inp.dep, n: inp.n } })
    setSelected(0)
    setPhase({
      kind: 'done',
      routes: buildRouteOptions(load.events, [inp.from, ...inp.via, inp.to].map((country) => ({ country })), inp.mode, range),
      sample: load.kind === 'sample',
      // CSV용 — 조회한 시점의 입력을 그대로 들고 있는다 (그 뒤에 폼을 바꿔도 결과 파일은 조회 때 값)
      row: {
        excelRow: 0,
        name: `${inp.from} → ${inp.to}`,
        mode: inp.mode,
        origin: inp.from,
        dest: inp.to,
        via: inp.via,
        depart: inp.dep,
        lead: inp.n,
      },
    })
  }

  // 링크로 들어왔으면 폼이 이미 채워져 있으니 바로 조회한다 (개발 모드의 이중 실행은 ref로 막는다)
  const autoRan = useRef(false)
  useEffect(() => {
    if (initial && !autoRan.current) {
      autoRan.current = true
      void run(start)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 여러 건 결과의 한 줄을 한 건 조회로 가져가 전체 분석(구간 바·카드·이벤트)을 본다 */
  function openInSingle(row: BatchRow) {
    const inp: Inputs = { mode: row.mode, from: row.origin, to: row.dest, via: row.via, dep: row.depart, n: row.lead }
    applyInputs(inp)
    setKind('single')
    void run(inp)
  }

  async function runMulti() {
    if (batchRows.length === 0) {
      onToast(t('multiNeedFile'))
      return
    }
    setMulti({ kind: 'loading' })
    // DB 조회는 노선 개수와 무관하게 1회 — 모든 줄의 기간을 합쳐 읽고 화면에서 나눈다
    const span = spanOfRows(batchRows)!
    const load = await fetchEvents(span.from, span.to)
    if (load.kind === 'error') {
      setMulti({ kind: 'error', message: load.message })
      return
    }
    setMulti({ kind: 'done', results: analyseRows(batchRows, load.events), sample: load.kind === 'sample' })
  }

  async function runAll() {
    if (allModes.length === 0) return
    setAllRes({ kind: 'loading' })
    const depart = toISODate(new Date())
    const range = routeDateRange(depart, ALL_PAIRS_DAYS)
    // DB 조회는 1회 — 7일 구간의 이벤트를 한 번 읽고 모든 쌍을 화면에서 계산한다
    const load = await fetchEvents(range.from, range.to)
    if (load.kind === 'error') {
      setAllRes({ kind: 'error', message: load.message })
      return
    }
    const { results, scanned } = buildAllPairs(load.events, { modes: allModes, scope: allScope, depart })
    setAllRes({ kind: 'done', results, sample: load.kind === 'sample', scanned })
  }

  /** 지금 결과를 CSV 두 종류로 받을 수 있게 같은 모양으로 맞춘다 */
  const exportable: BatchResult[] =
    kind === 'multi'
      ? multi.kind === 'done'
        ? multi.results
        : []
      : kind === 'all'
        ? allRes.kind === 'done'
          ? allRes.results
          : []
        : phase.kind === 'done' && phase.routes.options.length > 0
        ? [
            {
              row: phase.row,
              routes: phase.routes,
              from: phase.routes.options[0].analysis.from,
              to: phase.routes.options[0].analysis.to,
            },
          ]
        : []

  const stamp = toISODate(new Date())
  function exportCsv(which: 'summary' | 'all') {
    downloadCsv(
      which === 'summary' ? buildSummaryCsv(exportable) : buildAllRoutesCsv(exportable),
      `route-risk-${kind === 'all' ? `hub-${allScope.hub}-${allScope.direction}-${which === 'summary' ? 'summary' : 'routes'}` : which === 'summary' ? 'results' : 'all-routes'}_${stamp}.csv`,
    )
    onToast(t('exported'))
  }

  const routes = phase.kind === 'done' ? phase.routes : null
  const options = routes?.options ?? []
  const current = options[Math.min(selected, Math.max(0, options.length - 1))] ?? null
  const result = current?.analysis ?? null
  const safest = options.length > 1 ? safestIndex(options) : -1
  const band = severityBand(result?.grade ?? 0)

  return (
    <div className="route-screen">
      <div className="sec-bar">
        <h2 className="sec-bar-title">{t('navRoute')}</h2>
      </div>

      <div className="route-main">
        {/* ===== 좌: 경로 정보 입력 ===== */}
        <section className="panel route-form" aria-label={t('routeInput')}>
          <h2 className="sec-title">{t('routeInput')}</h2>

          {/* 한 건 조회(기본) / 여러 건 조회(엑셀 템플릿) */}
          <div className="route-kind" role="group" aria-label={t('routeKind')}>
            <button aria-pressed={kind === 'single'} className={kind === 'single' ? 'on' : ''} onClick={() => setKind('single')}>
              {t('tabSingle')}
            </button>
            <button aria-pressed={kind === 'multi'} className={kind === 'multi' ? 'on' : ''} onClick={() => setKind('multi')}>
              {t('tabBatch')}
            </button>
            <button aria-pressed={kind === 'all'} className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
              {t('tabAll')}
            </button>
          </div>

          {kind === 'single' && (
            <>

          <label className="fld-label">{t('transportType')}</label>
          <div className="mode-picker" role="group" aria-label={t('transportType')}>
            {MODES.map((m) => (
              <button
                key={m}
                className={mode === m ? 'on' : ''}
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                <span className="mode-ico" aria-hidden="true">
                  {TRANSPORT_ICON[m]}
                </span>
                {t(MODE_KEY[m])}
              </button>
            ))}
          </div>

          <label className="fld-label">{t('origin')}</label>
          <LocationPicker lang={lang} value={origin} onChange={setOrigin} idPrefix="r-origin" countryOnly />

          {waypoints.map((w, i) => (
            <div className="wp-row" key={`wp-${i}`}>
              <div className="wp-pick-group">
                <label className="fld-label">
                  {t('waypoint')} {i + 1}
                </label>
                <LocationPicker
                  lang={lang}
                  value={w}
                  onChange={(next) => setWaypoints(waypoints.map((old, j) => (i === j ? next : old)))}
                  idPrefix={`r-wp${i}`}
                  countryOnly
                />
              </div>
              <button
                className="wp-del"
                aria-label={t('removeWaypoint')}
                title={t('removeWaypoint')}
                onClick={() => setWaypoints(waypoints.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}

          <button className="wp-add" onClick={() => setWaypoints([...waypoints, emptyLocation()])}>
            + {t('addWaypoint')}
          </button>

          <label className="fld-label">{t('destination')}</label>
          <LocationPicker lang={lang} value={dest} onChange={setDest} idPrefix="r-dest" countryOnly />

          <div className="fld-2col">
            <div>
              <label className="fld-label" htmlFor="r-date">
                {t('departDate')}
              </label>
              <input
                id="r-date"
                className="fld"
                type="date"
                value={depart}
                onChange={(e) => setDepart(e.target.value)}
              />
            </div>
            <div>
              <label className="fld-label" htmlFor="r-days">
                {t('duration')}
              </label>
              <div className="fld-suffix">
                <input
                  id="r-days"
                  className="fld"
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
                <span>{t('days')}</span>
              </div>
            </div>
          </div>

          <button className="btn primary run-btn" onClick={() => void run()} disabled={phase.kind === 'loading'}>
            {phase.kind === 'loading' ? t('routeLoading') : `${t('runAnalysis')} ▶`}
          </button>
            </>
          )}

          {kind === 'multi' && (
            <>
              <BatchInput lang={lang} onToast={onToast} onRows={(rows) => { setBatchRows(rows); setMulti({ kind: 'idle' }) }} />
              <button className="btn primary run-btn" onClick={runMulti} disabled={multi.kind === 'loading' || batchRows.length === 0}>
                {multi.kind === 'loading' ? t('routeLoading') : `${t('runAnalysis')} ▶`}
              </button>
            </>
          )}

          {kind === 'all' && (
            <AllPairsInput
              lang={lang}
              scope={allScope}
              onScope={setAllScope}
              modes={allModes}
              onModes={setAllModes}
              loading={allRes.kind === 'loading'}
              onRun={runAll}
            />
          )}
        </section>

        {/* ===== 우: 분석 결과 ===== */}
        <section className="panel route-result" aria-label={t('analysisResult')}>
          {kind === 'all' && (
            <>
              <header className="rr-head">
                <div className="rr-head-l">
                  <span className="rr-title">{t('allTitle')}</span>
                  {allRes.kind === 'done' && <span className="detail-count">{allRes.results.length}</span>}
                </div>
                {exportable.length > 0 && (
                  <div className="rr-export">
                    <button className="btn" onClick={() => exportCsv('summary')} title={t('csvSummaryHint')}>
                      ⬇ {t('csvSummary')}
                    </button>
                    <button className="btn" onClick={() => exportCsv('all')} title={t('csvAllHint')}>
                      ⬇ {t('csvAllRoutes')}
                    </button>
                  </div>
                )}
              </header>
              {allRes.kind === 'idle' && <div className="detail-empty">{t('allIdle')}</div>}
              {allRes.kind === 'loading' && <div className="detail-empty">{t('routeLoading')}</div>}
              {allRes.kind === 'error' && (
                <div className="detail-empty">
                  {t('routeError')} — {allRes.message}
                </div>
              )}
              {allRes.kind === 'done' && (
                <>
                  {allRes.sample && <p className="route-note warn">{t('routeSampleNote')}</p>}
                  {allRes.results.length === 0 ? (
                    <div className="detail-empty">{t('allNone')}</div>
                  ) : (
                    <MultiResults lang={lang} results={allRes.results} onOpenSingle={openInSingle} limit={100} />
                  )}
                  <p className="route-note">
                    {allRes.scanned} {t('allScanned')}
                  </p>
                  <p className="route-note coverage">ⓘ {t('coverageNote')}</p>
                </>
              )}
            </>
          )}

          {kind === 'multi' && (
            <>
              <header className="rr-head">
                <div className="rr-head-l">
                  <span className="rr-title">{t('multiTitle')}</span>
                  {multi.kind === 'done' && <span className="detail-count">{multi.results.length}</span>}
                </div>
                {exportable.length > 0 && (
                  <div className="rr-export">
                    <button className="btn" onClick={() => exportCsv('summary')} title={t('csvSummaryHint')}>
                      ⬇ {t('csvSummary')}
                    </button>
                    <button className="btn" onClick={() => exportCsv('all')} title={t('csvAllHint')}>
                      ⬇ {t('csvAllRoutes')}
                    </button>
                  </div>
                )}
              </header>
              {multi.kind === 'idle' && <div className="detail-empty">{batchRows.length > 0 ? t('multiReady') : t('multiIdle')}</div>}
              {multi.kind === 'loading' && <div className="detail-empty">{t('routeLoading')}</div>}
              {multi.kind === 'error' && (
                <div className="detail-empty">
                  {t('routeError')} — {multi.message}
                </div>
              )}
              {multi.kind === 'done' && (
                <>
                  {multi.sample && <p className="route-note warn">{t('routeSampleNote')}</p>}
                  <MultiResults lang={lang} results={multi.results} onOpenSingle={openInSingle} />
                  <p className="route-note">{t('multiNote')}</p>
                  <p className="route-note coverage">ⓘ {t('coverageNote')}</p>
                </>
              )}
            </>
          )}

          {kind === 'single' && (
            <>
          <header className="rr-head">
            <div className="rr-head-l">
              <span className="rr-mode" aria-hidden="true">
                {TRANSPORT_ICON[mode]}
              </span>
              <span className="rr-title">
                {t(MODE_KEY[mode])} {t('basedOn')}
              </span>
              {result && (
                <span className={`grade-badge sev-${band}`}>
                  {result.grade > 0
                    ? `${severityLabel(result.grade, lang)} · ${result.grade}`
                    : t('routeGradeNone')}
                </span>
              )}
            </div>
            {result && (
              <span className="rr-meta">
                {result.from} → {result.to} · {t('routeCountsHigh')} {result.counts.high} ·{' '}
                {t('routeCountsMid')} {result.counts.mid} · {t('routeCountsLow')} {result.counts.low}
              </span>
            )}
            {exportable.length > 0 && (
                <div className="rr-export">
                  <button className="btn" onClick={() => exportCsv('summary')} title={t('csvSummaryHint')}>
                    ⬇ {t('csvSummary')}
                  </button>
                  <button className="btn" onClick={() => exportCsv('all')} title={t('csvAllHint')}>
                    ⬇ {t('csvAllRoutes')}
                  </button>
                </div>
              )}
          </header>

          {phase.kind === 'idle' && <div className="detail-empty">{t('routeIdle')}</div>}
          {phase.kind === 'loading' && <div className="detail-empty">{t('routeLoading')}</div>}
          {phase.kind === 'error' && (
            <div className="detail-empty">
              {t('routeError')} — {phase.message}
            </div>
          )}

          {result && (
            <>
              {phase.kind === 'done' && phase.sample && (
                <p className="route-note warn">{t('routeSampleNote')}</p>
              )}

              {routes?.kind === 'blocked' && <p className="route-note warn">{t('routeBlocked')}</p>}
              <p className="route-note coverage">ⓘ {t('coverageNote')}</p>
              {routes?.kind === 'direct' && <p className="route-note">{t('routeDirectNote')}</p>}

              {/* 국가 구간 바 — 노선 지도가 아니라 지나는 나라를 순서대로 늘어놓은 것.
                  직접 고르지 않은 통과국은 "통과"로 표시해 어디서 왔는지 분명히 한다 */}
              <div className="leg-bar" aria-label={t('routeMap')}>
                {result.legs.map((leg, i) => (
                  <div className="leg-wrap" key={leg.country}>
                    <div className={`leg sev-${severityBand(leg.grade)}${leg.grade === 0 ? ' quiet' : ''}${leg.picked ? '' : ' transit'}`}>
                      <span className="leg-country">{leg.country}</span>
                      {!leg.picked && <span className="leg-city">{t('routeTransit')}</span>}
                      <span className="leg-grade">
                        {leg.grade > 0 ? `${leg.grade} · ${leg.count}${t('routeItems')}` : t('notApplicable')}
                      </span>
                    </div>
                    {i < result.legs.length - 1 && (
                      <span className="leg-arrow" aria-hidden="true">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {routes?.kind === 'graph' && result.legs.some((l) => !l.picked) && (
                <p className="route-note">{t('routeTransitNote')}</p>
              )}

              {/* 리스크 카드 4개 — 유형별 최고 이벤트 */}
              <div className="risk-cards">
                {result.byType.map((r) => {
                  const meta = TYPE_META[r.type]
                  const none = r.top === null
                  const rb = severityBand(r.top?.severity ?? 0)
                  const style = {
                    '--bar-fg': `var(--ev-${meta.key})`,
                    '--bar-bg': `var(--ev-${meta.key}-bg)`,
                  } as CSSProperties
                  return (
                    <article key={r.type} className={`risk-card${none ? ' none' : ''}`} style={style}>
                      <span className="chip type">
                        {meta.icon} {meta.label[lang]}
                      </span>
                      {none || !r.top ? (
                        <p className="rc-none">{t('notApplicable')}</p>
                      ) : (
                        <>
                          <p className="rc-label">
                            {r.top.country} · {pickText(lang, r.top.event_name_en, r.top.event_name)}
                          </p>
                          <p className="rc-sub">
                            {r.top.date_start}
                            {r.count > 1 ? ` · +${r.count - 1}${t('routeItems')}` : ''}
                          </p>
                          <span className={`rl-sev sev-${rb}`}>{r.top.severity}</span>
                        </>
                      )}
                    </article>
                  )
                })}
              </div>

              {/* 배지에 반영된 이벤트 목록 */}
              <h3 className="sec-title alt-title">
                {t('routeRelevant')} <span className="detail-count">{result.relevant.length}</span>
              </h3>
              {result.relevant.length === 0 ? (
                <div className="detail-empty">{t('routeNoEvents')}</div>
              ) : (
                <div className="detail-list">
                  {result.relevant.map((e) => (
                    <EventCard key={e.event_id} e={e} lang={lang} />
                  ))}
                </div>
              )}

              {/* §6.1 "제외된 사건은 버리지 않는다" — 등급에서만 뺐다는 것을 밝히고 남겨 둔다 */}
              {result.excluded.length > 0 && (
                <>
                  <h3 className="sec-title alt-title">
                    {t('routeExcluded')} <span className="detail-count">{result.excluded.length}</span>
                  </h3>
                  <p className="route-note">{t('routeExcludedNote')}</p>
                  <div className="detail-list dimmed">
                    {result.excluded.map((e) => (
                      <EventCard key={e.event_id} e={e} lang={lang} />
                    ))}
                  </div>
                </>
              )}

              {/* 경로 비교 — 국경표가 찾은 경로들. 거리가 아니라 국경 통과 수로만 줄 세운다 */}
              {routes?.kind === 'graph' && (
                <>
                  <h3 className="sec-title alt-title">
                    {t('altRoutes')} <span className="detail-count">{options.length}</span>
                  </h3>
                  <p className="route-note">{t('altNote')}</p>
                  {options.length === 1 ? (
                    <p className="route-note">{t('altOne')}</p>
                  ) : (
                    <div className="alt-list">
                      {options.map((o, i) => {
                        const ab = severityBand(o.analysis.grade)
                        const on = i === (current ? options.indexOf(current) : 0)
                        return (
                          <button
                            key={o.countries.join('>')}
                            className={`alt-row${on ? ' on' : ''}`}
                            aria-pressed={on}
                            onClick={() => setSelected(i)}
                            title={t('altPick')}
                          >
                            <span className="alt-tag">
                              {i === 0 ? t('altBase') : `${t('altAlt')} ${i}`}
                            </span>
                            <span className="alt-path">{o.countries.join(' · ')}</span>
                            <span className="alt-hops">
                              {t('altBorders')} {o.hops}
                              {o.seaHops > 0 ? ` · ${t('altFerry')} ${o.seaHops}` : ''}
                            </span>
                            <span className="alt-counts">
                              {o.analysis.counts.high}/{o.analysis.counts.mid}/{o.analysis.counts.low}
                            </span>
                            <span className={`rl-sev sev-${ab}`} title={severityLabel(o.analysis.grade, lang)}>
                              {o.analysis.grade > 0 ? o.analysis.grade : '—'}
                            </span>
                            {i === safest && <span className="chip alt-best">{t('altSafest')}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

/** 결과 목록의 이벤트 카드 — 캘린더의 국가별 상세와 같은 모양을 쓴다 */
function EventCard({ e, lang }: { e: RiskEvent; lang: Lang }) {
  const t = makeT(lang)
  const meta = TYPE_META[e.event_type]
  const band = severityBand(e.severity)
  const period = e.date_start === e.date_end ? e.date_start : `${e.date_start} → ${e.date_end}`
  const time =
    e.time_start && e.time_end ? `${e.time_start.slice(0, 5)}–${e.time_end.slice(0, 5)}` : t('allDay')
  const style = {
    '--bar-fg': `var(--ev-${meta.key})`,
    '--bar-bg': `var(--ev-${meta.key}-bg)`,
  } as CSSProperties

  return (
    <article className="detail-card" style={style}>
      <div className="detail-card-top">
        <span className={`rl-sev sev-${band}`}>{e.severity}</span>
        <span className="chip type">
          {meta.icon} {meta.label[lang]}
        </span>
        <span className="dt-region">
          {e.country}
          {e.region ? ` · ${regionLabel(e.region, lang)}` : ` · ${t('nationwide')}`}
        </span>
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
        {e.source_url && e.source_url !== 'manual' ? (
          <a href={e.source_url} target="_blank" rel="noreferrer">
            {hostOf(e.source_url)}
          </a>
        ) : (
          <span>{e.source_url || '—'}</span>
        )}
        <span>· {timeAgo(e.upd_dtm, lang)}</span>
      </div>
    </article>
  )
}
