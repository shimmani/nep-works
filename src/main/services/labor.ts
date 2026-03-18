import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { logAudit } from './audit'
import { validateLaborAssign } from './validation'
import { IPC_CHANNELS } from '../../shared/types'

export function registerLaborHandlers(db: Database.Database): void {
  // 출역 목록 (프로젝트 + 월별)
  ipcMain.handle(IPC_CHANNELS.LABOR_LIST, (_event, projectId: number, yearMonth: string) => {
    return db.prepare(`
      SELECT la.*, w.name as worker_name, p.name as project_name
      FROM labor_assign la
      JOIN workers w ON la.worker_id = w.id
      JOIN projects p ON la.project_id = p.id
      WHERE la.project_id = ? AND la.work_date LIKE ?
      ORDER BY la.work_date, w.name
    `).all(projectId, `${yearMonth}%`)
  })

  // 출역 단건 등록
  ipcMain.handle(IPC_CHANNELS.LABOR_CREATE, (_event, data: Record<string, unknown>) => {
    const validation = validateLaborAssign(data)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    // 동일 날짜/근로자/프로젝트 중복 체크
    const existing = db.prepare(
      'SELECT id FROM labor_assign WHERE project_id = ? AND worker_id = ? AND work_date = ?'
    ).get(data.project_id, data.worker_id, data.work_date)
    if (existing) {
      throw new Error('해당 날짜에 이미 출역 기록이 있습니다.')
    }

    const result = db.prepare(`
      INSERT INTO labor_assign (project_id, worker_id, work_date, work_type, day_fraction, daily_wage, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.project_id, data.worker_id, data.work_date,
      data.work_type || '일반', data.day_fraction ?? 1.0,
      data.daily_wage, data.notes || null
    )

    return db.prepare(`
      SELECT la.*, w.name as worker_name
      FROM labor_assign la JOIN workers w ON la.worker_id = w.id
      WHERE la.id = ?
    `).get(result.lastInsertRowid)
  })

  // 출역 일괄 등록
  ipcMain.handle(IPC_CHANNELS.LABOR_BULK_CREATE, (_event, entries: Array<Record<string, unknown>>) => {
    const insert = db.prepare(`
      INSERT INTO labor_assign (project_id, worker_id, work_date, work_type, day_fraction, daily_wage, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const bulkInsert = db.transaction(() => {
      let created = 0
      for (const data of entries) {
        // 중복 건너뛰기
        const existing = db.prepare(
          'SELECT id FROM labor_assign WHERE project_id = ? AND worker_id = ? AND work_date = ?'
        ).get(data.project_id, data.worker_id, data.work_date)
        if (existing) continue

        insert.run(
          data.project_id, data.worker_id, data.work_date,
          data.work_type || '일반', data.day_fraction ?? 1.0,
          data.daily_wage, data.notes || null
        )
        created++
      }
      return created
    })

    const count = bulkInsert()
    if (entries.length > 0) {
      logAudit(db, '출역', Number(entries[0].project_id), '생성', `출역 ${count}건 일괄 등록`)
    }
    return { created: count }
  })

  // 출역 수정
  ipcMain.handle(IPC_CHANNELS.LABOR_UPDATE, (_event, id: number, data: Record<string, unknown>) => {
    db.prepare(`
      UPDATE labor_assign SET work_type = ?, day_fraction = ?, daily_wage = ?, notes = ?
      WHERE id = ?
    `).run(data.work_type, data.day_fraction, data.daily_wage, data.notes || null, id)

    return db.prepare(`
      SELECT la.*, w.name as worker_name
      FROM labor_assign la JOIN workers w ON la.worker_id = w.id
      WHERE la.id = ?
    `).get(id)
  })

  // 출역 삭제
  ipcMain.handle(IPC_CHANNELS.LABOR_DELETE, (_event, id: number) => {
    db.prepare('DELETE FROM labor_assign WHERE id = ?').run(id)
    return { success: true }
  })

  // 전일 출역 복사
  ipcMain.handle(IPC_CHANNELS.LABOR_COPY_DAY, (_event, projectId: number, fromDate: string, toDate: string) => {
    const fromEntries = db.prepare(
      'SELECT * FROM labor_assign WHERE project_id = ? AND work_date = ?'
    ).all(projectId, fromDate) as Array<Record<string, unknown>>

    if (fromEntries.length === 0) {
      throw new Error(`${fromDate}에 출역 기록이 없습니다.`)
    }

    const insert = db.prepare(`
      INSERT INTO labor_assign (project_id, worker_id, work_date, work_type, day_fraction, daily_wage, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    const copyAll = db.transaction(() => {
      let created = 0
      for (const entry of fromEntries) {
        const existing = db.prepare(
          'SELECT id FROM labor_assign WHERE project_id = ? AND worker_id = ? AND work_date = ?'
        ).get(projectId, entry.worker_id, toDate)
        if (existing) continue

        insert.run(projectId, entry.worker_id, toDate, entry.work_type, entry.day_fraction, entry.daily_wage, null)
        created++
      }
      return created
    })

    const count = copyAll()
    return { created: count }
  })
}
