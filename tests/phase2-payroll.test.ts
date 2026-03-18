import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure calculation logic extracted from the IPC payroll handler.
// We test the math independently of DB / Electron dependencies.
// ---------------------------------------------------------------------------

interface DailyEntry {
  wage: number
  fraction: number
}

function calculateDeductions(grossPay: number, dailyEntries: Array<DailyEntry>) {
  const natPensionRate = 0.045 // 국민연금 4.5%
  const healthInsRate = 0.03545 // 건강보험 3.545%
  const employInsRate = 0.009 // 고용보험 0.9%

  const natPension = Math.round(grossPay * natPensionRate)
  const healthIns = Math.round(grossPay * healthInsRate)
  const longCareIns = Math.round(healthIns * 0.1295) // 장기요양 = 건강보험 x 12.95%
  const employIns = Math.round(grossPay * employInsRate)

  // 일용근로소득세: 일별 계산
  let incomeTax = 0
  for (const entry of dailyEntries) {
    const dailyPay = Math.round(entry.wage * entry.fraction)
    const taxable = Math.max(0, dailyPay - 150_000)
    const dailyTax = Math.round(taxable * 0.06 * 0.45) // 6% tax rate x (1 - 55% credit)
    incomeTax += dailyTax
  }

  const localTax = Math.round(incomeTax * 0.1) // 지방소득세 = 소득세 x 10%

  const totalDeductions = natPension + healthIns + longCareIns + employIns + incomeTax + localTax
  const netPay = grossPay - totalDeductions

  return {
    natPension,
    healthIns,
    longCareIns,
    employIns,
    incomeTax,
    localTax,
    netPay,
    totalDeductions,
  }
}

// ---------------------------------------------------------------------------
// Helper: shorthand for a uniform N-day schedule at the same wage & fraction
// ---------------------------------------------------------------------------
function uniformDays(wage: number, fraction: number, count: number): DailyEntry[] {
  return Array.from({ length: count }, () => ({ wage, fraction }))
}

// ===========================================================================
// 1. Basic calculations — single day, single worker, verify each deduction
// ===========================================================================
describe('Basic calculations — single day', () => {
  const gross = 200_000
  const entries: DailyEntry[] = [{ wage: 200_000, fraction: 1 }]
  const r = calculateDeductions(gross, entries)

  it('1-01 국민연금 = gross x 4.5%', () => {
    expect(r.natPension).toBe(Math.round(200_000 * 0.045)) // 9000
  })

  it('1-02 건강보험 = gross x 3.545%', () => {
    expect(r.healthIns).toBe(Math.round(200_000 * 0.03545)) // 7090
  })

  it('1-03 장기요양 = 건강보험 x 12.95%', () => {
    expect(r.longCareIns).toBe(Math.round(r.healthIns * 0.1295))
  })

  it('1-04 고용보험 = gross x 0.9%', () => {
    expect(r.employIns).toBe(Math.round(200_000 * 0.009)) // 1800
  })

  it('1-05 소득세: (200000-150000) x 2.7%', () => {
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.06 * 0.45)) // 1350
  })

  it('1-06 지방소득세 = 소득세 x 10%', () => {
    expect(r.localTax).toBe(Math.round(r.incomeTax * 0.1))
  })

  it('1-07 totalDeductions is sum of all deductions', () => {
    const sum = r.natPension + r.healthIns + r.longCareIns + r.employIns + r.incomeTax + r.localTax
    expect(r.totalDeductions).toBe(sum)
  })

  it('1-08 netPay = gross - totalDeductions', () => {
    expect(r.netPay).toBe(gross - r.totalDeductions)
  })
})

