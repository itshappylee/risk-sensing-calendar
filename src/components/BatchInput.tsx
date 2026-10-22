import { useRef, useState } from 'react'
import type { Lang } from '../lib/types'
import { makeT } from '../lib/i18n'
import { parseRows, type BatchParse, type BatchRow } from '../lib/batchRoutes'
import { downloadTemplate, readWorkbook } from '../lib/batchExcel'

/**
 * 여러 건 조회의 입력 — 양식 받기 → 엑셀 올리기. 여기서는 **읽기만** 한다.
 * 조회(DB 읽기)는 "Run analysis"를 눌렀을 때 RouteScreen이 한 번에 한다.
 *
 * 노선을 DB에 저장하지 않는다 — 개인 계정이 없어 "누구 것인가"의 기준이 없기 때문이다
 * (사용자 판단 2026-10-08). 파일은 브라우저 안에서 읽고 끝난다.
 */
interface Props {
  lang: Lang
  onToast: (msg: string) => void
  /** 읽은 노선. 파일을 새로 고르면 비워서 보낸 뒤 다시 채운다 */
  onRows: (rows: BatchRow[]) => void
}

export function BatchInput({ lang, onToast, onRows }: Props) {
  const t = makeT(lang)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<BatchParse | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(file: File) {
    setFileName(file.name)
    setBusy(true)
    setParsed(null)
    onRows([])
    try {
      const p = parseRows(await readWorkbook(file))
      setParsed(p)
      onRows(p.fatal ? [] : p.rows)
    } catch {
      onToast(t('batchFileErr'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="batch-input">
      <div className="batch-actions">
        <button className="btn" onClick={() => void downloadTemplate()}>
          📄 {t('batchTemplate')}
        </button>
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? t('batchBusy') : `⬆ ${t('batchPick')}`}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = '' // 같은 파일을 다시 골라도 동작하게
            if (f) void onFile(f)
          }}
        />
      </div>

      {fileName && (
        <p className="batch-file">
          {fileName}
          {parsed && !parsed.fatal ? ` · ${parsed.rows.length}${t('routeItems')} ${t('batchRead')}` : ''}
          {parsed && !parsed.fatal && parsed.skipped > 0 ? ` · ${parsed.skipped} ${t('batchExSkipped')}` : ''}
        </p>
      )}

      <p className="route-note">{t('batchHowTo')}</p>
      <p className="route-note warn">{t('batchPrivacy')}</p>

      {parsed?.fatal && <div className="detail-empty">{parsed.fatal[lang]}</div>}

      {parsed && !parsed.fatal && parsed.problems.length > 0 && (
        <>
          <h3 className="sec-title alt-title">
            {t('batchProblems')} <span className="detail-count">{parsed.problems.length}</span>
          </h3>
          <ul className="batch-problems">
            {parsed.problems.map((p, i) => (
              <li key={`${p.excelRow}-${p.field}-${i}`}>
                <b>
                  {t('batchRow')} {p.excelRow}
                </b>{' '}
                {p.message[lang]}
              </li>
            ))}
          </ul>
        </>
      )}

      {parsed && !parsed.fatal && parsed.rows.length === 0 && (
        <div className="detail-empty">{parsed.skipped > 0 ? t('batchOnlyExamples') : t('batchNoRows')}</div>
      )}
    </div>
  )
}
