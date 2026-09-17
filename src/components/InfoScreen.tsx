import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'
import { RiskTypeNotes } from './RiskTypeNotes'

/**
 * 안내(Info) 탭 — 로그인 없이 누구나 볼 수 있는 사용 설명서.
 *
 * 왜 필요한가 (→ 사용자 요청 2026-09-02): 캘린더·경로 분석·위험 보고·위험도 계산까지
 * 화면이 여러 개로 늘었는데, 처음 오는 사람에게 "이게 뭐 하는 사이트인지"를 설명하는
 * 자리가 없었다. Admin 탭 앞에 둬서 관리자 전용이 아님을 위치로도 드러낸다.
 *
 * 위험 유형 설명은 이미 RiskTypeNotes.tsx에 있으므로 여기서 다시 쓰지 않고 그대로 가져다 쓴다
 * — 규칙이 바뀌면 그 한 곳만 고치면 양쪽에 다 반영된다.
 *
 * 내용 근거: 사용자가 검토·수정한 문구 그대로다 (→ 사용자 확정 2026-09-02, 8/24 개정된
 * business-rules.md §2 v2 — 기상 "영향 지역 10곳 이상 +1" 포함).
 */

interface Block {
  title: Record<Lang, string>
  body: Record<Lang, string>
}

const PURPOSE: Block = {
  title: { ko: '이 사이트는 무엇인가', en: 'What this site is' },
  body: {
    ko: '유럽 42개국에서 화물 운송을 막거나 늦추는 사건 — 운전금지, 기상경보, 파업, 사고, 공휴일 — 을 한 캘린더에 모아 보는 도구입니다. 흩어진 각국 법령·기상청·물류 매체를 매일 자동 수집하고, 사람이 검수한 것만 표시합니다.',
    en: 'A tool that gathers events across 42 European countries that block or delay freight transport — driving bans, weather alerts, strikes, incidents, and public holidays — into one calendar. It automatically collects data every day from scattered national regulations, weather services, and logistics media, and shows only what has passed human review.',
  },
}

const AUDIENCE: Block = {
  title: { ko: '누구를 위한 것인가', en: 'Who it is for' },
  body: {
    ko: '유럽 노선을 다루는 물류 운영·포워딩 담당자. 출발 전 "이 날짜에 이 나라를 지나도 되는가"를 몇 초 안에 확인하는 용도입니다.',
    en: 'Logistics operations and forwarding staff handling European routes. Built to answer, in seconds before departure, "is it safe to pass through this country on this date?"',
  },
}

const SCORING_TITLE: Record<Lang, string> = { ko: '위험도(1~5점)는 어떻게 나오나', en: 'How the 1–5 severity score works' }
const SCORING_ITEMS: Record<Lang, string>[] = [
  {
    ko: '운전금지 — 주간 06:00–21:00 중 금지된 시간 비율로 점수를 매깁니다. 야간 전용과 일요일 금지는 유럽 어디서나 상시 규정이라 표시하지 않습니다.',
    en: 'Driving Ban — scored by the share of the 06:00–21:00 daytime window that is blocked. Night-only and Sunday bans are standing rules everywhere in Europe, so they are not shown.',
  },
  {
    ko: '기상 — 운송 방해 현상(강풍·폭설·홍수 등)은 3점, 폭염·산불위험은 1점에서 시작합니다. 영향 지역 10곳 초과 +1, 이틀 이상 지속 +1.',
    en: 'Weather — transport-disrupting hazards (wind, snow, flood…) start at 3; heat and wildfire risk start at 1. More than 10 affected regions adds +1, lasting 2+ days adds +1.',
  },
  {
    ko: '파업 — 부문이 기준입니다: 운수·항만·철도·항공·세관은 3점, 그 외는 1점. 전국 규모나 3일 이상이면 +1, 예고 단계면 −1.',
    en: 'Strike — scored by sector: transport, ports, rail, aviation and customs start at 3, everything else at 1. Nationwide or 3+ days adds +1; merely announced subtracts 1.',
  },
  {
    ko: '사고·공사 — 통행이 끊기면 3점, 지연이나 차로 일부 통제뿐이면 1점. 전국 규모면 +1, 3일 이상 이어지면 +1.',
    en: 'Incident & roadworks — 3 points when through traffic is blocked, 1 for delays or partial lane closures. Nationwide adds +1; lasting 3+ days adds +1.',
  },
  {
    ko: '공휴일 — 기본 1점 (길을 막는 건 공휴일이 아니라 그 위에 걸리는 운전금지입니다).',
    en: 'Bank Holiday — base 1 point (a holiday itself does not block the road — the driving ban that sometimes rides on top of it does).',
  },
  {
    ko: '화면 표시는 3단계: 낮음(1~2) · 보통(3) · 높음(4~5)',
    en: 'Shown in 3 bands: Low (1–2) · Medium (3) · High (4–5)',
  },
]