// ===========================================================================
// 2. Daily wage under 150,000 — no income tax
// ===========================================================================
describe('Daily wage under 150,000 (no income tax)', () => {
  it('2-01 wage 100,000 => incomeTax 0', () => {
    const r = calculateDeductions(100_000, [{ wage: 100_000, fraction: 1 }])
    expect(r.incomeTax).toBe(0)
  })

  it('2-02 wage 149,999 => incomeTax 0', () => {
    const r = calculateDeductions(149_999, [{ wage: 149_999, fraction: 1 }])
    expect(r.incomeTax).toBe(0)
  })

  it('2-03 wage 1 => incomeTax 0', () => {
    const r = calculateDeductions(1, [{ wage: 1, fraction: 1 }])
    expect(r.incomeTax).toBe(0)
  })

  it('2-04 localTax also 0 when incomeTax 0', () => {
    const r = calculateDeductions(100_000, [{ wage: 100_000, fraction: 1 }])
    expect(r.localTax).toBe(0)
  })

  it('2-05 wage 80,000 social insurances still apply', () => {
    const r = calculateDeductions(80_000, [{ wage: 80_000, fraction: 1 }])
    expect(r.natPension).toBe(Math.round(80_000 * 0.045))
    expect(r.healthIns).toBe(Math.round(80_000 * 0.03545))
    expect(r.employIns).toBe(Math.round(80_000 * 0.009))
  })
})

// ===========================================================================
// 3. Daily wage exactly 150,000 — boundary
// ===========================================================================
describe('Daily wage exactly 150,000 (boundary)', () => {
  const gross = 150_000
  const r = calculateDeductions(gross, [{ wage: 150_000, fraction: 1 }])

  it('3-01 incomeTax is 0', () => {
    expect(r.incomeTax).toBe(0)
  })

  it('3-02 localTax is 0', () => {
    expect(r.localTax).toBe(0)
  })

  it('3-03 국민연금 calculated normally', () => {
    expect(r.natPension).toBe(Math.round(150_000 * 0.045)) // 6750
  })

  it('3-04 건강보험 calculated normally', () => {
    expect(r.healthIns).toBe(Math.round(150_000 * 0.03545)) // 5318
  })
})

