import { describe, it, expect } from 'vitest'
import {
  validateProject,
  validateStatusTransition,
  validateGiseongRound,
  validateGiseongRate,
  validateDesignImport,
  validateGiseongExport,
} from '../src/main/services/validation'

// ===== validateProject (30 tests) =====

describe('validateProject', () => {
  it('1. empty name returns error', () => {
    const r = validateProject({ name: '', client_id: 1, contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('공사명은 필수입니다.')
  })

  it('2. whitespace-only name returns error', () => {
    const r = validateProject({ name: '   ', client_id: 1, contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('공사명은 필수입니다.')
  })

  it('3. missing client_id returns error', () => {
    const r = validateProject({ name: '테스트공사', contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('발주처를 선택해야 합니다.')
  })

  it('4. zero contract_amount returns error', () => {
    const r = validateProject({ name: '테스트공사', client_id: 1, contract_amount: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('계약금액은 0원보다 커야 합니다.')
  })

  it('5. negative contract_amount returns error', () => {
    const r = validateProject({ name: '테스트공사', client_id: 1, contract_amount: -5000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('계약금액은 0원보다 커야 합니다.')
  })

  it('6. valid basic project returns valid=true', () => {
    const r = validateProject({ name: '테스트공사', client_id: 1, contract_amount: 50_000_000 })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('7. amount > 100 billion warns about large amount', () => {
    const r = validateProject({ name: '테스트공사', client_id: 1, contract_amount: 100_000_000_001 })
    expect(r.valid).toBe(true)
    expect(r.warnings).toContain('계약금액이 1,000억원을 초과합니다. 입력을 확인해주세요.')
  })

  it('8. start_date after end_date returns error', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 1000, start_date: '2026-06-01', end_date: '2026-01-01' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('시작일이 종료일보다 늦습니다.')
  })

  it('9. same start/end date is valid', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 1000, start_date: '2026-06-01', end_date: '2026-06-01' })
    expect(r.valid).toBe(true)
  })

  it('10. no dates is valid', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 1000 })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('11. 수의계약 + 종합 > 4억 warns', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 400_000_001, contract_method: '수의계약', contract_type: '종합' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(true)
  })

  it('12. 수의계약 + 종합 = 4억 no warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 400_000_000, contract_method: '수의계약', contract_type: '종합' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(false)
  })

  it('13. 수의계약 + 종합 < 4억 no warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 300_000_000, contract_method: '수의계약', contract_type: '종합' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(false)
  })

  it('14. 수의계약 + 전문 > 2억 warns', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 200_000_001, contract_method: '수의계약', contract_type: '전문' })
    expect(r.warnings.some(w => w.includes('수의계약 한도(2.0억원)'))).toBe(true)
  })

  it('15. 수의계약 + 전문 = 2억 no warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 200_000_000, contract_method: '수의계약', contract_type: '전문' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(false)
  })

  it('16. 수의계약 + 일반 > 1.6억 warns', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 160_000_001, contract_method: '수의계약', contract_type: '일반' })
    expect(r.warnings.some(w => w.includes('수의계약 한도(1.6억원)'))).toBe(true)
  })

  it('17. 수의계약 + 용역 > 1억 warns', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 100_000_001, contract_method: '수의계약', contract_type: '용역' })
    expect(r.warnings.some(w => w.includes('수의계약 한도(1.0억원)'))).toBe(true)
  })

  it('18. 입찰 + any amount no limit warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 999_000_000, contract_method: '입찰', contract_type: '종합' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(false)
  })

  it('19. multiple errors at once (no name + no client)', () => {
    const r = validateProject({ name: '', contract_amount: -1 })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it('20. amount exactly at 100 billion boundary - no warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 100_000_000_000 })
    expect(r.warnings.some(w => w.includes('1,000억원'))).toBe(false)
  })

  it('21. null name returns error', () => {
    const r = validateProject({ name: null, client_id: 1, contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('공사명은 필수입니다.')
  })

  it('22. undefined name returns error', () => {
    const r = validateProject({ client_id: 1, contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('공사명은 필수입니다.')
  })

  it('23. client_id = 0 (falsy) returns error', () => {
    const r = validateProject({ name: '테스트', client_id: 0, contract_amount: 1000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('발주처를 선택해야 합니다.')
  })

  it('24. contract_amount as string is not validated as number', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: '5000' })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('25. 수의계약 with unknown contract_type uses 2억 default', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 200_000_001, contract_method: '수의계약', contract_type: '기타' })
    expect(r.warnings.some(w => w.includes('수의계약 한도(2.0억원)'))).toBe(true)
  })

  it('26. 수의계약 with no contract_type uses 2억 default', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 200_000_001, contract_method: '수의계약' })
    expect(r.warnings.some(w => w.includes('수의계약 한도(2.0억원)'))).toBe(true)
  })

  it('27. start_date only, no end_date - valid', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 1000, start_date: '2026-01-01' })
    expect(r.valid).toBe(true)
  })

  it('28. end_date only, no start_date - valid', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 1000, end_date: '2026-12-31' })
    expect(r.valid).toBe(true)
  })

  it('29. contract_amount missing entirely - valid (not type number)', () => {
    const r = validateProject({ name: '테스트', client_id: 1 })
    expect(r.errors).not.toContain('계약금액은 0원보다 커야 합니다.')
  })

  it('30. 수의계약 + 일반 = 1.6억 exactly no warning', () => {
    const r = validateProject({ name: '테스트', client_id: 1, contract_amount: 160_000_000, contract_method: '수의계약', contract_type: '일반' })
    expect(r.warnings.some(w => w.includes('수의계약 한도'))).toBe(false)
  })
})

