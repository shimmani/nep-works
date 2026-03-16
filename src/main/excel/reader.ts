import ExcelJS from 'exceljs'

interface DesignItemRow {
  category: string
  subcategory: string | null
  item_name: string
  unit: string
  quantity: number
  unit_price: number
  total_price: number
  cost_type: '재료비' | '노무비' | '경비'
}

/**
 * 설계내역서 엑셀 파일을 파싱하여 항목 목록으로 반환
 *
 * 일반적인 설계내역서 엑셀 구조:
 * A: 대분류(공종)  B: 중분류  C: 항목명  D: 단위  E: 수량  F: 단가  G: 금액
 *
 * 유연하게 파싱: 헤더 행을 찾아서 자동 매핑
 */
export async function importDesignFromExcel(filePath: string): Promise<DesignItemRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('엑셀 파일에 시트가 없습니다.')

  // 헤더 행 찾기 (항목명/품명 등의 키워드로 탐색)
  const headerKeywords = {
    item_name: ['항목명', '품명', '공종명', '세부공종', '명칭', '내역'],
    unit: ['단위', '규격'],
    quantity: ['수량', '물량'],
    unit_price: ['단가'],
    total_price: ['금액', '합계금액', '계'],
    category: ['대분류', '공종', '분류'],
  }

  let headerRow = -1
  const columnMap: Record<string, number> = {}

  // 1~20행 중에서 헤더 찾기
  for (let row = 1; row <= Math.min(20, sheet.rowCount); row++) {
    const rowData = sheet.getRow(row)
    let matchCount = 0

    rowData.eachCell((cell, colNumber) => {
      const value = String(cell.value || '').trim()
      for (const [key, keywords] of Object.entries(headerKeywords)) {
        if (keywords.some(kw => value.includes(kw)) && !columnMap[key]) {
          columnMap[key] = colNumber
          matchCount++
        }
      }
    })

    if (matchCount >= 3) {
      headerRow = row
      break
    }
  }

  // 헤더를 못 찾으면 기본 열 순서 사용
  if (headerRow === -1) {
    headerRow = 1
    columnMap.category = 1
    columnMap.item_name = 2
    columnMap.unit = 3
    columnMap.quantity = 4
    columnMap.unit_price = 5
    columnMap.total_price = 6
  }

  const items: DesignItemRow[] = []
  let currentCategory = ''

  for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
    const rowData = sheet.getRow(row)

    const itemName = getCellString(rowData, columnMap.item_name)
    if (!itemName) continue // 빈 행 건너뛰기

    const category = getCellString(rowData, columnMap.category)
    if (category) currentCategory = category

    const subcategory = columnMap.subcategory
      ? getCellString(rowData, columnMap.subcategory)
      : null

    const quantity = getCellNumber(rowData, columnMap.quantity)
    const unitPrice = getCellNumber(rowData, columnMap.unit_price)
    let totalPrice = getCellNumber(rowData, columnMap.total_price)

    // 금액이 없으면 수량 × 단가로 계산
    if (!totalPrice && quantity && unitPrice) {
      totalPrice = Math.round(quantity * unitPrice)
    }

    // 금액이 0인 항목은 소계/합계행일 수 있으므로 건너뛰기
    if (!totalPrice) continue

    items.push({
      category: currentCategory,
      subcategory,
      item_name: itemName,
      unit: getCellString(rowData, columnMap.unit) || '',
      quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      cost_type: guessCostType(currentCategory, itemName),
    })
  }

  if (items.length === 0) {
    throw new Error('설계내역 항목을 찾을 수 없습니다. 엑셀 파일 형식을 확인해주세요.')
  }

  return items
}

function getCellString(row: ExcelJS.Row, colNumber?: number): string {
  if (!colNumber) return ''
  const cell = row.getCell(colNumber)
  return String(cell.value || '').trim()
}

function getCellNumber(row: ExcelJS.Row, colNumber?: number): number {
  if (!colNumber) return 0
  const cell = row.getCell(colNumber)
  const val = cell.value
  if (typeof val === 'number') return val
  if (typeof val === 'string') {
    const num = parseFloat(val.replace(/,/g, ''))
    return isNaN(num) ? 0 : num
  }
  if (val && typeof val === 'object' && 'result' in val) {
    return typeof val.result === 'number' ? val.result : 0
  }
  return 0
}

function guessCostType(category: string, itemName: string): '재료비' | '노무비' | '경비' {
  const text = category + itemName
  if (text.includes('노무') || text.includes('인건') || text.includes('인부')) return '노무비'
  if (text.includes('경비') || text.includes('간접')) return '경비'
  return '재료비'
}