// ===========================================================================
// 4. Daily wage over 150,000 — income tax applies
// ===========================================================================
describe('Daily wage over 150,000', () => {
  it('4-01 wage 150,001 => minimal tax', () => {
    const r = calculateDeductions(150_001, [{ wage: 150_001, fraction: 1 }])
    // taxable = 1, tax = round(1 * 0.027) = 0
    expect(r.incomeTax).toBe(Math.round(1 * 0.06 * 0.45))
  })

  it('4-02 wage 160,000 => taxable 10,000', () => {
    const r = calculateDeductions(160_000, [{ wage: 160_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(10_000 * 0.06 * 0.45)) // 270
  })

  it('4-03 wage 200,000 => taxable 50,000', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.06 * 0.45)) // 1350
  })

  it('4-04 wage 250,000 => taxable 100,000', () => {
    const r = calculateDeductions(250_000, [{ wage: 250_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(100_000 * 0.06 * 0.45)) // 2700
  })

  it('4-05 wage 300,000 => taxable 150,000', () => {
    const r = calculateDeductions(300_000, [{ wage: 300_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(150_000 * 0.06 * 0.45)) // 4050
  })
})

// ===========================================================================
// 5. Half day (0.5 fraction) — pro-rated amounts
// ===========================================================================
describe('Half day (fraction 0.5)', () => {
  it('5-01 wage 200,000 x 0.5 = dailyPay 100,000 => no income tax', () => {
    // gross is still set by caller; here we assume gross = 100,000
    const r = calculateDeductions(100_000, [{ wage: 200_000, fraction: 0.5 }])
    expect(r.incomeTax).toBe(0)
  })

  it('5-02 wage 400,000 x 0.5 = dailyPay 200,000 => tax on 50,000', () => {
    const r = calculateDeductions(200_000, [{ wage: 400_000, fraction: 0.5 }])
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.06 * 0.45))
  })

  it('5-03 wage 300,000 x 0.5 = 150,000 => boundary, no tax', () => {
    const r = calculateDeductions(150_000, [{ wage: 300_000, fraction: 0.5 }])
    expect(r.incomeTax).toBe(0)
  })

  it('5-04 social insurance based on gross, not daily pay', () => {
    const gross = 100_000
    const r = calculateDeductions(gross, [{ wage: 200_000, fraction: 0.5 }])
    expect(r.natPension).toBe(Math.round(gross * 0.045))
    expect(r.healthIns).toBe(Math.round(gross * 0.03545))
  })
})

// ===========================================================================
// 6. Overtime (1.5, 2.0 fraction)
// ===========================================================================
describe('Overtime fractions', () => {
  it('6-01 fraction 1.5 => dailyPay = wage x 1.5', () => {
    // wage 200,000 x 1.5 = 300,000 => taxable 150,000
    const r = calculateDeductions(300_000, [{ wage: 200_000, fraction: 1.5 }])
    expect(r.incomeTax).toBe(Math.round(150_000 * 0.06 * 0.45))
  })

  it('6-02 fraction 2.0 => dailyPay = wage x 2', () => {
    // wage 200,000 x 2 = 400,000 => taxable 250,000
    const r = calculateDeductions(400_000, [{ wage: 200_000, fraction: 2.0 }])
    expect(r.incomeTax).toBe(Math.round(250_000 * 0.06 * 0.45))
  })

  it('6-03 fraction 1.5, low wage still under exemption', () => {
    // wage 80,000 x 1.5 = 120,000 => no tax
    const r = calculateDeductions(120_000, [{ wage: 80_000, fraction: 1.5 }])
    expect(r.incomeTax).toBe(0)
  })

  it('6-04 fraction 1.5, wage 100,000 x 1.5 = 150,000 => boundary', () => {
    const r = calculateDeductions(150_000, [{ wage: 100_000, fraction: 1.5 }])
    expect(r.incomeTax).toBe(0)
  })
})

// ===========================================================================
// 7. Multiple days — accumulation
// ===========================================================================
describe('Multiple days accumulation', () => {
  it('7-01 two identical days', () => {
    const dailyTax = Math.round(50_000 * 0.06 * 0.45)
    const r = calculateDeductions(400_000, uniformDays(200_000, 1, 2))
    expect(r.incomeTax).toBe(dailyTax * 2)
  })

  it('7-02 five identical days', () => {
    const dailyTax = Math.round(50_000 * 0.06 * 0.45)
    const r = calculateDeductions(1_000_000, uniformDays(200_000, 1, 5))
    expect(r.incomeTax).toBe(dailyTax * 5)
  })

  it('7-03 twenty days', () => {
    const dailyTax = Math.round(50_000 * 0.06 * 0.45)
    const r = calculateDeductions(4_000_000, uniformDays(200_000, 1, 20))
    expect(r.incomeTax).toBe(dailyTax * 20)
  })

  it('7-04 localTax accumulates proportionally', () => {
    const r = calculateDeductions(4_000_000, uniformDays(200_000, 1, 20))
    expect(r.localTax).toBe(Math.round(r.incomeTax * 0.1))
  })

  it('7-05 gross for multi-day = social insurance base', () => {
    const gross = 4_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 20))
    expect(r.natPension).toBe(Math.round(gross * 0.045))
  })
})