const TABS_TITLE: Record<Lang, string> = { ko: '탭별 설명', en: 'What each tab does' }
const TABS_ITEMS: { name: Record<Lang, string>; desc: Record<Lang, string> }[] = [
  {
    name: { ko: '리스크 캘린더', en: 'Risk Calendar' },
    desc: {
      ko: '월 달력 / 분포도(국가별 지도) / 임박순 세 가지 보기. 국가·유형 필터, CSV 내보내기.',
      en: 'Three views — month grid / map by country / by urgency. Filter by country and type, export to CSV.',
    },
  },
  {
    name: { ko: '안내', en: 'Info' },
    desc: { ko: '지금 이 화면입니다.', en: 'This screen.' },
  },
  {
    name: { ko: '관리자', en: 'Admin' },
    desc: {
      ko: '보고된 항목을 승인·반려합니다. 로그인이 필요하고, 메뉴에 노출되지 않는 히든 페이지입니다.',
      en: 'Approve or reject reported items. Requires sign-in, and is a hidden page not shown in the menu.',
    },
  },
]

const REPORT: Block = {
  title: { ko: '위험 보고 기능', en: 'Report a risk' },
  body: {
    ko: '화면 우측 하단 "위험 보고" 버튼으로 누구나 보고할 수 있습니다. 보고한 내용은 바로 캘린더에 뜨지 않고 관리자 검수를 거칩니다. 승인된 것만 캘린더에 올라갑니다.',
    en: 'Anyone can submit a report with the "Report risk" button at the bottom right. A submitted report does not appear on the calendar right away — it goes through admin review first. Only approved reports are added to the calendar.',
  },
}

const SOURCES: Block = {
  title: { ko: '데이터 출처와 갱신', en: 'Data sources & updates' },
  body: {
    ko: '각국 교통부 법령·관보(예: mindop.sk), 공휴일 데이터(date.nager.at), Meteoalarm, 물류 전문 매체. 매일 자동 수집되며, 화면 상단에 마지막 갱신 시각이 표시됩니다.',
    en: 'National transport ministry statutes and gazettes (e.g. mindop.sk), holiday data (date.nager.at), Meteoalarm, and logistics trade media. Collected automatically every day; the last update time is shown at the top of the screen.',
  },
}

const NOTES_TITLE: Record<Lang, string> = { ko: '알아두실 점', en: 'Good to know' }
const NOTES_ITEMS: Record<Lang, string>[] = [
  {
    ko: '검수를 통과한 항목만 표시됩니다. 표시가 없다고 위험이 없다는 뜻은 아닙니다.',
    en: 'Only items that passed review are shown. No entry does not mean no risk.',
  },
  {
    ko: '파업·사고·공사는 언론 보도 기반이라 수집 범위에 한계가 있습니다.',
    en: 'Strikes, incidents and roadworks are sourced from media coverage, so collection has gaps.',
  },
  {
    ko: '운전금지 중 그리스·불가리아·루마니아는 상시 현지 경찰에 의한 정보 변동으로 자동 수집되지 않습니다.',
    en: 'Among driving bans, Greece, Bulgaria and Romania are announced on an ongoing basis by local police and are not collected automatically.',
  },
]

export function InfoScreen({ lang }: { lang: Lang }) {
  const t = makeT(lang)

  return (
    <div className="info-screen">
      <div className="sec-bar">
        <h2 className="sec-bar-title">{t('navInfo')}</h2>
      </div>

      <div className="info-body">
        <section className="panel info-section">
          <h3 className="info-h">{PURPOSE.title[lang]}</h3>
          <p className="info-p">{PURPOSE.body[lang]}</p>
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{AUDIENCE.title[lang]}</h3>
          <p className="info-p">{AUDIENCE.body[lang]}</p>
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{lang === 'ko' ? '위험 유형' : 'Risk types'}</h3>
          <RiskTypeNotes lang={lang} />
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{SCORING_TITLE[lang]}</h3>
          <ul className="info-ul">
            {SCORING_ITEMS.map((it, i) => (
              <li key={i} className="info-li">
                {it[lang]}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{TABS_TITLE[lang]}</h3>
          <dl className="info-dl">
            {TABS_ITEMS.map((it, i) => (
              <div className="info-dl-row" key={i}>
                <dt>{it.name[lang]}</dt>
                <dd>{it.desc[lang]}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{REPORT.title[lang]}</h3>
          <p className="info-p">{REPORT.body[lang]}</p>
        </section>

        <section className="panel info-section">
          <h3 className="info-h">{SOURCES.title[lang]}</h3>
          <p className="info-p">{SOURCES.body[lang]}</p>
        </section>

        <section className="panel info-section info-notes">
          <h3 className="info-h">{NOTES_TITLE[lang]}</h3>
          <ul className="info-ul">
            {NOTES_ITEMS.map((it, i) => (
              <li key={i} className="info-li">
                {it[lang]}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
