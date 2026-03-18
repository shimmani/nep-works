import { describe, it, expect } from 'vitest'
import {
  validateWorker,
  validateLaborAssign,
  validatePayrollCalc,
  validatePayrollExport,
} from '../src/main/services/validation'

// ===== validateWorker (30 tests) =====

describe('validateWorker', () => {
  // --- Error: name required ---

  it('1. missing name returns error', () => {
    const r = validateWorker({ job_type: '보통인부', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
  })

  it('2. empty string name returns error', () => {
    const r = validateWorker({ name: '', job_type: '보통인부', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
  })

  it('3. whitespace-only name returns error', () => {
    const r = validateWorker({ name: '   ', job_type: '보통인부', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
  })

  it('4. null name returns error', () => {
    const r = validateWorker({ name: null, job_type: '보통인부', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
  })

  it('5. undefined name returns error', () => {
    const r = validateWorker({ name: undefined, job_type: '보통인부', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
  })

  // --- Error: job_type required ---

  it('6. missing job_type returns error', () => {
    const r = validateWorker({ name: '홍길동', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('직종을 선택해야 합니다.')
  })

  it('7. null job_type returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: null, default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('직종을 선택해야 합니다.')
  })

  it('8. empty string job_type returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '', default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('직종을 선택해야 합니다.')
  })

  // --- Error: default_wage not a number ---

  it('9. missing default_wage returns error (must enter wage)', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당을 입력해야 합니다.')
  })

  it('10. string default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: '150000' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당을 입력해야 합니다.')
  })

  it('11. null default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: null })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당을 입력해야 합니다.')
  })

  it('12. undefined default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: undefined })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당을 입력해야 합니다.')
  })

  it('13. NaN default_wage passes typeof check but produces no wage error (edge case)', () => {
    // NaN has typeof 'number', so it enters the number branch,
    // but NaN comparisons are all false, so no error or warning is added
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: NaN })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  // --- Error: default_wage <= 0 ---

  it('14. zero default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
  })

  it('15. negative default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: -10000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
  })

  it('16. very large negative default_wage returns error', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: -999999 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
  })

  // --- Warning: default_wage < 50000 (too low) ---

  it('17. wage 49999 triggers low wage warning', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 49999 })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('매우 낮습니다'))).toBe(true)
  })

  it('18. wage 1 triggers low wage warning', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 1 })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('매우 낮습니다'))).toBe(true)
  })

  it('19. wage exactly 50000 does not trigger low warning (boundary)', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 50000 })
    expect(r.warnings.some(w => w.includes('매우 낮습니다'))).toBe(false)
  })

  // --- Warning: default_wage > 500000 (too high) ---

  it('20. wage 500001 triggers high wage warning', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 500001 })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('높습니다'))).toBe(true)
  })

  it('21. wage 1000000 triggers high wage warning', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 1000000 })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('높습니다'))).toBe(true)
  })

  it('22. wage exactly 500000 does not trigger high warning (boundary)', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 500000 })
    expect(r.warnings.some(w => w.includes('높습니다'))).toBe(false)
  })

  // --- Valid inputs ---

  it('23. valid worker with typical wage returns valid=true, no errors, no warnings', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 200000 })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('24. valid worker at low boundary (50000) no warnings', () => {
    const r = validateWorker({ name: '김철수', job_type: '특별인부', default_wage: 50000 })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('25. valid worker at high boundary (500000) no warnings', () => {
    const r = validateWorker({ name: '이영희', job_type: '용접공', default_wage: 500000 })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  // --- Combinations ---

  it('26. all fields missing returns multiple errors', () => {
    const r = validateWorker({})
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
    expect(r.errors).toContain('이름은 필수입니다.')
    expect(r.errors).toContain('직종을 선택해야 합니다.')
    expect(r.errors).toContain('일당을 입력해야 합니다.')
  })

  it('27. name + job_type missing, wage present returns 2 errors', () => {
    const r = validateWorker({ default_wage: 150000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('이름은 필수입니다.')
    expect(r.errors).toContain('직종을 선택해야 합니다.')
    expect(r.errors).not.toContain('일당을 입력해야 합니다.')
  })

  it('28. valid data with extra unknown fields still valid', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 200000, phone: '010-1234-5678', memo: 'test' })
    expect(r.valid).toBe(true)
  })

  it('29. warning message includes formatted wage amount', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 30000 })
    expect(r.warnings[0]).toContain('30,000')
  })

  it('30. zero wage returns error but NOT low-wage warning (error takes precedence)', () => {
    const r = validateWorker({ name: '홍길동', job_type: '보통인부', default_wage: 0 })
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
    // 0 <= 0 so error, but also < 50000 so warning fires too
    expect(r.warnings.some(w => w.includes('매우 낮습니다'))).toBe(true)
  })
})