// ===========================================================================
// 8. High wage scenarios
// ===========================================================================
describe('High wage scenarios', () => {
  it('8-01 daily 300,000 x 1 day', () => {
    const r = calculateDeductions(300_000, [{ wage: 300_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(150_000 * 0.06 * 0.45)) // 4050
    expect(r.natPension).toBe(Math.round(300_000 * 0.045)) // 13500
  })

  it('8-02 daily 500,000 x 1 day', () => {
    const r = calculateDeductions(500_000, [{ wage: 500_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(350_000 * 0.06 * 0.45)) // 9450
  })

  it('8-03 daily 500,000 x 20 days => 10M gross', () => {
    const gross = 10_000_000
    const dailyTax = Math.round(350_000 * 0.06 * 0.45)
    const r = calculateDeductions(gross, uniformDays(500_000, 1, 20))
    expect(r.incomeTax).toBe(dailyTax * 20)
    expect(r.natPension).toBe(Math.round(gross * 0.045))
  })

  it('8-04 daily 1,000,000 — very high earner', () => {
    const r = calculateDeductions(1_000_000, [{ wage: 1_000_000, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(850_000 * 0.06 * 0.45))
  })

  it('8-05 daily 300,000 x 25 days', () => {
    const gross = 7_500_000
    const dailyTax = Math.round(150_000 * 0.06 * 0.45)
    const r = calculateDeductions(gross, uniformDays(300_000, 1, 25))
    expect(r.incomeTax).toBe(dailyTax * 25)
  })
})

// ===========================================================================
// 9. Zero gross pay
// ===========================================================================
describe('Zero gross pay', () => {
  it('9-01 all deductions are 0', () => {
    const r = calculateDeductions(0, [])
    expect(r.natPension).toBe(0)
    expect(r.healthIns).toBe(0)
    expect(r.longCareIns).toBe(0)
    expect(r.employIns).toBe(0)
    expect(r.incomeTax).toBe(0)
    expect(r.localTax).toBe(0)
  })

  it('9-02 netPay is 0', () => {
    const r = calculateDeductions(0, [])
    expect(r.netPay).toBe(0)
  })

  it('9-03 totalDeductions is 0', () => {
    const r = calculateDeductions(0, [])
    expect(r.totalDeductions).toBe(0)
  })

  it('9-04 zero gross with zero-wage entry', () => {
    const r = calculateDeductions(0, [{ wage: 0, fraction: 1 }])
    expect(r.incomeTax).toBe(0)
    expect(r.totalDeductions).toBe(0)
  })
})

// ===========================================================================
// 10. Net pay calculation
// ===========================================================================
describe('Net pay = gross - totalDeductions', () => {
  it('10-01 low earner', () => {
    const gross = 100_000
    const r = calculateDeductions(gross, [{ wage: 100_000, fraction: 1 }])
    expect(r.netPay).toBe(gross - r.totalDeductions)
    expect(r.netPay).toBeGreaterThan(0)
  })

  it('10-02 medium earner', () => {
    const gross = 4_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 20))
    expect(r.netPay).toBe(gross - r.totalDeductions)
  })

  it('10-03 high earner', () => {
    const gross = 10_000_000
    const r = calculateDeductions(gross, uniformDays(500_000, 1, 20))
    expect(r.netPay).toBe(gross - r.totalDeductions)
  })

  it('10-04 netPay is always less than gross when gross > 0', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    expect(r.netPay).toBeLessThan(200_000)
  })

  it('10-05 netPay + totalDeductions = gross', () => {
    const gross = 3_600_000
    const r = calculateDeductions(gross, uniformDays(180_000, 1, 20))
    expect(r.netPay + r.totalDeductions).toBe(gross)
  })
})

// ===========================================================================
// 11. Rounding — Math.round edge cases
// ===========================================================================
describe('Rounding behavior', () => {
  it('11-01 natPension rounds: 123,456 x 4.5% = 5555.52 => 5556', () => {
    const r = calculateDeductions(123_456, [{ wage: 123_456, fraction: 1 }])
    expect(r.natPension).toBe(Math.round(123_456 * 0.045)) // 5556
  })

  it('11-02 healthIns rounds: 123,456 x 3.545% = 4,374.5232 => 4,375', () => {
    const r = calculateDeductions(123_456, [{ wage: 123_456, fraction: 1 }])
    expect(r.healthIns).toBe(Math.round(123_456 * 0.03545))
  })

  it('11-03 employIns rounds: 123,456 x 0.9% = 1111.104 => 1111', () => {
    const r = calculateDeductions(123_456, [{ wage: 123_456, fraction: 1 }])
    expect(r.employIns).toBe(Math.round(123_456 * 0.009))
  })

  it('11-04 exact half rounds up: 0.5 => 1 in Math.round', () => {
    // Math.round(0.5) = 1
    expect(Math.round(0.5)).toBe(1)
  })

  it('11-05 daily pay rounding with fraction', () => {
    // wage 333,333 x 0.3 = 99,999.9 => round => 100,000
    const dailyPay = Math.round(333_333 * 0.3)
    expect(dailyPay).toBe(100_000)
  })

  it('11-06 odd gross amount 111,111', () => {
    const gross = 111_111
    const r = calculateDeductions(gross, [{ wage: 111_111, fraction: 1 }])
    expect(r.natPension).toBe(Math.round(111_111 * 0.045)) // 5000
    expect(r.healthIns).toBe(Math.round(111_111 * 0.03545))
  })

  it('11-07 gross 1 — tiny amount', () => {
    const r = calculateDeductions(1, [{ wage: 1, fraction: 1 }])
    expect(r.natPension).toBe(Math.round(0.045)) // 0
    expect(r.healthIns).toBe(Math.round(0.03545)) // 0
  })
})

// ===========================================================================
// 12. Long care insurance — 12.95% of health insurance, NOT of gross
// ===========================================================================
describe('Long care insurance (장기요양)', () => {
  it('12-01 derived from healthIns, not gross', () => {
    const gross = 200_000
    const r = calculateDeductions(gross, [{ wage: 200_000, fraction: 1 }])
    const healthIns = Math.round(gross * 0.03545)
    expect(r.longCareIns).toBe(Math.round(healthIns * 0.1295))
    // Must NOT equal Math.round(gross * 0.1295)
    expect(r.longCareIns).not.toBe(Math.round(gross * 0.1295))
  })

  it('12-02 long care / healthIns ratio close to 0.1295', () => {
    const gross = 5_000_000
    const r = calculateDeductions(gross, uniformDays(250_000, 1, 20))
    const ratio = r.longCareIns / r.healthIns
    expect(ratio).toBeCloseTo(0.1295, 2)
  })

  it('12-03 long care is always smaller than healthIns', () => {
    const r = calculateDeductions(4_000_000, uniformDays(200_000, 1, 20))
    expect(r.longCareIns).toBeLessThan(r.healthIns)
  })

  it('12-04 verify exact: gross 1,000,000', () => {
    const gross = 1_000_000
    const healthIns = Math.round(gross * 0.03545) // 35450
    const longCare = Math.round(healthIns * 0.1295) // 4591
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 5))
    expect(r.healthIns).toBe(35_450)
    expect(r.longCareIns).toBe(Math.round(35_450 * 0.1295))
  })

  it('12-05 zero gross => long care is 0', () => {
    const r = calculateDeductions(0, [])
    expect(r.longCareIns).toBe(0)
  })
})

// ===========================================================================
// 13. Income tax credit — verify 55% credit = multiply by 0.45
// ===========================================================================
describe('Income tax credit (55% = multiply by 0.45)', () => {
  it('13-01 taxable x 0.06 x 0.45 = taxable x 0.027', () => {
    const taxable = 100_000
    expect(Math.round(taxable * 0.06 * 0.45)).toBe(Math.round(taxable * 0.027))
  })

  it('13-02 wage 200,000: tax = 50,000 x 2.7% = 1,350', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    expect(r.incomeTax).toBe(1_350)
  })

  it('13-03 wage 300,000: tax = 150,000 x 2.7% = 4,050', () => {
    const r = calculateDeductions(300_000, [{ wage: 300_000, fraction: 1 }])
    expect(r.incomeTax).toBe(4_050)
  })

  it('13-04 wage 500,000: tax = 350,000 x 2.7% = 9,450', () => {
    const r = calculateDeductions(500_000, [{ wage: 500_000, fraction: 1 }])
    expect(r.incomeTax).toBe(9_450)
  })

  it('13-05 NOT using 0.06 alone (would be 6% without credit)', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    const wrongTax = Math.round(50_000 * 0.06) // 3000 — wrong
    expect(r.incomeTax).not.toBe(wrongTax)
  })

  it('13-06 NOT using 0.027 differently from 0.06*0.45', () => {
    // Confirm floating-point consistency
    for (const taxable of [1, 50_000, 100_000, 350_000, 850_000]) {
      expect(Math.round(taxable * 0.06 * 0.45)).toBe(Math.round(taxable * 0.027))
    }
  })
})

