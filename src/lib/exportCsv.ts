import type { RiskEvent } from './types'
import { TYPE_META, severityLabel } from './eventMeta'
import { transportLabel } from './i18n'
import { isActiveRisk } from './changes'

/**
 * CSV로 내보낸다 (사용자 결정 2026-08-26, 이전 TXT 방식을 대체).
 *
 * 왜 CSV인가:
 * - **엑셀에서 바로 열린다.** PRD FR-1.3.3의 "엑셀 내보내기"에 xlsx 라이브러리(수백 KB) 없이 도달한다
 * - 이벤트당 1줄이라 서식 붙은 TXT보다 **3~4배 작다**
 * - 담당자의 기존 작업이 엑셀이므로 붙여넣기가 아니라 **바로 이어서 작업**할 수 있다
 *
 * 잃은 것: TXT가 갖던 "위에서부터 읽는 리포트" 구조(심각도 섹션 분리, 근거 들여쓰기).
 * 대신 컬럼을 전부 실어 **분석·병합 쪽으로 성격을 옮겼다.**
 *
 * ⚠️ **내용은 화면 언어와 무관하게 항상 영어다** (→ 사용자 확인 2026-08-26).
 * 이 파일은 현지 담당자에게도 전달되므로, 받는 사람이 한국어를 못 읽으면 쓸모가 없다.
 * `events.country`·`source_url` 등 원본 값이 이미 영어라 일관성도 좋아진다.
 */

/** CSV는 항상 영어로 낸다 — 화면 언어를 따르지 않는다 */
const CSV_LANG = 'en' as const

/** 엑셀에서 열 때 붙는 문제 세 가지를 여기서 전부 막는다 */
function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v)

  // ① CSV 인젝션 — 데이터가 외부 크롤링에서 오므로 =·+·-·@로 시작하면 엑셀이 수식으로 실행한다
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s

  // ② 쉼표·따옴표·줄바꿈이 든 값은 감싸고 따옴표는 두 번 쓴다 (summary·severity_reason에 흔하다)
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

const COLUMNS = [
    'date_start', 'date_end', 'country', 'region', 'type', 'severity', 'grade', 'status',
    'event_name', 'summary', 'severity_reason', 'transport_mode', 'time_start', 'time_end',
    'verified', 'source_url', 'updated_at',
]

export function buildCsv(events: RiskEvent[], opts: { country: string | null }): string {
  const active = events.filter(isActiveRisk)
  const cancelled = events.filter((e) => e.status === 'cancelled')

  // 심각한 것부터 — 엑셀에서 정렬을 다시 하지 않아도 위에서부터 읽힌다
  const sorted = [...active, ...cancelled].sort(
    (a, b) =>
      Number(a.status === 'cancelled') - Number(b.status === 'cancelled') ||
      b.severity - a.severity ||
      a.date_start.localeCompare(b.date_start) ||
      a.country.localeCompare(b.country),
  )

  const rows: string[] = [COLUMNS.join(',')]

  for (const e of sorted) {
    rows.push(
      [
        e.date_start,
        e.date_end,
        e.country,
        e.region ?? '',
        TYPE_META[e.event_type]?.label[CSV_LANG] ?? e.event_type,
        e.severity,
        severityLabel(e.severity, CSV_LANG),
        e.status,
        e.event_name,
        e.summary,
        e.severity_reason,
        transportLabel(e.transport_mode, CSV_LANG),
        e.time_start ?? '',
        e.time_end ?? '',
        e.verified,
        e.source_url,
        e.upd_dtm,
      ]
        .map(cell)
        .join(','),
    )
  }

  // 수집 커버리지 경고 — 이 파일만 받아 본 사람도 "없다 ≠ 안 위험하다"를 알아야 한다.
  // '#' 주석 줄은 엑셀에서는 그냥 보이고, 파서는 관례적으로 건너뛴다.
  rows.push('')
  rows.push(
    cell(
      '# NOTE: strike / driving ban / incident are not being collected. Absence here does not mean absence of risk.',
    ),
  )
  rows.push(
    cell('# NOTE: unverified items (verified != yes) are excluded from this export.'),
  )
  rows.push(
    cell(`# generated: ${new Date().toISOString()} | scope: ${opts.country ?? 'all countries'}`),
  )

  return rows.join('\r\n')
}

/**
 * ③ BOM을 붙인다 — 없으면 **한글이 엑셀(특히 Windows)에서 깨진다.**
 * 이게 CSV 내보내기에서 가장 흔하게 놓치는 지점이다.
 */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