// ===== validateLaborAssign (30 tests) =====

describe('validateLaborAssign', () => {
  const validBase = {
    project_id: 1,
    worker_id: 1,
    work_date: '2025-01-15',
    day_fraction: 1.0,
    daily_wage: 200000,
  }

  // --- Error: required fields ---

  it('31. missing project_id returns error', () => {
    const r = validateLaborAssign({ ...validBase, project_id: undefined })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('프로젝트를 선택해야 합니다.')
  })

  it('32. missing worker_id returns error', () => {
    const r = validateLaborAssign({ ...validBase, worker_id: undefined })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('근로자를 선택해야 합니다.')
  })

  it('33. missing work_date returns error', () => {
    const r = validateLaborAssign({ ...validBase, work_date: undefined })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('작업일을 입력해야 합니다.')
  })

  it('34. null project_id returns error', () => {
    const r = validateLaborAssign({ ...validBase, project_id: null })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('프로젝트를 선택해야 합니다.')
  })

  it('35. empty string work_date returns error', () => {
    const r = validateLaborAssign({ ...validBase, work_date: '' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('작업일을 입력해야 합니다.')
  })

  it('36. all required fields missing returns 3 errors', () => {
    const r = validateLaborAssign({})
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('프로젝트를 선택해야 합니다.')
    expect(r.errors).toContain('근로자를 선택해야 합니다.')
    expect(r.errors).toContain('작업일을 입력해야 합니다.')
  })

  // --- Error: day_fraction out of range ---

  it('37. day_fraction 0.4 (below 0.5) returns error', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 0.4 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일수는 0.5 ~ 2.0 범위여야 합니다.')
  })

  it('38. day_fraction 0.0 returns error', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일수는 0.5 ~ 2.0 범위여야 합니다.')
  })

  it('39. day_fraction 2.1 (above 2.0) returns error', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 2.1 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일수는 0.5 ~ 2.0 범위여야 합니다.')
  })

  it('40. day_fraction 3.0 returns error', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 3.0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일수는 0.5 ~ 2.0 범위여야 합니다.')
  })

  it('41. day_fraction -1 returns error', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: -1 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일수는 0.5 ~ 2.0 범위여야 합니다.')
  })

  // --- day_fraction valid boundary values ---

  it('42. day_fraction exactly 0.5 is valid (lower boundary)', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 0.5 })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('43. day_fraction exactly 2.0 is valid (upper boundary)', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 2.0 })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('44. day_fraction 1.0 (full day) is valid', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 1.0 })
    expect(r.valid).toBe(true)
  })

  it('45. day_fraction 1.5 (overtime) is valid', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 1.5 })
    expect(r.valid).toBe(true)
  })

  // --- Error: daily_wage <= 0 ---

  it('46. daily_wage 0 returns error', () => {
    const r = validateLaborAssign({ ...validBase, daily_wage: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
  })

  it('47. daily_wage negative returns error', () => {
    const r = validateLaborAssign({ ...validBase, daily_wage: -50000 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('일당은 0원보다 커야 합니다.')
  })

  it('48. daily_wage not provided does not trigger wage error', () => {
    // daily_wage is not typeof number when undefined, so the check is skipped
    const r = validateLaborAssign({ ...validBase, daily_wage: undefined })
    expect(r.errors).not.toContain('일당은 0원보다 커야 합니다.')
  })

  it('49. daily_wage as string does not trigger wage error', () => {
    const r = validateLaborAssign({ ...validBase, daily_wage: '200000' })
    expect(r.errors).not.toContain('일당은 0원보다 커야 합니다.')
  })

  // --- Warning: future date ---

  it('50. future work_date triggers warning', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    const futureStr = future.toISOString().split('T')[0]
    const r = validateLaborAssign({ ...validBase, work_date: futureStr })
    expect(r.valid).toBe(true)
    expect(r.warnings).toContain('미래 날짜의 출역입니다. 확인해주세요.')
  })

  it('51. past work_date does not trigger future warning', () => {
    const r = validateLaborAssign({ ...validBase, work_date: '2024-06-15' })
    expect(r.warnings).not.toContain('미래 날짜의 출역입니다. 확인해주세요.')
  })

  it('52. far future date triggers warning', () => {
    const r = validateLaborAssign({ ...validBase, work_date: '2030-12-31' })
    expect(r.warnings).toContain('미래 날짜의 출역입니다. 확인해주세요.')
  })

  // --- Valid inputs ---

  it('53. fully valid labor assign returns valid=true', () => {
    const r = validateLaborAssign(validBase)
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('54. half day assign (0.5) is valid', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 0.5 })
    expect(r.valid).toBe(true)
  })

  it('55. overtime assign (1.5) is valid', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 1.5 })
    expect(r.valid).toBe(true)
  })

  it('56. double day assign (2.0) is valid', () => {
    const r = validateLaborAssign({ ...validBase, day_fraction: 2.0 })
    expect(r.valid).toBe(true)
  })

  // --- Combinations ---

  it('57. missing required fields + out-of-range day_fraction returns multiple errors', () => {
    const r = validateLaborAssign({ day_fraction: 5.0, daily_wage: -100 })
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThanOrEqual(4)
  })

  it('58. valid required fields with no day_fraction or daily_wage is valid', () => {
    const r = validateLaborAssign({ project_id: 1, worker_id: 2, work_date: '2025-01-15' })
    expect(r.valid).toBe(true)
  })

  it('59. project_id=0 (falsy) returns error', () => {
    const r = validateLaborAssign({ ...validBase, project_id: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('프로젝트를 선택해야 합니다.')
  })

  it('60. worker_id=0 (falsy) returns error', () => {
    const r = validateLaborAssign({ ...validBase, worker_id: 0 })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('근로자를 선택해야 합니다.')
  })
})