// ===== validateStatusTransition (20 tests) =====

describe('validateStatusTransition', () => {
  it('31. 입찰중 → 계약체결 valid', () => {
    const r = validateStatusTransition('입찰중', '계약체결')
    expect(r.valid).toBe(true)
  })

  it('32. 입찰중 → 완료 valid', () => {
    const r = validateStatusTransition('입찰중', '완료')
    expect(r.valid).toBe(true)
  })

  it('33. 계약체결 → 착공전 valid', () => {
    const r = validateStatusTransition('계약체결', '착공전')
    expect(r.valid).toBe(true)
  })

  it('34. 계약체결 → 시공중 valid with warning', () => {
    const r = validateStatusTransition('계약체결', '시공중')
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('설계내역'))).toBe(true)
  })

  it('35. 착공전 → 시공중 valid with design warning', () => {
    const r = validateStatusTransition('착공전', '시공중')
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('설계내역이 임포트'))).toBe(true)
  })

  it('36. 시공중 → 준공서류작성 valid with giseong warning', () => {
    const r = validateStatusTransition('시공중', '준공서류작성')
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('기성이 완료'))).toBe(true)
  })

  it('37. 준공서류작성 → 준공검사 valid', () => {
    const r = validateStatusTransition('준공서류작성', '준공검사')
    expect(r.valid).toBe(true)
  })

  it('38. 준공검사 → 준공완료 valid', () => {
    const r = validateStatusTransition('준공검사', '준공완료')
    expect(r.valid).toBe(true)
  })

  it('39. 준공완료 → 하자보증중 valid', () => {
    const r = validateStatusTransition('준공완료', '하자보증중')
    expect(r.valid).toBe(true)
  })

  it('40. 하자보증중 → 완료 valid', () => {
    const r = validateStatusTransition('하자보증중', '완료')
    expect(r.valid).toBe(true)
  })

  it('41. 입찰중 → 시공중 invalid', () => {
    const r = validateStatusTransition('입찰중', '시공중')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('변경할 수 없습니다')
  })

  it('42. 착공전 → 입찰중 invalid', () => {
    const r = validateStatusTransition('착공전', '입찰중')
    expect(r.valid).toBe(false)
  })

  it('43. same status → valid', () => {
    const r = validateStatusTransition('시공중', '시공중')
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('44. 완료 → 입찰중 error (terminal state)', () => {
    const r = validateStatusTransition('완료', '입찰중')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('최종 상태')
  })

  it('45. 완료 → 시공중 error (terminal state)', () => {
    const r = validateStatusTransition('완료', '시공중')
    expect(r.valid).toBe(false)
  })

  it('46. 완료 → 완료 same status valid', () => {
    const r = validateStatusTransition('완료', '완료')
    expect(r.valid).toBe(true)
  })

  it('47. 준공서류작성 → 시공중 valid (rollback) with design warning', () => {
    const r = validateStatusTransition('준공서류작성', '시공중')
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('설계내역'))).toBe(true)
  })

  it('48. 준공검사 → 준공서류작성 valid (rollback) with giseong warning', () => {
    const r = validateStatusTransition('준공검사', '준공서류작성')
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('기성'))).toBe(true)
  })

  it('49. unknown status has no allowed transitions', () => {
    const r = validateStatusTransition('알수없음', '입찰중')
    expect(r.valid).toBe(false)
  })

  it('50. 시공중 → 완료 valid', () => {
    const r = validateStatusTransition('시공중', '완료')
    expect(r.valid).toBe(true)
  })
})

