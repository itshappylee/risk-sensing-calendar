import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'

/**
 * 지도 읽는 법 — 색과 숫자가 무슨 뜻인지.
 * 지도만 있으면 숫자 3이 '3건'인지 '3점'인지 알 수 없다.
 * 색 경계(1–2 / 3 / 4–5)는 위험도 필터와 같다 (`severityBand`).
 */
export function MapGuide({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <section className="tmap-guide" aria-label={t('mapGuideTitle')}>
      <h3 className="tmap-guide-title">{t('mapGuideTitle')}</h3>

      <p className="tmap-guide-h">{t('mapGuideColor')}</p>
      <ul className="tmap-guide-list">
        <li className="sev-key sev-low">
          <span className="sev-key-dot" />
          {t('mapGuideLow')}
        </li>
        <li className="sev-key sev-mid">
          <span className="sev-key-dot" />
          {t('mapGuideMid')}
        </li>
        <li className="sev-key sev-high">
          <span className="sev-key-dot" />
          {t('mapGuideHigh')}
        </li>
        <li className="sev-key sev-none">
          <span className="sev-key-dot" />
          {t('mapGuideNone')}
        </li>
      </ul>

      <p className="tmap-guide-h">{t('mapGuideNumber')}</p>
      <p className="tmap-guide-desc">{t('mapGuideNumberDesc')}</p>
    </section>
  )
}
