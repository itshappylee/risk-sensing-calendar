import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'
import { TRANSPORT_ICON, type TransportMode } from '../lib/eventMeta'
import { ALL_PAIRS_DAYS, HUBS, type Direction, type PairScope } from '../lib/allPairs'

const DIRECTIONS: Direction[] = ['both', 'out', 'in']
const DIR_KEY = { both: 'allDirBoth', out: 'allDirOut', in: 'allDirIn' } as const

const MODES: TransportMode[] = ['road', 'rail', 'air', 'sea']
const MODE_KEY = { road: 'modeRoad', rail: 'modeRail', air: 'modeAir', sea: 'modeSea' } as const

interface Props {
  lang: Lang
  scope: PairScope
  onScope: (s: PairScope) => void
  modes: TransportMode[]
  onModes: (m: TransportMode[]) => void
  loading: boolean
  onRun: () => void
}

/**
 * 전 구간 위험의 입력 — 고를 것은 범위와 운송수단뿐이다. 검색(출발·도착 입력)이 필요 없다.
 * 기간은 오늘부터 7일로 고정이고, 위험이 있는 쌍만 결과에 남는다.
 */
export function AllPairsInput({ lang, scope, onScope, modes, onModes, loading, onRun }: Props) {
  const t = makeT(lang)
  const toggle = (m: TransportMode) =>
    onModes(modes.includes(m) ? modes.filter((x) => x !== m) : [...modes, m])

  return (
    <div className="allpairs-input">
      <p className="route-note">
        {t('allHow')} {ALL_PAIRS_DAYS} {t('allDays')}
      </p>

      <label className="fld-label">{t('allHub')}</label>
      <div className="ap-hubs" role="radiogroup" aria-label={t('allHub')}>
        {HUBS.map((h) => (
          <button
            key={h}
            role="radio"
            aria-checked={scope.hub === h}
            className={scope.hub === h ? 'on' : ''}
            onClick={() => onScope({ ...scope, hub: h })}
          >
            {h}
          </button>
        ))}
      </div>

      <label className="fld-label">{t('allDirection')}</label>
      <div className="ap-scope" role="radiogroup" aria-label={t('allDirection')}>
        {DIRECTIONS.map((d) => (
          <label key={d} className={scope.direction === d ? 'on' : ''}>
            <input
              type="radio"
              name="ap-dir"
              checked={scope.direction === d}
              onChange={() => onScope({ ...scope, direction: d })}
            />
            {t(DIR_KEY[d])}
          </label>
        ))}
      </div>

      <label className="fld-label">{t('transportType')}</label>
      <div className="mode-picker" role="group" aria-label={t('transportType')}>
        {MODES.map((m) => (
          <button key={m} className={modes.includes(m) ? 'on' : ''} aria-pressed={modes.includes(m)} onClick={() => toggle(m)}>
            <span className="mode-ico" aria-hidden="true">
              {TRANSPORT_ICON[m]}
            </span>
            {t(MODE_KEY[m])}
          </button>
        ))}
      </div>

      <button className="btn primary run-btn" onClick={onRun} disabled={loading || modes.length === 0}>
        {loading ? t('routeLoading') : `${t('allRun')} ▶`}
      </button>
    </div>
  )
}