// ===== validateGiseongRound (15 tests) =====

describe('validateGiseongRound', () => {
  it('51. no design items returns error', () => {
    const r = validateGiseongRound({ project_id: 1, designItemCount: 0, existingRounds: [] })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('설계내역이 등록되지 않았습니다')
  })

  it('52. has design items, no existing rounds is valid', () => {
    const r = validateGiseongRound({ project_id: 1, designItemCount: 10, existingRounds: [] })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('53. previous round 작성중 warns', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 5,
      existingRounds: [{ status: '작성중', round_no: 1 }],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('제1회 기성이 아직'))).toBe(true)
  })

  it('54. multiple rounds, last completed is valid with no warnings', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 10,
      existingRounds: [
        { status: '승인완료', round_no: 1 },
        { status: '승인완료', round_no: 2 },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('55. zero design items with existing rounds returns error', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 0,
      existingRounds: [{ status: '승인완료', round_no: 1 }],
    })
    expect(r.valid).toBe(false)
  })

  it('56. single design item is valid', () => {
    const r = validateGiseongRound({ project_id: 1, designItemCount: 1, existingRounds: [] })
    expect(r.valid).toBe(true)
  })

  it('57. multiple rounds with one 작성중 warns about first found', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 5,
      existingRounds: [
        { status: '승인완료', round_no: 1 },
        { status: '작성중', round_no: 2 },
      ],
    })
    expect(r.warnings.some(w => w.includes('제2회'))).toBe(true)
  })

  it('58. all rounds 승인완료 no warnings', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 20,
      existingRounds: [
        { status: '승인완료', round_no: 1 },
        { status: '승인완료', round_no: 2 },
        { status: '승인완료', round_no: 3 },
      ],
    })
    expect(r.warnings).toHaveLength(0)
  })

  it('59. large designItemCount is valid', () => {
    const r = validateGiseongRound({ project_id: 1, designItemCount: 5000, existingRounds: [] })
    expect(r.valid).toBe(true)
  })

  it('60. round with status 제출완료 no warning', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 5,
      existingRounds: [{ status: '제출완료', round_no: 1 }],
    })
    expect(r.warnings).toHaveLength(0)
  })

  it('61. two 작성중 rounds warns about first one only', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 5,
      existingRounds: [
        { status: '작성중', round_no: 1 },
        { status: '작성중', round_no: 2 },
      ],
    })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('제1회')
  })

  it('62. project_id does not affect validation', () => {
    const r = validateGiseongRound({ project_id: 999, designItemCount: 5, existingRounds: [] })
    expect(r.valid).toBe(true)
  })

  it('63. errors and warnings can coexist (0 items + 작성중 round)', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 0,
      existingRounds: [{ status: '작성중', round_no: 1 }],
    })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('64. round_no high number is fine', () => {
    const r = validateGiseongRound({
      project_id: 1,
      designItemCount: 10,
      existingRounds: [{ status: '작성중', round_no: 99 }],
    })
    expect(r.warnings[0]).toContain('제99회')
  })

  it('65. empty existingRounds array no warnings', () => {
    const r = validateGiseongRound({ project_id: 1, designItemCount: 3, existingRounds: [] })
    expect(r.warnings).toHaveLength(0)
  })
})

// ===== validateGiseongRate (20 tests) =====

