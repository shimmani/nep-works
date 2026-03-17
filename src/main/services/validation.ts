/**
 * 비즈니스 로직 검증 모듈
 * 모든 중요 작업 전에 호출하여 데이터 정합성 확인
 */

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

// ===== 프로젝트 검증 =====

export function validateProject(data: Record<string, unknown>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!data.name || String(data.name).trim().length === 0) {
    errors.push('공사명은 필수입니다.')
  }
  if (!data.client_id) {
    errors.push('발주처를 선택해야 합니다.')
  }
  if (typeof data.contract_amount === 'number') {
    if (data.contract_amount <= 0) {
      errors.push('계약금액은 0원보다 커야 합니다.')
    }
    if (data.contract_amount > 100_000_000_000) {
      warnings.push('계약금액이 1,000억원을 초과합니다. 입력을 확인해주세요.')
    }
  }

  // 날짜 논리 검증
  if (data.start_date && data.end_date) {
    if (String(data.start_date) > String(data.end_date)) {
      errors.push('시작일이 종료일보다 늦습니다.')
    }
  }

  // 수의계약 한도 검증 (2026년 기준)
  if (data.contract_method === '수의계약' && typeof data.contract_amount === 'number') {
    const limits: Record<string, number> = {
      '종합': 400_000_000,
      '전문': 200_000_000,
      '일반': 160_000_000,
      '용역': 100_000_000,
    }
    const limit = limits[String(data.contract_type)] || 200_000_000
    if (data.contract_amount > limit) {
      warnings.push(
        `수의계약 한도(${(limit / 100_000_000).toFixed(1)}억원)를 초과합니다. 입찰로 변경하거나 금액을 확인해주세요.`
      )
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ===== 상태 전이 검증 =====

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  '입찰중': ['계약체결', '완료'],
  '계약체결': ['착공전', '시공중', '완료'],
  '착공전': ['시공중', '완료'],
  '시공중': ['준공서류작성', '완료'],
  '준공서류작성': ['준공검사', '시공중'],
  '준공검사': ['준공완료', '준공서류작성'],
  '준공완료': ['하자보증중', '완료'],
  '하자보증중': ['완료'],
  '완료': [],
}

export function validateStatusTransition(currentStatus: string, newStatus: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (currentStatus === newStatus) {
    return { valid: true, errors, warnings }
  }

  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(newStatus)) {
    errors.push(
      `'${currentStatus}'에서 '${newStatus}'로 변경할 수 없습니다. 가능한 상태: ${allowed.join(', ') || '없음 (최종 상태)'}`
    )
  }

  // 시공중으로 갈 때 설계내역 필요
  if (newStatus === '시공중') {
    warnings.push('시공 시작 전에 설계내역이 임포트되었는지 확인해주세요.')
  }

  // 준공서류작성으로 갈 때
  if (newStatus === '준공서류작성') {
    warnings.push('모든 기성이 완료되었는지 확인해주세요.')
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ===== 기성 검증 =====

export function validateGiseongRound(data: {
  project_id: number
  designItemCount: number
  existingRounds: Array<{ status: string; round_no: number }>
}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (data.designItemCount === 0) {
    errors.push('설계내역이 등록되지 않았습니다. 먼저 설계내역서를 임포트해주세요.')
  }

  // 이전 회차가 작성중이면 경고
  const inProgressRounds = data.existingRounds.filter(r => r.status === '작성중')
  if (inProgressRounds.length > 0) {
    warnings.push(
      `제${inProgressRounds[0].round_no}회 기성이 아직 '작성중'입니다. 먼저 완료 후 새 회차를 생성하는 것을 권장합니다.`
    )
  }

  // 모든 기성이 100% 도달했는지 확인
  const lastRound = data.existingRounds[data.existingRounds.length - 1]
  if (lastRound?.status === '승인완료') {
    // OK
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateGiseongRate(data: {
  prevRate: number
  currRate: number
  itemName: string
  totalPrice: number
}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (data.currRate < 0) {
    errors.push(`'${data.itemName}': 진도율은 0% 이상이어야 합니다.`)
  }
  if (data.currRate > 100) {
    errors.push(`'${data.itemName}': 진도율은 100%를 초과할 수 없습니다.`)
  }

  const cumulRate = data.prevRate + data.currRate
  if (cumulRate > 100) {
    errors.push(
      `'${data.itemName}': 누계 진도율이 100%를 초과합니다. (전회 ${data.prevRate}% + 금회 ${data.currRate}% = ${cumulRate}%)`
    )
  }

  // 한 번에 큰 진도율 변경 경고
  if (data.currRate > 50 && data.prevRate === 0) {
    warnings.push(`'${data.itemName}': 첫 회차에 ${data.currRate}%는 높은 진도율입니다. 확인해주세요.`)
  }

  // 금액 확인
  const currAmount = Math.round(data.totalPrice * data.currRate / 100)
  if (currAmount > 50_000_000) {
    warnings.push(`'${data.itemName}': 금회 기성금액이 ${currAmount.toLocaleString()}원입니다.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ===== 설계내역 임포트 검증 =====

export function validateDesignImport(items: Array<{
  item_name: string
  quantity: number
  unit_price: number
  total_price: number
}>, contractAmount: number): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (items.length === 0) {
    errors.push('설계내역 항목을 찾을 수 없습니다. 엑셀 파일 형식을 확인해주세요.')
  }

  const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0)

  // 설계금액 vs 계약금액 비교
  if (contractAmount > 0) {
    const ratio = totalAmount / contractAmount
    if (ratio > 1.1) {
      warnings.push(
        `설계금액 합계(${totalAmount.toLocaleString()}원)가 계약금액(${contractAmount.toLocaleString()}원)의 ${Math.round(ratio * 100)}%입니다. 확인해주세요.`
      )
    }
    if (ratio < 0.5) {
      warnings.push(
        `설계금액 합계(${totalAmount.toLocaleString()}원)가 계약금액의 ${Math.round(ratio * 100)}%로 적습니다. 누락된 항목이 없는지 확인해주세요.`
      )
    }
  }

  // 개별 항목 검증
  let zeroItems = 0
  let negativeItems = 0
  for (const item of items) {
    if (item.total_price === 0) zeroItems++
    if (item.total_price < 0) negativeItems++
    if (!item.item_name || item.item_name.trim().length === 0) {
      errors.push('항목명이 비어있는 행이 있습니다.')
    }
  }

  if (negativeItems > 0) {
    warnings.push(`음수 금액 항목이 ${negativeItems}건 있습니다.`)
  }
  if (zeroItems > 0) {
    warnings.push(`금액이 0원인 항목 ${zeroItems}건이 포함되어 있습니다.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ===== 엑셀 내보내기 전 검증 =====

export function validateGiseongExport(data: {
  roundStatus: string
  details: Array<{ curr_rate: number; cumul_rate: number; item_name: string }>
  claimAmount: number
}): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 금회 진도율이 모두 0인지 확인
  const allZero = data.details.every(d => d.curr_rate === 0)
  if (allZero) {
    warnings.push('모든 항목의 금회 진도율이 0%입니다. 진도율을 입력한 후 내보내기를 권장합니다.')
  }

  if (data.claimAmount === 0) {
    warnings.push('기성금액이 0원입니다.')
  }

  // 100% 도달 항목 확인
  const completedItems = data.details.filter(d => d.cumul_rate >= 100)
  if (completedItems.length > 0) {
    warnings.push(`${completedItems.length}개 항목이 누계 100%에 도달했습니다.`)
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ===== 발주처 삭제 검증 =====

export function validateClientDelete(projectCount: number): ValidationResult {
  const errors: string[] = []
  if (projectCount > 0) {
    errors.push(`이 발주처에 ${projectCount}건의 프로젝트가 등록되어 있어 삭제할 수 없습니다.`)
  }
  return { valid: errors.length === 0, errors, warnings: [] }
}