// ===========================================================================
// 14. Mixed days — some above exemption, some below
// ===========================================================================
describe('Mixed days (above and below exemption)', () => {
  it('14-01 one day above, one day below', () => {
    const entries: DailyEntry[] = [
      { wage: 200_000, fraction: 1 }, // taxable 50,000
      { wage: 100_000, fraction: 1 }, // taxable 0
    ]
    const r = calculateDeductions(300_000, entries)
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.027))
  })

  it('14-02 two days above, one day below', () => {
    const entries: DailyEntry[] = [
      { wage: 200_000, fraction: 1 },
      { wage: 250_000, fraction: 1 },
      { wage: 120_000, fraction: 1 },
    ]
    const r = calculateDeductions(570_000, entries)
    const expected = Math.round(50_000 * 0.027) + Math.round(100_000 * 0.027)
    expect(r.incomeTax).toBe(expected)
  })

  it('14-03 half days mixed: some above, some below after fraction', () => {
    const entries: DailyEntry[] = [
      { wage: 400_000, fraction: 0.5 }, // 200,000 => taxable 50,000
      { wage: 200_000, fraction: 0.5 }, // 100,000 => taxable 0
    ]
    const r = calculateDeductions(300_000, entries)
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.027))
  })

  it('14-04 all days below exemption => no tax', () => {
    const entries: DailyEntry[] = [
      { wage: 140_000, fraction: 1 },
      { wage: 120_000, fraction: 1 },
      { wage: 100_000, fraction: 1 },
    ]
    const r = calculateDeductions(360_000, entries)
    expect(r.incomeTax).toBe(0)
  })

  it('14-05 five mixed days', () => {
    const entries: DailyEntry[] = [
      { wage: 200_000, fraction: 1 },   // taxable 50k
      { wage: 150_000, fraction: 1 },   // taxable 0 (boundary)
      { wage: 300_000, fraction: 1 },   // taxable 150k
      { wage: 140_000, fraction: 1 },   // taxable 0
      { wage: 180_000, fraction: 1 },   // taxable 30k
    ]
    const gross = 970_000
    const r = calculateDeductions(gross, entries)
    const expected = Math.round(50_000 * 0.027) + Math.round(150_000 * 0.027) + Math.round(30_000 * 0.027)
    expect(r.incomeTax).toBe(expected)
  })
})