describe('validateGiseongRate', () => {
  const base = { itemName: '철근콘크리트', totalPrice: 10_000_000 }

  it('66. currRate negative returns error', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: -1, ...base })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('0% 이상')
  })

  it('67. currRate > 100 returns error', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 101, ...base })
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('100%를 초과')
  })

  it('68. cumul > 100 returns error', () => {
    const r = validateGiseongRate({ prevRate: 60, currRate: 50, ...base })
    expect(r.valid).toBe(false)
    expect(r.errors.some(e => e.includes('누계 진도율이 100%를 초과'))).toBe(true)
  })

  it('69. prevRate 80 + currRate 20 = 100 valid', () => {
    const r = validateGiseongRate({ prevRate: 80, currRate: 20, ...base })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('70. prevRate 80 + currRate 21 = 101 error', () => {
    const r = validateGiseongRate({ prevRate: 80, currRate: 21, ...base })
    expect(r.valid).toBe(false)
    expect(r.errors.some(e => e.includes('101%'))).toBe(true)
  })

  it('71. currRate 0 is valid', () => {
    const r = validateGiseongRate({ prevRate: 50, currRate: 0, ...base })
    expect(r.valid).toBe(true)
  })

  it('72. first round > 50% warns', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 51, ...base })
    expect(r.warnings.some(w => w.includes('높은 진도율'))).toBe(true)
  })

  it('73. large amount warns', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 10, itemName: '대형공사', totalPrice: 600_000_000 })
    expect(r.warnings.some(w => w.includes('금회 기성금액'))).toBe(true)
  })

  it('74. currRate exactly 50 on first round no warning (boundary >50)', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 50, ...base })
    expect(r.warnings.some(w => w.includes('높은 진도율'))).toBe(false)
  })

  it('75. currRate 100 valid when prevRate 0', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 100, ...base })
    expect(r.valid).toBe(true)
  })

  it('76. currRate 100 + prevRate 1 = 101 error', () => {
    const r = validateGiseongRate({ prevRate: 1, currRate: 100, ...base })
    expect(r.valid).toBe(false)
  })

  it('77. small amount does not warn about 기성금액', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 10, itemName: '소규모', totalPrice: 1_000_000 })
    expect(r.warnings.some(w => w.includes('금회 기성금액'))).toBe(false)
  })

  it('78. exactly 50_000_000 amount no warning (threshold is >50M)', () => {
    // 100% of 50_000_000 = 50_000_000, not > 50M
    const r = validateGiseongRate({ prevRate: 0, currRate: 100, itemName: '경계', totalPrice: 50_000_000 })
    expect(r.warnings.some(w => w.includes('금회 기성금액'))).toBe(false)
  })

  it('79. prevRate 99 + currRate 1 = 100 valid', () => {
    const r = validateGiseongRate({ prevRate: 99, currRate: 1, ...base })
    expect(r.valid).toBe(true)
  })

  it('80. negative currRate and > 100 currRate both caught', () => {
    const r1 = validateGiseongRate({ prevRate: 0, currRate: -5, ...base })
    const r2 = validateGiseongRate({ prevRate: 0, currRate: 105, ...base })
    expect(r1.valid).toBe(false)
    expect(r2.valid).toBe(false)
  })

  it('81. error message includes item name', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: -1, itemName: '특수항목', totalPrice: 1000 })
    expect(r.errors[0]).toContain('특수항목')
  })

  it('82. warning message includes item name', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 60, ...base })
    expect(r.warnings[0]).toContain('철근콘크리트')
  })

  it('83. totalPrice 0 no amount warning', () => {
    const r = validateGiseongRate({ prevRate: 0, currRate: 30, itemName: '무가항목', totalPrice: 0 })
    expect(r.warnings.some(w => w.includes('금회 기성금액'))).toBe(false)
  })

  it('84. prevRate 50 + currRate 51 = 101 error with correct message', () => {
    const r = validateGiseongRate({ prevRate: 50, currRate: 51, ...base })
    expect(r.errors.some(e => e.includes('전회 50%') && e.includes('금회 51%'))).toBe(true)
  })

  it('85. amount just over 50M warns', () => {
    // 50_000_001 * 100 / 100 = 50_000_001 > 50M
    const r = validateGiseongRate({ prevRate: 0, currRate: 100, itemName: '경계초과', totalPrice: 50_000_001 })
    expect(r.warnings.some(w => w.includes('금회 기성금액'))).toBe(true)
  })
})

// ===== validateDesignImport (10 tests) =====

