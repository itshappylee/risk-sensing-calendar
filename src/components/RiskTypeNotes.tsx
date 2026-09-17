import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'

/**
 * 캘린더 아래 — 유형별 짧은 설명.
 *
 * 왜 필요한가 (→ 사용자 제안 2026-08-28): 캘린더를 처음 보는 사람은 "왜 일요일에는
 * 운전금지가 하나도 없지?", "왜 폭염이 1점이지?" 같은 걸 알 길이 없다. 그 판단들이
 * business-rules에만 있고 화면에는 없었다.
 *
 * ⚠️ **문구는 규칙과 함께 움직여야 한다.** 여기 적힌 숫자·예외는 전부
 * wiki/spec/business-rules.md §1~§4에 근거가 있다. 규칙을 고치면 이 파일도 고칠 것.
 *
 * 문구를 i18n.ts가 아니라 여기 두는 이유: `makeT`는 평평한 키-문자열 사전이라
 * 유형별로 묶인 여러 줄을 담기에 맞지 않는다. 유형에 딸린 내용이므로
 * eventMeta.ts의 TYPE_META처럼 유형 옆에 둔다.
 */

interface Note {
  /** TYPE_META의 key와 같은 색 변수를 쓴다 */
  colorKey: string
  icon: string
  title: Record<Lang, string>
  /** 한 줄 정의 */
  what: Record<Lang, string>
  /** 판정·수집에서 알아야 할 것 */
  how: Record<Lang, string>
}

/** 순서는 화면 위 유형 필터와 맞춘다 */
const NOTES: Note[] = [
  {
    colorKey: 'ban',
    icon: '⛔',
    title: { ko: '운전금지', en: 'Driving Ban' },
    what: {
      ko: '화물차(대부분 7.5t 초과)의 통행이 법령·관보로 막히는 시간대.',
      en: 'Hours when trucks (mostly over 7.5t) are barred from the road by law or gazette.',
    },
    how: {
      ko: '주간 06:00–21:00 중 막힌 시간으로 점수를 매긴다. 야간 전용(21:00–06:00)과 일요일은 유럽 어디서나 늘 있는 규정이라 표시하지 않는다. 12개국은 법령에서 계산하고 이탈리아·프랑스·스페인은 연 1회 관보 달력을 쓴다. 그리스·불가리아·루마니아는 명절마다 개별 공고라 사람이 직접 넣어야 한다.',
      en: 'Scored by how much of the 06:00–21:00 daytime window is blocked. Night-only bans (21:00–06:00) and Sundays are standing rules everywhere in Europe, so they are not shown. Twelve countries are computed from statute; Italy, France and Spain come from the annual gazette calendar. Greece, Bulgaria and Romania are announced case by case and must be entered by hand.',
    },
  },
  {
    colorKey: 'weather',
    icon: '🌧',
    title: { ko: '기상', en: 'Weather' },
    what: {
      ko: '유럽 기상경보 통합망(Meteoalarm)의 적색 경보만 모은다.',
      en: 'Red alerts only, from Meteoalarm — the shared European weather-warning network.',
    },
    how: {
      ko: '운송을 방해하는 현상(강풍·폭설·홍수·안개 등)은 3점에서, 폭염·산불위험은 1점에서 시작한다. 영향 지역이 10곳을 넘거나 이틀 이상 이어지면 1점씩 올라간다.',
      en: 'Hazards that impede transport (wind, snow, flood, fog…) start at 3; heat and wildfire risk start at 1. Each of "10+ regions" and "2+ days" adds one point.',
    },
  },
  {
    colorKey: 'strike',
    icon: '🚫',
    title: { ko: '파업 · 사고', en: 'Strike & Incident' },
    what: {
      ko: '물류 매체 보도에서 파업·사고·도로 공사를 모은 뒤, 관리자가 승인해야 캘린더에 오른다.',
      en: 'Strikes, incidents and roadworks gathered from logistics media, then shown only after an administrator approves.',
    },
    how: {
      ko: '인원수가 아니라 부문이 1차 기준이다 — 운수·항만·철도·항공·세관은 3점, 그 밖은 1점. 전국 규모나 3일 이상이면 올리고, 예고 단계면 내린다. 사고·공사는 통행이 끊기면 3점, 지연이나 차로 일부 통제뿐이면 1점에서 시작한다.',
      en: 'Sector matters more than headcount — transport, ports, rail, aviation and customs start at 3, everything else at 1. Nationwide or 3+ days adds a point; merely announced subtracts one. Incidents and roadworks start at 3 when through traffic is blocked, or 1 for delays and partial lane closures.',
    },
  },
  {
    colorKey: 'holiday',
    icon: '🏛',
    title: { ko: '공휴일', en: 'Bank Holiday' },
    what: {
      ko: '41개국 공식 공휴일. 감시 대상은 42개국이지만 코소보는 공휴일 데이터 출처가 없어 빠져 있다. 위험이 아니라 참고 정보라서 날짜 오른쪽 위 배지로만 표시한다.',
      en: 'Official holidays in 41 countries. We monitor 42, but Kosovo has no holiday data source. Context rather than risk, so it appears only as a corner badge.',
    },
    how: {
      ko: '공휴일 자체가 길을 막지는 않는다 — 고객 창고가 닫혀 하차가 밀릴 뿐이다. 그날 실제로 운송을 막는 것은 그 위에 걸리는 운전금지다.',
      en: 'A holiday does not close the road — it closes the customer warehouse, so unloading slips. What actually blocks transport that day is the driving ban laid over it.',
    },
  },
]

export function RiskTypeNotes({ lang }: { lang: Lang }) {
  const t = makeT(lang)
  return (
    <section className="rtn" aria-label={t('riskTypeGuide')}>
      <h2 className="rtn-title">{t('riskTypeGuide')}</h2>
      <dl className="rtn-list">
        {NOTES.map((n) => (
          <div className="rtn-item" key={n.colorKey} style={{ ['--rtn-accent' as string]: `var(--ev-${n.colorKey})` }}>
            <dt className="rtn-term">
              <span aria-hidden="true">{n.icon}</span> {n.title[lang]}
            </dt>
            <dd className="rtn-desc">
              <span className="rtn-what">{n.what[lang]}</span> {n.how[lang]}
            </dd>
          </div>
        ))}
      </dl>
      <p className="rtn-foot">{t('riskTypeFoot')}</p>
    </section>
  )
}
