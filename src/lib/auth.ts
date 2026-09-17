import type { Session } from '@supabase/supabase-js'
import { client } from './supabaseClient'

/**
 * 로그인 상태.
 *
 * 왜 필요한가 — 읽기는 anon에 열려 있지만(DEC-020), **쓰기는 authenticated에만** 열었다.
 * URL을 아는 누구나 가짜 리스크를 등록할 수 있으면 안 되기 때문이다 (→ Q-022, 사용자 결정 2026-08-27).
 *
 * 계정은 앱에서 만들지 않는다. Supabase 대시보드(Authentication → Users)에서 발급한다 —
 * 가입 화면을 열면 누구나 계정을 만들어 쓰기 권한을 얻게 된다.
 */

export type AuthUser = { email: string } | null

export function currentUser(session: Session | null): AuthUser {
  const email = session?.user?.email
  return email ? { email } : null
}

/** 세션 변화를 구독한다. 반환값을 호출하면 해제된다. */
export function onAuth(cb: (s: Session | null) => void): () => void {
  if (!client) {
    cb(null)
    return () => {}
  }
  client.auth.getSession().then(({ data }) => cb(data.session))
  const { data } = client.auth.onAuthStateChange((_e, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

/** 성공하면 null, 실패하면 사용자에게 보여줄 메시지를 돌려준다. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!client) return 'Supabase 연결이 설정되지 않았습니다 (.env.local)'
  const { error } = await client.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await client?.auth.signOut()
}
