import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'

export interface PickOption {
  value: string
  label: string
}

interface Props {
  lang: Lang
  value: string
  options: PickOption[]
  onChange: (value: string) => void
  /** 아무것도 안 고른 상태에 보여줄 문구 */
  placeholder: string
  id?: string
  ariaLabel?: string
  disabled?: boolean
  /** 이 개수를 넘으면 검색창을 띄운다 */
  searchFrom?: number
  /** 시간처럼 값이 짧으면 여러 열로 깐다 */
  columns?: number
  /** 선택을 비울 수 있는 항목(placeholder)을 목록 맨 위에 둔다 */
  allowEmpty?: boolean
}

/**
 * 목록에서 하나 고르는 입력 — 브라우저 기본 `<select>` 대신 쓴다.
 *
 * 기본 `<select>`는 선택지가 많으면 목록 높이를 브라우저가 정한다. 국가 42개·시간 48개에서는
 * 화면 위아래를 다 덮을 만큼 길어지고 CSS로 줄일 방법이 없다 (→ 2026-09-09 사용자 보고:
 * "국가 리스트 중에서 선택할 때 이렇게 길어지는 오류").
 *
 * 그래서 목록을 직접 그린다. 높이를 264px로 묶고, 아래 공간이 모자라면 위로 편다.
 * 선택지가 많으면 검색창이 함께 뜬다.
 *
 * 팝업은 `position: fixed`다 — 위험 보고 모달의 `.sheet-body`가 `overflow-y: auto`라
 * 안에 두면 잘리기 때문이다. 대신 스크롤·리사이즈가 일어나면 닫는다.
 */
export function PickList({
  lang,
  value,
  options,
  onChange,
  placeholder,
  id,
  ariaLabel,
  disabled = false,
  searchFrom = 12,
  columns = 1,
  allowEmpty = false,
}: Props) {
  const t = makeT(lang)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{
    left: number
    top: number
    width: number
    up: boolean
    maxH: number
  } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const searchable = options.length > searchFrom
  const all = useMemo(
    () => (allowEmpty ? [{ value: '', label: placeholder }, ...options] : options),
    [allowEmpty, options, placeholder],
  )
  const selected = options.find((o) => o.value === value)

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return all
    return all.filter((o) => o.label.toLowerCase().includes(k))
  }, [all, q])

  /**
   * 트리거 바로 아래에 붙이되, 아래 공간이 모자라면 위로 편다.
   * 어느 쪽이든 남은 공간에 맞춰 목록 높이를 줄인다 — 화면 밖으로 넘치지 않게.
   */
  useLayoutEffect(() => {
    if (!open) return
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 12
    const below = window.innerHeight - r.bottom - gap
    const above = r.top - gap
    const up = below < 200 && above > below
    // 팝업 자체의 여백 + (있다면) 검색창이 먹는 높이
    const chrome = 16 + (searchable ? 42 : 0)
    const room = (up ? above : below) - chrome
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8)),
      top: up ? r.top : r.bottom,
      width: Math.max(r.width, columns > 1 ? 240 : 180),
      up,
      maxH: Math.max(120, Math.min(264, room)),
    })
  }, [open, columns, searchable])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (pop.current?.contains(target) || trigger.current?.contains(target)) return
      setOpen(false)
    }
    /**
     * 페이지가 스크롤되면 팝업이 트리거에서 떨어진다 — 따라다니게 하는 대신 닫는다.
     * 단, **목록 자체의 스크롤은 제외한다.** capture 단계라 목록 안 스크롤까지 잡히는데,
     * 그러면 마우스 휠로 목록을 내릴 수 없고 열자마자 닫히기도 한다
     * (고른 값으로 scrollIntoView 하는 것도 스크롤이다 → 2026-09-09 검증에서 발견).
     */
    const onScroll = (e: Event) => {
      const target = e.target as Node | null
      if (target && pop.current?.contains(target)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  /** 열 때는 지금 고른 값에 커서를 둔다 */
  useEffect(() => {
    if (!open) return
    setQ('')
    const i = all.findIndex((o) => o.value === value)
    setActive(i < 0 ? 0 : i)
  }, [open, all, value])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('.pl-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [open, active, shown])

  function commit(v: string) {
    onChange(v)
    setOpen(false)
    trigger.current?.focus()
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation() // 모달까지 닫히지 않게 — 목록만 닫는다
      setOpen(false)
      trigger.current?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => Math.min(shown.length - 1, Math.max(0, i + step)))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const opt = shown[active]
      if (opt) commit(opt.value)
      return
    }
    if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="pl">
      <button
        type="button"
        id={id}
        ref={trigger}
        className={`fld pl-trigger${selected ? ' has' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="pl-val">{selected ? selected.label : placeholder}</span>
        <span className="pl-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && pos && (
        <div
          ref={pop}
          className={`pl-pop${pos.up ? ' up' : ''}`}
          style={{
            left: pos.left,
            width: pos.width,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
          }}
          onKeyDown={onKey}
        >
          {searchable && (
            <input
              className="fld pl-search"
              placeholder={t('pickSearch')}
              value={q}
              autoFocus
              onChange={(e) => {
                setQ(e.target.value)
                setActive(0)
              }}
            />
          )}

          <div
            className={`pl-list${columns > 1 ? ' grid' : ''}`}
            role="listbox"
            ref={listRef}
            style={{
              maxHeight: pos.maxH,
              ...(columns > 1 ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : {}),
            }}
            tabIndex={searchable ? -1 : 0}
          >
            {shown.map((o, i) => (
              <button
                type="button"
                key={o.value || '—'}
                role="option"
                aria-selected={o.value === value}
                className={`pl-item${o.value === value ? ' on' : ''}${i === active ? ' active' : ''}${o.value === '' ? ' empty' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(o.value)}
              >
                {o.label}
              </button>
            ))}
            {shown.length === 0 && <p className="pl-empty">{t('noMatch')}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
