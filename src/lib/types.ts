/**
 * Supabase `events` 테이블 스키마와 1:1 대응.
 * 근거: wiki/spec/data-model.md (2026-08-09 라이브 스키마 확인분)
 */

export type EventType =
  | 'Bank Holiday'
  | 'Weather'
  | 'Strike'
  | 'Driving Ban'
  | 'Incident'

/** 레코드 생애주기 (이벤트 생애주기인 lifecycle_status와 별개 — DEC-005 참조) */
export type RecordStatus = 'active' | 'updated' | 'cancelled' | 'excluded'

/** source_url 접근 검증 결과. URL 생존 여부이지 사실 확인 여부가 아니다. */
export type Verified = 'yes' | 'no' | 'failed'

export interface RiskEvent {
  event_id: string
  event_type: EventType
  country: string
  /** 비어 있으면 전국 */
  region: string | null
  date_start: string // YYYY-MM-DD
  date_end: string // YYYY-MM-DD
  /** 이벤트 현지 시간. 종일이면 null */
  time_start: string | null
  time_end: string | null
  event_name: string
  summary: string
  transport_mode: string
  /** 0~5. 0은 "캘린더 미표시" 예약값 (business-rules Driving Ban Step 0) */
  severity: number
  severity_reason: string
  /** 영어 병렬 텍스트 — n8n이 규칙 기반으로 생성. null이면 프론트가 한국어로 폴백한다 (→ 2026-09-02 이중언어 작업) */
  event_name_en?: string | null
  summary_en?: string | null
  severity_reason_en?: string | null
  status: RecordStatus
  source_url: string
  verified: Verified
  upd_dtm: string
}

export type Lang = 'ko' | 'en'
