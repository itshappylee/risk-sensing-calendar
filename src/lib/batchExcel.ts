import type { Lang } from './types'
import { COUNTRIES } from './locations'
import { EXAMPLE_PREFIX, FIELDS, MAX_ROWS } from './batchRoutes'

/**
 * 엑셀 양식 만들기 / 읽기 / 결과 내보내기.
 *
 * ExcelJS는 무겁다(≈900KB). **이 탭을 열 때만** 동적 import로 불러온다 —
 * 캘린더만 보는 사람의 화면이 느려지지 않게.
 *
 * ⚠️ 정해진 열만 다룬다. 사내 정보(화주·오더번호 등)는 읽지도 쓰지도 않는다
 *    (사용자 지시 2026-10-08). `batchRoutes.FIELDS` 참고.
 *
 * ⚠️ **파일은 화면 언어와 무관하게 항상 영어다** (사용자 지시 2026-10-15).
 *    이 파일들은 앱 밖으로 나간다 — 공유폴더에 두고 외국인 동료가 열어 채운다.
 *    화면 언어를 따라가면 누가 만들었느냐에 따라 한글 양식이 섞인다.
 */

type ExcelJSModule = typeof import('exceljs')
let cached: Promise<ExcelJSModule> | null = null

/**
 * ExcelJS를 가져온다.
 *
 * ⚠️ `.default`를 꼭 풀어 줘야 한다. exceljs는 CommonJS라, 번들러·런타임에 따라
 *    네임스페이스가 그대로 오기도 하고 `{ default: … }`로 한 겹 싸여 오기도 한다.
 *    한쪽만 가정하면 "ExcelJS.Workbook is not a constructor"로 터진다 (2026-10-14 테스트에서 잡음).
 */
const loadExcel = (): Promise<ExcelJSModule> =>
  (cached ??= import('exceljs').then((m) => {
    const mod = m as ExcelJSModule & { default?: ExcelJSModule }
    return mod.default ?? mod
  }))

/** 파일 안의 글자는 전부 영어다. 화면 언어를 따르지 않는다 (위 주석 참고) */
const FILE_LANG: Lang = 'en'

const SHEET = { routes: 'Routes', countries: 'Countries' }

const MODE_CHOICES = ['Road', 'Rail', 'Air', 'Sea']

const TXT = {
  guide: `One route per row. Transport, Origin and Destination are drop-downs. Up to ${MAX_ROWS} rows. Do not put internal data such as customer or order numbers here — it is not read.`,
  countryGuide: 'Use these names exactly (copy & paste is fine). Country codes such as ES are not accepted.',
  badValue: 'Please choose a value from the list',
  countryHead: 'Country (official English name)',
}

function download(bytes: ArrayBuffer, filename: string) {
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 빈 양식 파일을 만들어 내려받는다 */
export async function downloadTemplate(): Promise<void> {
  download(await buildTemplate(), 'route-list-template.xlsx')
}

/**
 * 양식 통합문서를 만든다. **DOM을 쓰지 않는다** — 그래야 테스트에서 그대로 부를 수 있다.
 * (`scripts/check-batch.ts`가 이걸 만들어 바로 다시 읽어 본다)
 */
export async function buildTemplate(): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Risk Sensing'
  wb.created = new Date()

  const cName = SHEET.countries
  const ws = wb.addWorksheet(SHEET.routes)
  const cs = wb.addWorksheet(cName)

  // ── 국가목록 시트 ──
  cs.getCell('A1').value = TXT.countryHead
  cs.getCell('A1').font = { bold: true }
  cs.getCell('C1').value = TXT.countryGuide
  cs.getColumn(1).width = 26
  cs.getColumn(3).width = 70
  COUNTRIES.forEach((c, i) => { cs.getCell(`A${i + 2}`).value = c })
  const countryRange = `'${cName}'!$A$2:$A$${COUNTRIES.length + 1}`

  // ── 노선목록 시트 ──
  ws.mergeCells('A1:G1')
  ws.getCell('A1').value = TXT.guide
  ws.getCell('A1').alignment = { wrapText: true, vertical: 'middle' }
  ws.getCell('A1').font = { size: 10, color: { argb: 'FF6B7280' } }
  ws.getRow(1).height = 34

  FIELDS.forEach((f, i) => {
    const cell = ws.getCell(2, i + 1)
    cell.value = f.header[FILE_LANG] + (f.required ? ' *' : '')
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F3' } }
  })
  ws.getRow(2).height = 20
  ws.views = [{ state: 'frozen', ySplit: 2 }]
  ;[22, 13, 20, 20, 24, 14, 11].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // 예시 두 줄 — 지우고 쓰라고 옅게
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const plus = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  const samples = [
    [`${EXAMPLE_PREFIX}Slovakia → Spain`, 'Road', 'Slovakia', 'Spain', '', iso(plus(7)), 5],
    [`${EXAMPLE_PREFIX}Slovakia → Italy`, 'Road', 'Slovakia', 'Italy', 'Austria', iso(plus(10)), 3],
  ]
  samples.forEach((s, r) => {
    s.forEach((v, c) => {
      const cell = ws.getCell(3 + r, c + 1)
      cell.value = v as string | number
      cell.font = { color: { argb: 'FF9CA3AF' }, italic: true }
    })
  })

  // 드롭다운 — 운송수단(B) · 출발국(C) · 도착국(D)
  const lastRow = MAX_ROWS + 2
  for (let r = 3; r <= lastRow; r++) {
    ws.getCell(`B${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`"${MODE_CHOICES.join(',')}"`],
      showErrorMessage: true, errorStyle: 'warning', error: TXT.badValue,
    }
    for (const col of ['C', 'D']) {
      ws.getCell(`${col}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [countryRange],
        showErrorMessage: true, errorStyle: 'warning', error: TXT.badValue,
      }
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/** 업로드한 파일을 셀 배열로 읽는다. 첫 시트만 본다 */
export async function readWorkbook(file: File): Promise<unknown[][]> {
  return readBuffer(await file.arrayBuffer())
}

/** 버퍼에서 바로 읽는다 — 테스트와 업로드가 같은 길을 쓰도록 */
export async function readBuffer(data: ArrayBuffer): Promise<unknown[][]> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)
  const ws = wb.worksheets[0]
  if (!ws) return []
  const out: unknown[][] = []
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const line: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value
      // 수식 셀은 계산값을 쓴다. 하이퍼링크 셀은 보이는 글자를 쓴다
      if (v && typeof v === 'object') {
        if ('result' in v) line[colNumber - 1] = (v as { result: unknown }).result
        else if ('text' in v) line[colNumber - 1] = (v as { text: unknown }).text
        else if ('richText' in v) line[colNumber - 1] = (v as { richText: { text: string }[] }).richText.map((p) => p.text).join('')
        else line[colNumber - 1] = v
      } else line[colNumber - 1] = v
    })
    out[rowNumber - 1] = line
  })
  return out
}
