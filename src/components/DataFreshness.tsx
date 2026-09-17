import type { Lang, RiskEvent } from '../lib/types'
import { makeT, timeAgo } from '../lib/i18n'

interface Props {
  lang: Lang
  events: RiskEvent[]
}

/**
 * 데이터 기준 시각 — **이 화면의 데이터가 언제 것인가**.
 *
 * 이전에는 "마지막 확인 이후 신규/변경/취소" 요약이 이 자리에 있었으나,
 * 사용자가 **DB가 갱신된 시각**을 보는 편이 낫다고 판단해 교체했다 (2026-08-26, → DEC-019).
 *
 * 값은 화면에 로드된 이벤트의 `MAX(upd_dtm)`이다. 즉 **파이프라인이 마지막으로 이 범위를
 * 건드린 시각**이고, "오늘 아침 수집이 돌았나"를 확인하는 용도다.
 *
 * ⚠️ 조회 범위(현재 달) 안에서의 최댓값이므로, 다른 달에 더 최근 갱신이 있어도 여기 안 잡힌다.
 */
export function DataFreshness({ lang, events }: Props) {
  const t = makeT(lang)

  const latest = events.reduce<string | null>((acc, e) => {
    if (!e.upd_dtm) return acc
    return !acc || e.upd_dtm > acc ? e.upd_dtm : acc
  }, null)

  const d = latest ? new Date(latest) : null
  const valid = d !== null && !Number.isNaN(d.getTime())

  return (
    <div className={`fresh-strip${valid ? '' : ' muted'}`} role="status" aria-live="polite">
      <span className="fresh-label">{t('dataAsOf')}</span>

      {valid ? (
        <>
          <time className="fresh-time" dateTime={latest ?? undefined} title={latest ?? undefined}>
            {d.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-GB', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          <span className="fresh-rel">{timeAgo(latest!, lang)}</span>
        </>
      ) : (
        <span className="fresh-rel">{t('noData')}</span>
      )}

    </div>
  )
}