// ===========================================================================
// 15. Realistic scenarios — typical construction worker
// ===========================================================================
describe('Realistic scenarios', () => {
  it('15-01 건설근로자: 200,000/day x 20 days = 4,000,000', () => {
    const gross = 4_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 20))

    expect(r.natPension).toBe(Math.round(4_000_000 * 0.045))    // 180,000
    expect(r.healthIns).toBe(Math.round(4_000_000 * 0.03545))   // 141,800
    expect(r.longCareIns).toBe(Math.round(r.healthIns * 0.1295))
    expect(r.employIns).toBe(Math.round(4_000_000 * 0.009))     // 36,000

    const dailyTax = Math.round(50_000 * 0.027) // 1350
    expect(r.incomeTax).toBe(dailyTax * 20) // 27,000
    expect(r.localTax).toBe(Math.round(r.incomeTax * 0.1)) // 2,700

    expect(r.netPay).toBe(gross - r.totalDeductions)
  })

  it('15-02 건설근로자: 180,000/day x 22 days = 3,960,000', () => {
    const gross = 3_960_000
    const r = calculateDeductions(gross, uniformDays(180_000, 1, 22))
    const dailyTax = Math.round(30_000 * 0.027) // 810
    expect(r.incomeTax).toBe(dailyTax * 22)
  })

  it('15-03 일용직: 120,000/day x 15 days = 1,800,000 — no income tax', () => {
    const gross = 1_800_000
    const r = calculateDeductions(gross, uniformDays(120_000, 1, 15))
    expect(r.incomeTax).toBe(0)
    expect(r.localTax).toBe(0)
    // but social insurance still applies
    expect(r.natPension).toBe(Math.round(1_800_000 * 0.045))
  })

  it('15-04 고액 기술자: 350,000/day x 20 days', () => {
    const gross = 7_000_000
    const r = calculateDeductions(gross, uniformDays(350_000, 1, 20))
    const dailyTax = Math.round(200_000 * 0.027) // 5400
    expect(r.incomeTax).toBe(dailyTax * 20)
  })

  it('15-05 mixed schedule: 18 full days + 2 half days', () => {
    const entries: DailyEntry[] = [
      ...uniformDays(200_000, 1, 18),
      ...uniformDays(200_000, 0.5, 2),
    ]
    const gross = 18 * 200_000 + 2 * 100_000
    const r = calculateDeductions(gross, entries)

    const fullDayTax = Math.round(50_000 * 0.027) // 1350
    // half day: 100,000 => no tax
    expect(r.incomeTax).toBe(fullDayTax * 18)
  })

  it('15-06 net pay percentage roughly 90% for 200k/day worker', () => {
    const gross = 4_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 20))
    const netPct = r.netPay / gross
    expect(netPct).toBeGreaterThan(0.85)
    expect(netPct).toBeLessThan(0.95)
  })
})