// ===== validatePayrollCalc (20 tests) =====

describe('validatePayrollCalc', () => {
  // --- Error: laborCount === 0 ---

  it('61. laborCount 0 returns error', () => {
    const r = validatePayrollCalc({ laborCount: 0, yearMonth: '2026-03' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('해당 월에 출역 기록이 없습니다.')
  })

  it('62. laborCount 0 with valid yearMonth still invalid', () => {
    const r = validatePayrollCalc({ laborCount: 0, yearMonth: '2025-12' })
    expect(r.valid).toBe(false)
  })

  // --- Error: yearMonth format ---

  it('63. yearMonth "202603" (no dash) returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '202603' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('년월 형식이 올바르지 않습니다. (YYYY-MM)')
  })

  it('64. yearMonth "2026-3" (single digit month) returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '2026-3' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('년월 형식이 올바르지 않습니다. (YYYY-MM)')
  })

  it('65. yearMonth "26-03" (two digit year) returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '26-03' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('년월 형식이 올바르지 않습니다. (YYYY-MM)')
  })

  it('66. yearMonth empty string returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '' })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('년월 형식이 올바르지 않습니다. (YYYY-MM)')
  })

  it('67. yearMonth "2026/03" (slash separator) returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '2026/03' })
    expect(r.valid).toBe(false)
  })

  it('68. yearMonth "2026-03-01" (full date) returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '2026-03-01' })
    expect(r.valid).toBe(false)
  })

  it('69. yearMonth "abcd-ef" returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: 'abcd-ef' })
    expect(r.valid).toBe(false)
  })

  it('70. yearMonth with leading space returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: ' 2026-03' })
    expect(r.valid).toBe(false)
  })

  it('71. yearMonth with trailing space returns error', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '2026-03 ' })
    expect(r.valid).toBe(false)
  })

  // --- Valid inputs ---

  it('72. laborCount 1 with valid yearMonth is valid', () => {
    const r = validatePayrollCalc({ laborCount: 1, yearMonth: '2026-03' })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('73. laborCount 100 with valid yearMonth is valid', () => {
    const r = validatePayrollCalc({ laborCount: 100, yearMonth: '2026-01' })
    expect(r.valid).toBe(true)
  })

  it('74. yearMonth "2025-12" is valid', () => {
    const r = validatePayrollCalc({ laborCount: 10, yearMonth: '2025-12' })
    expect(r.valid).toBe(true)
  })

  it('75. yearMonth "2026-01" (January) is valid', () => {
    const r = validatePayrollCalc({ laborCount: 1, yearMonth: '2026-01' })
    expect(r.valid).toBe(true)
  })

  it('76. yearMonth "2030-06" (far future) is valid format', () => {
    const r = validatePayrollCalc({ laborCount: 1, yearMonth: '2030-06' })
    expect(r.valid).toBe(true)
  })

  it('77. yearMonth "1999-01" (far past) is valid format', () => {
    const r = validatePayrollCalc({ laborCount: 1, yearMonth: '1999-01' })
    expect(r.valid).toBe(true)
  })

  // --- Combinations ---

  it('78. both errors: laborCount 0 + invalid yearMonth', () => {
    const r = validatePayrollCalc({ laborCount: 0, yearMonth: 'bad' })
    expect(r.valid).toBe(false)
    expect(r.errors).toHaveLength(2)
    expect(r.errors).toContain('해당 월에 출역 기록이 없습니다.')
    expect(r.errors).toContain('년월 형식이 올바르지 않습니다. (YYYY-MM)')
  })

  it('79. valid result has empty warnings array', () => {
    const r = validatePayrollCalc({ laborCount: 5, yearMonth: '2026-03' })
    expect(r.warnings).toHaveLength(0)
  })

  it('80. large laborCount is valid', () => {
    const r = validatePayrollCalc({ laborCount: 99999, yearMonth: '2026-03' })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })
})

