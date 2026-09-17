import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * ⚠️ 여기에는 반드시 anon / publishable 키만 쓴다. service_role 키는 절대 금지.
 * 근거: wiki/questions/Q-016-key-storage-actual.md
 *   "service_role은 RLS를 통째로 우회한다. 브라우저가 볼 수 있는 어디에도 가면 안 된다."
 *
 * 값은 app/.env.local 에 넣는다 (.gitignore의 *.local에 걸려 커밋되지 않음).
 *
 * 클라이언트 생성만 이 파일에 둔다 — supabase.ts(데이터 조회)와 log.ts(로깅)가
 * 둘 다 이 클라이언트를 쓰는데, 서로를 import하면 순환 참조가 생기기 때문에
 * 공통 의존성을 이 파일로 뺐다.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey && !url.includes('여기에'))

export const client: SupabaseClient | null = isConfigured ? createClient(url!, anonKey!) : null
