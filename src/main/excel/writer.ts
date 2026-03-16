import ExcelJS from 'exceljs'
import Database from 'better-sqlite3'

interface GiseongDetailRow {
  category: string
  subcategory: string | null
  item_name: string
  unit: string
  quantity: number
  unit_price: number
  total_price: number
  cost_type: string
  prev_rate: number
  curr_rate: number
  cumul_rate: number
  prev_amount: number
  curr_amount: number
  cumul_amount: number
}

/**
 * 기성내역서 엑셀 내보내기
 */
export async function exportGiseongExcel(
  db: Database.Database,
  roundId: number,
  savePath: string
): Promise<{ success: boolean; path: string }> {
  // 기성 회차 정보
  const round = db.prepare(`
    SELECT gr.*, p.name as project_name, p.contract_amount, c.name as client_name
    FROM giseong_rounds gr
    JOIN projects p ON gr.project_id = p.id
    LEFT JOIN clients c ON p.client_id = c.id
    WHERE gr.id = ?
  `).get(roundId) as {
    round_no: number
    project_name: string
    contract_amount: number
    client_name: string
    claim_date: string | null
    claim_amount: number
  }

  if (!round) throw new Error('기성 회차를 찾을 수 없습니다.')

  // 기성 상세
  const details = db.prepare(`
    SELECT gd.*, di.category, di.subcategory, di.item_name, di.unit, di.quantity,
           di.unit_price, di.total_price, di.cost_type
    FROM giseong_details gd
    JOIN design_items di ON gd.item_id = di.id
    WHERE gd.round_id = ?
    ORDER BY di.sort_order
  `).all(roundId) as GiseongDetailRow[]

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'NEP-WORKS'
  workbook.created = new Date()

  // === 기성내역서 시트 ===
  const sheet = workbook.addWorksheet('기성내역서', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
    }
  })

  // 열 너비 설정
  sheet.columns = [
    { width: 5 },   // A: No
    { width: 15 },  // B: 공종
    { width: 25 },  // C: 항목명
    { width: 6 },   // D: 단위
    { width: 10 },  // E: 수량
    { width: 12 },  // F: 단가
    { width: 15 },  // G: 설계금액
    { width: 8 },   // H: 전회 비율
    { width: 15 },  // I: 전회 금액
    { width: 8 },   // J: 금회 비율
    { width: 15 },  // K: 금회 금액
    { width: 8 },   // L: 누계 비율
    { width: 15 },  // M: 누계 금액
  ]

  // 스타일 정의
  const titleStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 16 },
    alignment: { horizontal: 'center', vertical: 'middle' }
  }

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, size: 10 },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
  }

  const dataStyle: Partial<ExcelJS.Style> = {
    font: { size: 10 },
    alignment: { vertical: 'middle' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' }
    }
  }

  const numberFormat = '#,##0'
  const percentFormat = '0.0"%"'

  // 제목
  sheet.mergeCells('A1:M1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = `기 성 내 역 서 (제${round.round_no}회)`
  Object.assign(titleCell, { style: titleStyle })
  sheet.getRow(1).height = 35

  // 프로젝트 정보
  sheet.mergeCells('A2:C2')
  sheet.getCell('A2').value = `공 사 명: ${round.project_name}`
  sheet.getCell('A2').style = { font: { size: 10 } }

  sheet.mergeCells('D2:G2')
  sheet.getCell('D2').value = `발 주 처: ${round.client_name}`
  sheet.getCell('D2').style = { font: { size: 10 } }

  sheet.mergeCells('H2:J2')
  sheet.getCell('H2').value = `도급금액: ${round.contract_amount.toLocaleString()}원`
  sheet.getCell('H2').style = { font: { size: 10 } }

  sheet.mergeCells('K2:M2')
  sheet.getCell('K2').value = `기성일자: ${round.claim_date || ''}`
  sheet.getCell('K2').style = { font: { size: 10 } }

  // 헤더 (3~4행 병합)
  const headers = [
    ['No', 'A'], ['공종', 'B'], ['항목명', 'C'], ['단위', 'D'],
    ['수량', 'E'], ['단가', 'F'], ['설계금액', 'G'],
  ]

  headers.forEach(([label, col]) => {
    sheet.mergeCells(`${col}3:${col}4`)
    const cell = sheet.getCell(`${col}3`)
    cell.value = label
    Object.assign(cell, { style: headerStyle })
  })

  // 전회/금회/누계 병합 헤더
  sheet.mergeCells('H3:I3')
  sheet.getCell('H3').value = '전 회'
  Object.assign(sheet.getCell('H3'), { style: headerStyle })

  sheet.mergeCells('J3:K3')
  sheet.getCell('J3').value = '금 회'
  Object.assign(sheet.getCell('J3'), { style: headerStyle })

  sheet.mergeCells('L3:M3')
  sheet.getCell('L3').value = '누 계'
  Object.assign(sheet.getCell('L3'), { style: headerStyle })

  const subHeaders = [
    ['비율', 'H'], ['금액', 'I'],
    ['비율', 'J'], ['금액', 'K'],
    ['비율', 'L'], ['금액', 'M'],
  ]
  subHeaders.forEach(([label, col]) => {
    const cell = sheet.getCell(`${col}4`)
    cell.value = label
    Object.assign(cell, { style: headerStyle })
  })

  sheet.getRow(3).height = 20
  sheet.getRow(4).height = 20

  // 데이터 행
  let rowNum = 5
  let totalDesign = 0
  let totalPrev = 0
  let totalCurr = 0
  let totalCumul = 0

  details.forEach((item, idx) => {
    const row = sheet.getRow(rowNum)
    row.values = [
      idx + 1,
      item.category,
      item.item_name,
      item.unit,
      item.quantity,
      item.unit_price,
      item.total_price,
      item.prev_rate,
      item.prev_amount,
      item.curr_rate,
      item.curr_amount,
      item.cumul_rate,
      item.cumul_amount,
    ]

    // 스타일 적용
    for (let col = 1; col <= 13; col++) {
      const cell = row.getCell(col)
      Object.assign(cell, { style: { ...dataStyle } })

      // 숫자 포맷
      if ([5, 6, 7, 9, 11, 13].includes(col)) {
        cell.numFmt = numberFormat
        cell.style = { ...dataStyle, alignment: { ...dataStyle.alignment, horizontal: 'right' } }
      }
      if ([8, 10, 12].includes(col)) {
        cell.numFmt = percentFormat
        cell.style = { ...dataStyle, alignment: { ...dataStyle.alignment, horizontal: 'center' } }
      }
      if ([1, 4].includes(col)) {
        cell.style = { ...dataStyle, alignment: { ...dataStyle.alignment, horizontal: 'center' } }
      }
    }

    totalDesign += item.total_price
    totalPrev += item.prev_amount
    totalCurr += item.curr_amount
    totalCumul += item.cumul_amount
    rowNum++
  })

  // 합계 행
  const sumRow = sheet.getRow(rowNum)
  sheet.mergeCells(`A${rowNum}:C${rowNum}`)
  sumRow.getCell(1).value = '합  계'
  sumRow.getCell(7).value = totalDesign
  sumRow.getCell(9).value = totalPrev
  sumRow.getCell(11).value = totalCurr
  sumRow.getCell(13).value = totalCumul

  // 합계 비율
  if (totalDesign > 0) {
    sumRow.getCell(8).value = Math.round(totalPrev / totalDesign * 1000) / 10
    sumRow.getCell(10).value = Math.round(totalCurr / totalDesign * 1000) / 10
    sumRow.getCell(12).value = Math.round(totalCumul / totalDesign * 1000) / 10
  }

  for (let col = 1; col <= 13; col++) {
    const cell = sumRow.getCell(col)
    cell.style = {
      ...headerStyle,
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    }
    if ([7, 9, 11, 13].includes(col)) cell.numFmt = numberFormat
    if ([8, 10, 12].includes(col)) cell.numFmt = percentFormat
  }

  await workbook.xlsx.writeFile(savePath)
  return { success: true, path: savePath }
}