// ===========================================================================
// Additional edge cases and regression tests
// ===========================================================================
describe('Additional edge cases', () => {
  it('E-01 empty dailyEntries array with positive gross', () => {
    // Social insurance on gross, but no income tax entries
    const r = calculateDeductions(200_000, [])
    expect(r.incomeTax).toBe(0)
    expect(r.localTax).toBe(0)
    expect(r.natPension).toBe(Math.round(200_000 * 0.045))
  })

  it('E-02 fraction 0 => no daily pay => no income tax', () => {
    const r = calculateDeductions(0, [{ wage: 200_000, fraction: 0 }])
    expect(r.incomeTax).toBe(0)
  })

  it('E-03 very small fraction 0.01', () => {
    // wage 200,000 x 0.01 = 2,000 => no tax
    const r = calculateDeductions(2_000, [{ wage: 200_000, fraction: 0.01 }])
    expect(r.incomeTax).toBe(0)
  })

  it('E-04 single day: all deduction fields are non-negative', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    expect(r.natPension).toBeGreaterThanOrEqual(0)
    expect(r.healthIns).toBeGreaterThanOrEqual(0)
    expect(r.longCareIns).toBeGreaterThanOrEqual(0)
    expect(r.employIns).toBeGreaterThanOrEqual(0)
    expect(r.incomeTax).toBeGreaterThanOrEqual(0)
    expect(r.localTax).toBeGreaterThanOrEqual(0)
  })

  it('E-05 deterministic: same input => same output', () => {
    const a = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    const b = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1 }])
    expect(a).toEqual(b)
  })

  it('E-06 localTax is always 10% of incomeTax', () => {
    for (const wage of [100_000, 150_000, 200_000, 300_000, 500_000]) {
      const r = calculateDeductions(wage, [{ wage, fraction: 1 }])
      expect(r.localTax).toBe(Math.round(r.incomeTax * 0.1))
    }
  })

  it('E-07 insurance deductions scale linearly with gross', () => {
    const r1 = calculateDeductions(1_000_000, uniformDays(200_000, 1, 5))
    const r2 = calculateDeductions(2_000_000, uniformDays(200_000, 1, 10))
    expect(r2.natPension).toBe(r1.natPension * 2)
    expect(r2.healthIns).toBe(r1.healthIns * 2)
    expect(r2.employIns).toBe(r1.employIns * 2)
  })

  it('E-08 large number of days (100 days)', () => {
    const gross = 20_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 100))
    const dailyTax = Math.round(50_000 * 0.027)
    expect(r.incomeTax).toBe(dailyTax * 100)
  })

  it('E-09 wage 150,001 => minimal taxable = 1', () => {
    const r = calculateDeductions(150_001, [{ wage: 150_001, fraction: 1 }])
    // taxable = 1, tax = round(1 * 0.027) = round(0.027) = 0
    expect(r.incomeTax).toBe(0) // rounds down to 0
  })

  it('E-10 wage 150,038 => taxable 38, tax = round(38*0.027) = round(1.026) = 1', () => {
    const r = calculateDeductions(150_038, [{ wage: 150_038, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(38 * 0.06 * 0.45)) // round(1.026) = 1
  })

  it('E-11 income tax threshold: find minimum taxable that produces tax > 0', () => {
    // taxable * 0.027 >= 0.5 => taxable >= 18.52 => taxable = 19
    // wage = 150,019
    const r = calculateDeductions(150_019, [{ wage: 150_019, fraction: 1 }])
    expect(r.incomeTax).toBe(Math.round(19 * 0.06 * 0.45)) // round(0.513) = 1
    expect(r.incomeTax).toBeGreaterThan(0)

    // wage = 150,018 => taxable 18 => round(0.486) = 0
    const r2 = calculateDeductions(150_018, [{ wage: 150_018, fraction: 1 }])
    expect(r2.incomeTax).toBe(0)
  })

  it('E-12 social insurance proportions are correct relative to each other', () => {
    const gross = 1_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 5))
    // natPension > healthIns > employIns
    expect(r.natPension).toBeGreaterThan(r.healthIns)
    expect(r.healthIns).toBeGreaterThan(r.employIns)
  })

  it('E-13 exact values for canonical gross 1,000,000', () => {
    const gross = 1_000_000
    const r = calculateDeductions(gross, uniformDays(200_000, 1, 5))
    expect(r.natPension).toBe(45_000)
    expect(r.healthIns).toBe(35_450)
    expect(r.employIns).toBe(9_000)
  })

  it('E-14 totalDeductions never exceeds gross for reasonable wages', () => {
    for (const wage of [100_000, 200_000, 300_000, 500_000]) {
      const r = calculateDeductions(wage, [{ wage, fraction: 1 }])
      expect(r.totalDeductions).toBeLessThan(wage)
    }
  })

  it('E-15 fraction 1.0 is same as omitting fraction concept', () => {
    const r = calculateDeductions(200_000, [{ wage: 200_000, fraction: 1.0 }])
    expect(r.incomeTax).toBe(Math.round(50_000 * 0.027))
  })
})

