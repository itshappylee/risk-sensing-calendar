import { client } from './supabaseClient'

/**
 * 로그 계층 — 콘솔 + Supabase(client_logs) 이중 기록.
 * 근거: wiki/decisions/DEC-008-client-logging-layer.md
 *
 * - 콘솔 출력은 항상 즉시 일어난다.
 * - Supabase 저장은 fire-and-forget이다 — 실패해도 화면 동작을 막지 않고,
 *   저장 자체가 실패하면 콘솔에만 남기고 끝낸다 (log()를 재귀 호출해 무한루프를
 *   만들지 않는다).
 * - Supabase 미설정(샘플 모드)이면 콘솔에만 남는다.
 */

export type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  /** 어디서 호출됐는지. 예: 'lib/supabase.fetchEvents' */
  path: string
  [key: string]: unknown
}

const CONSOLE_FN: Record<LogLevel, (...args: unknown[]) => void> = {
  info: console.info,
  warn: console.warn,
  error: console.error,
}

export function log(level: LogLevel, message: string, { path, ...context }: LogContext): void {
  CONSOLE_FN[level](`[${path}] ${message}`, context)

  if (!client) return // 샘플 모드 — 저장할 곳이 없다

  client
    .from('client_logs')
    .insert({ level, message, path, context })
    .then(({ error }) => {
      if (error) {
        // 저장 실패는 콘솔에만. log()를 다시 부르지 않는다.
        console.error('[log.persist] client_logs insert 실패', error.message)
      }
    })
}