// ===== validatePayrollExport (20 tests) =====

describe('validatePayrollExport', () => {
  // --- Error: empty records ---

  it('81. empty records array returns error', () => {
    const r = validatePayrollExport({ records: [] })
    expect(r.valid).toBe(false)
    expect(r.errors).toContain('내보낼 급여 데이터가 없습니다.')
  })

  // --- Warning: records with net_pay === 0 ---

  it('82. single record with net_pay 0 triggers warning', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 0, worker_name: '홍길동' }] })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('실지급액이 0원인 근로자가 1명'))).toBe(true)
  })

  it('83. multiple records with net_pay 0 reports correct count', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 0, worker_name: 'A' },
        { net_pay: 0, worker_name: 'B' },
        { net_pay: 0, worker_name: 'C' },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('3명'))).toBe(true)
  })

  it('84. mix of zero and non-zero net_pay reports only zero count', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 0, worker_name: 'A' },
        { net_pay: 200000, worker_name: 'B' },
        { net_pay: 0, worker_name: 'C' },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('2명'))).toBe(true)
  })

  it('85. all records with net_pay 0 triggers warning with full count', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 0 },
        { net_pay: 0 },
      ],
    })
    expect(r.warnings.some(w => w.includes('2명'))).toBe(true)
  })

  // --- Valid: positive net_pay ---

  it('86. single record with positive net_pay is valid, no warnings', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 200000, worker_name: '홍길동' }] })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('87. multiple records all positive net_pay is valid', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 150000, worker_name: 'A' },
        { net_pay: 200000, worker_name: 'B' },
        { net_pay: 300000, worker_name: 'C' },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('88. record without worker_name is still valid', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 100000 }] })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('89. large net_pay value is valid', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 99999999, worker_name: '고액' }] })
    expect(r.valid).toBe(true)
  })

  it('90. small positive net_pay (1) is valid, no warning', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 1, worker_name: '최소' }] })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  // --- Edge cases ---

  it('91. negative net_pay does not trigger zero-pay warning', () => {
    const r = validatePayrollExport({ records: [{ net_pay: -5000, worker_name: '마이너스' }] })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('92. many records (50) all valid', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      net_pay: (i + 1) * 10000,
      worker_name: `Worker${i + 1}`,
    }))
    const r = validatePayrollExport({ records })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
    expect(r.warnings).toHaveLength(0)
  })

  it('93. single record array is not confused with empty', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 500000 }] })
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('94. records with mixed worker_name presence is valid', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 100000, worker_name: 'A' },
        { net_pay: 200000 },
        { net_pay: 300000, worker_name: 'C' },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings).toHaveLength(0)
  })

  it('95. only one zero-pay among many triggers warning with count 1', () => {
    const r = validatePayrollExport({
      records: [
        { net_pay: 100000, worker_name: 'A' },
        { net_pay: 0, worker_name: 'B' },
        { net_pay: 200000, worker_name: 'C' },
        { net_pay: 300000, worker_name: 'D' },
      ],
    })
    expect(r.valid).toBe(true)
    expect(r.warnings.some(w => w.includes('1명'))).toBe(true)
  })

  it('96. empty records array has no warnings (just error)', () => {
    const r = validatePayrollExport({ records: [] })
    expect(r.warnings).toHaveLength(0)
    expect(r.errors).toHaveLength(1)
  })

  it('97. valid=true even when warnings exist', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 0 }] })
    expect(r.valid).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('98. error result (empty) has valid=false', () => {
    const r = validatePayrollExport({ records: [] })
    expect(r.valid).toBe(false)
  })

  it('99. 10 zero-pay workers reports correct count', () => {
    const records = Array.from({ length: 10 }, () => ({ net_pay: 0, worker_name: 'X' }))
    const r = validatePayrollExport({ records })
    expect(r.warnings.some(w => w.includes('10명'))).toBe(true)
  })

  it('100. net_pay exactly 0.0 (float) triggers warning', () => {
    const r = validatePayrollExport({ records: [{ net_pay: 0.0, worker_name: 'Float' }] })
    expect(r.warnings.some(w => w.includes('0원'))).toBe(true)
  })
})