// ===========================================================================
// Rate verification tests
// ===========================================================================
describe('Rate constants verification', () => {
  it('R-01 국민연금 rate is 4.5%', () => {
    const gross = 10_000_000
    const r = calculateDeductions(gross, [])
    expect(r.natPension).toBe(450_000)
  })

  it('R-02 건강보험 rate is 3.545%', () => {
    const gross = 10_000_000
    const r = calculateDeductions(gross, [])
    expect(r.healthIns).toBe(354_500)
  })

  it('R-03 고용보험 rate is 0.9%', () => {
    const gross = 10_000_000
    const r = calculateDeductions(gross, [])
    expect(r.employIns).toBe(90_000)
  })

  it('R-04 장기요양 rate is 12.95% of healthIns', () => {
    const gross = 10_000_000
    const r = calculateDeductions(gross, [])
    expect(r.longCareIns).toBe(Math.round(354_500 * 0.1295))
  })

  it('R-05 income tax effective rate is 2.7% of taxable', () => {
    const r = calculateDeductions(1_000_000, [{ wage: 1_000_000, fraction: 1 }])
    // taxable = 850,000
    expect(r.incomeTax).toBe(Math.round(850_000 * 0.027))
  })
})

// ===========================================================================
// Summary / smoke tests
// ===========================================================================
describe('Smoke tests', () => {
  it('S-01 deduction breakdown sums correctly for random-ish gross', () => {
    const gross = 2_847_000
    const r = calculateDeductions(gross, uniformDays(189_800, 1, 15))
    const manualSum = r.natPension + r.healthIns + r.longCareIns + r.employIns + r.incomeTax + r.localTax
    expect(r.totalDeductions).toBe(manualSum)
    expect(r.netPay).toBe(gross - manualSum)
  })

  it('S-02 all return values are integers (no floating point)', () => {
    const r = calculateDeductions(3_333_333, uniformDays(166_667, 1, 20))
    expect(Number.isInteger(r.natPension)).toBe(true)
    expect(Number.isInteger(r.healthIns)).toBe(true)
    expect(Number.isInteger(r.longCareIns)).toBe(true)
    expect(Number.isInteger(r.employIns)).toBe(true)
    expect(Number.isInteger(r.incomeTax)).toBe(true)
    expect(Number.isInteger(r.localTax)).toBe(true)
    expect(Number.isInteger(r.netPay)).toBe(true)
    expect(Number.isInteger(r.totalDeductions)).toBe(true)
  })
})
