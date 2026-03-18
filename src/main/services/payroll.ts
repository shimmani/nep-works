import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { logAudit } from './audit'
import { validatePayrollCalc } from './validation'
import { IPC_CHANNELS } from '../../shared/types'
import { exportPayrollLedger } from '../excel/writer'

interface LaborEntry {
  worker_id: number
  worker_name: string
  work_date: string
  day_fraction: number
  daily_wage: number
}

export function registerPayrollHandlers(db: Database.Database): void {
  // 급여 계산 (프로젝트 + 월)
  ipcMain.handle(IPC_CHANNELS.PAYROLL_CALCULATE, (_event, projectId: number, yearMonth: string) => {
    // 출역 데이터 조회
    const laborEntries = db.prepare(`
      SELECT la.worker_id, w.name as worker_name, la.work_date, la.day_fraction, la.daily_wage
      FROM labor_assign la
      JOIN workers w ON la.worker_id = w.id
      WHERE la.project_id = ? AND la.work_date LIKE ?
    `).all(projectId, `${yearMonth}%`) as LaborEntry[]

    const validation = validatePayrollCalc({ laborCount: laborEntries.length, yearMonth })
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    // 보험요율 조회
    const year = parseInt(yearMonth.substring(0, 4))
    const rates = db.prepare('SELECT * FROM insurance_rates WHERE year = ?').all(year) as Array<{
      rate_type: string; worker_rate: number
    }>

    const rateMap: Record<string, number> = {}
    for (const r of rates) {
      rateMap[r.rate_type] = r.worker_rate
    }

    const natPensionRate = (rateMap['국민연금'] || 4.5) / 100
    const healthInsRate = (rateMap['건강보험'] || 3.545) / 100
    const longCareRate = (rateMap['장기요양보험'] || 0.4591) / 100
    const employInsRate = (rateMap['고용보험_실업급여'] || 0.9) / 100

    // 근로자별 집계
    const workerMap = new Map<number, { name: string; days: number; grossPay: number; dailyEntries: Array<{ wage: number; fraction: number }> }>()

    for (const entry of laborEntries) {
      let worker = workerMap.get(entry.worker_id)
      if (!worker) {
        worker = { name: entry.worker_name, days: 0, grossPay: 0, dailyEntries: [] }
        workerMap.set(entry.worker_id, worker)
      }
      worker.days += entry.day_fraction
      worker.grossPay += Math.round(entry.daily_wage * entry.day_fraction)
      worker.dailyEntries.push({ wage: entry.daily_wage, fraction: entry.day_fraction })
    }

    // 급여 계산 + upsert
    const upsert = db.prepare(`
      INSERT INTO payroll (worker_id, project_id, year_month, work_days, gross_pay,
        nat_pension, health_ins, long_care_ins, employ_ins, income_tax, local_tax, net_pay, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '계산완료')
      ON CONFLICT(worker_id, project_id, year_month) DO UPDATE SET
        work_days = excluded.work_days, gross_pay = excluded.gross_pay,
        nat_pension = excluded.nat_pension, health_ins = excluded.health_ins,
        long_care_ins = excluded.long_care_ins, employ_ins = excluded.employ_ins,
        income_tax = excluded.income_tax, local_tax = excluded.local_tax,
        net_pay = excluded.net_pay, status = '계산완료'
    `)

    // payroll 테이블에 UNIQUE 제약 추가 필요 — 일단 delete + insert 패턴 사용
    const deleteExisting = db.prepare(
      'DELETE FROM payroll WHERE project_id = ? AND year_month = ?'
    )

    const insert = db.prepare(`
      INSERT INTO payroll (worker_id, project_id, year_month, work_days, gross_pay,
        nat_pension, health_ins, long_care_ins, employ_ins, income_tax, local_tax, net_pay, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '계산완료')
    `)

    const calculate = db.transaction(() => {
      deleteExisting.run(projectId, yearMonth)

      const results: Array<Record<string, unknown>> = []

      for (const [workerId, worker] of workerMap) {
        const grossPay = worker.grossPay

        // 4대보험 (근로자 부담분)
        const natPension = Math.round(grossPay * natPensionRate)
        const healthIns = Math.round(grossPay * healthInsRate)
        const longCareIns = Math.round(healthIns * longCareRate / healthInsRate * healthInsRate > 0 ? longCareRate / healthInsRate : 0)
        const employIns = Math.round(grossPay * employInsRate)

        // 장기요양보험 = 건강보험료 × 12.95%
        const longCareInsCorrect = Math.round(healthIns * 0.1295)

        // 일용근로소득세: 일별로 계산 (15만원 공제는 일별 적용)
        let totalIncomeTax = 0
        for (const entry of worker.dailyEntries) {
          const dailyPay = Math.round(entry.wage * entry.fraction)
          const taxable = Math.max(0, dailyPay - 150000)
          // 세율 6%, 근로소득세액공제 55%
          const dailyTax = Math.round(taxable * 0.06 * (1 - 0.55))
          totalIncomeTax += dailyTax
        }

        const localTax = Math.round(totalIncomeTax * 0.1)

        const totalDeductions = natPension + healthIns + longCareInsCorrect + employIns + totalIncomeTax + localTax
        const netPay = grossPay - totalDeductions

        insert.run(workerId, projectId, yearMonth, worker.days, grossPay,
          natPension, healthIns, longCareInsCorrect, employIns, totalIncomeTax, localTax, netPay)

        results.push({
          worker_id: workerId, worker_name: worker.name,
          work_days: worker.days, gross_pay: grossPay,
          nat_pension: natPension, health_ins: healthIns, long_care_ins: longCareInsCorrect,
          employ_ins: employIns, income_tax: totalIncomeTax, local_tax: localTax, net_pay: netPay
        })
      }

      return results
    })

    const results = calculate()
    logAudit(db, '급여', projectId, '생성', `${yearMonth} 급여 계산 완료 (${results.length}명)`)
    return { records: results, warnings: validation.warnings }
  })

  // 급여 목록
  ipcMain.handle(IPC_CHANNELS.PAYROLL_LIST, (_event, projectId: number, yearMonth: string) => {
    return db.prepare(`
      SELECT p.*, w.name as worker_name
      FROM payroll p
      JOIN workers w ON p.worker_id = w.id
      WHERE p.project_id = ? AND p.year_month = ?
      ORDER BY w.name
    `).all(projectId, yearMonth)
  })

  // 급여 상세
  ipcMain.handle(IPC_CHANNELS.PAYROLL_GET, (_event, id: number) => {
    return db.prepare(`
      SELECT p.*, w.name as worker_name, pr.name as project_name
      FROM payroll p
      JOIN workers w ON p.worker_id = w.id
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.id = ?
    `).get(id)
  })

  // 급여 엑셀 내보내기
  ipcMain.handle(IPC_CHANNELS.PAYROLL_EXPORT_EXCEL, async (_event, projectId: number, yearMonth: string, savePath: string) => {
    return exportPayrollLedger(db, projectId, yearMonth, savePath)
  })
}