describe('validateDesignImport', () => {
  const item = (name: string, price: number) => ({
    item_name: name,
    quantity: 1,
    unit_price: price,
    total_price: price,
  })

  it('86. empty items returns error', () => {
    const r = validateDesignImport([], 100_000_000)
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('설계내역 항목을 찾을 수 없습니다')
  })

  it('87. total much higher than contract warns', () => {
    const items = [item('A', 120_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.warnings.some(w => w.includes('120%'))).toBe(true)
  })

  it('88. total much lower than contract warns', () => {
    const items = [item('A', 40_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.warnings.some(w => w.includes('40%') && w.includes('적습니다'))).toBe(true)
  })

  it('89. normal ratio no warning', () => {
    const items = [item('A', 95_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.warnings.some(w => w.includes('%'))).toBe(false)
  })

  it('90. items with zero prices warns', () => {
    const items = [item('A', 0), item('B', 50_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.warnings.some(w => w.includes('0원인 항목'))).toBe(true)
  })

  it('91. items with negative prices warns', () => {
    const items = [item('A', -5000), item('B', 50_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.warnings.some(w => w.includes('음수 금액'))).toBe(true)
  })

  it('92. missing item names returns error', () => {
    const items = [{ item_name: '', quantity: 1, unit_price: 1000, total_price: 1000 }]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.valid).toBe(false)
    expect(r.errors.some(e => e.includes('항목명이 비어있는'))).toBe(true)
  })

  it('93. zero contract amount no ratio warning', () => {
    const items = [item('A', 50_000_000)]
    const r = validateDesignImport(items, 0)
    expect(r.warnings.some(w => w.includes('%'))).toBe(false)
  })

  it('94. whitespace-only item name returns error', () => {
    const items = [{ item_name: '   ', quantity: 1, unit_price: 1000, total_price: 1000 }]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.valid).toBe(false)
    expect(r.errors.some(e => e.includes('항목명이 비어있는'))).toBe(true)
  })

  it('95. multiple items all valid no errors', () => {
    const items = [item('A', 30_000_000), item('B', 30_000_000), item('C', 30_000_000)]
    const r = validateDesignImport(items, 100_000_000)
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })
})

// ===== validateGiseongExport (5 tests) =====

describe('validateGiseongExport', () => {
  it('96. all zero rates warns', () => {
    const r = validateGiseongExport({
      roundStatus: '작성중',
      details: [
        { curr_rate: 0, cumul_rate: 0, item_name: 'A' },
        { curr_rate: 0, cumul_rate: 0, item_name: 'B' },
      ],
      claimAmount: 0,
    })
    expect(r.warnings.some(w => w.includes('금회 진도율이 0%'))).toBe(true)
  })

  it('97. zero claim amount warns', () => {
    const r = validateGiseongExport({
      roundStatus: '작성중',
      details: [{ curr_rate: 10, cumul_rate: 10, item_name: 'A' }],
      claimAmount: 0,
    })
    expect(r.warnings.some(w => w.includes('기성금액이 0원'))).toBe(true)
  })

  it('98. some items at 100% warns', () => {
    const r = validateGiseongExport({
      roundStatus: '작성중',
      details: [
        { curr_rate: 50, cumul_rate: 100, item_name: 'A' },
        { curr_rate: 10, cumul_rate: 30, item_name: 'B' },
      ],
      claimAmount: 5_000_000,
    })
    expect(r.warnings.some(w => w.includes('1개 항목이 누계 100%에 도달'))).toBe(true)
  })

  it('99. normal data no errors', () => {
    const r = validateGiseongExport({
      roundStatus: '작성중',
      details: [
        { curr_rate: 20, cumul_rate: 40, item_name: 'A' },
        { curr_rate: 15, cumul_rate: 30, item_name: 'B' },
      ],
      claimAmount: 10_000_000,
    })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('100. mix of warnings', () => {
    const r = validateGiseongExport({
      roundStatus: '작성중',
      details: [
        { curr_rate: 0, cumul_rate: 100, item_name: 'A' },
        { curr_rate: 0, cumul_rate: 50, item_name: 'B' },
      ],
      claimAmount: 0,
    })
    expect(r.warnings.length).toBeGreaterThanOrEqual(3)
    expect(r.warnings.some(w => w.includes('진도율이 0%'))).toBe(true)
    expect(r.warnings.some(w => w.includes('기성금액이 0원'))).toBe(true)
    expect(r.warnings.some(w => w.includes('100%에 도달'))).toBe(true)
  })
})
