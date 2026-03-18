import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { logAudit, detectChanges } from './audit'
import { validateWorker } from './validation'
import { IPC_CHANNELS } from '../../shared/types'

export function registerWorkerHandlers(db: Database.Database): void {
  // 근로자 목록
  ipcMain.handle(IPC_CHANNELS.WORKER_LIST, (_event, filters?: { activeOnly?: boolean }) => {
    if (filters?.activeOnly) {
      return db.prepare('SELECT * FROM workers WHERE is_active = 1 ORDER BY name').all()
    }
    return db.prepare('SELECT * FROM workers ORDER BY is_active DESC, name').all()
  })

  // 근로자 등록
  ipcMain.handle(IPC_CHANNELS.WORKER_CREATE, (_event, data: Record<string, unknown>) => {
    const validation = validateWorker(data)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    const result = db.prepare(`
      INSERT INTO workers (name, resident_no, bank_name, bank_account, job_type, default_wage, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.resident_no || '', data.bank_name || '', data.bank_account || '',
      data.job_type, data.default_wage, data.phone || null
    )

    const created = db.prepare('SELECT * FROM workers WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>
    logAudit(db, '근로자', Number(result.lastInsertRowid), '생성', `근로자 '${data.name}' 등록`)
    return { ...created, warnings: validation.warnings }
  })

  // 근로자 수정
  ipcMain.handle(IPC_CHANNELS.WORKER_UPDATE, (_event, id: number, data: Record<string, unknown>) => {
    const validation = validateWorker(data)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    const old = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as Record<string, unknown>
    if (!old) throw new Error('근로자를 찾을 수 없습니다.')

    db.prepare(`
      UPDATE workers SET name = ?, resident_no = ?, bank_name = ?, bank_account = ?,
        job_type = ?, default_wage = ?, phone = ?
      WHERE id = ?
    `).run(
      data.name, data.resident_no || '', data.bank_name || '', data.bank_account || '',
      data.job_type, data.default_wage, data.phone || null, id
    )

    const changes = detectChanges(old, data, ['name', 'job_type', 'default_wage', 'phone', 'bank_name'])
    if (changes.length > 0) {
      logAudit(db, '근로자', id, '수정', `근로자 '${data.name}' 정보 수정`, changes)
    }

    const updated = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as Record<string, unknown>
    return { ...updated, warnings: validation.warnings }
  })

  // 근로자 삭제
  ipcMain.handle(IPC_CHANNELS.WORKER_DELETE, (_event, id: number) => {
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as Record<string, unknown>
    if (!worker) throw new Error('근로자를 찾을 수 없습니다.')

    const laborCount = (db.prepare('SELECT COUNT(*) as cnt FROM labor_assign WHERE worker_id = ?').get(id) as { cnt: number }).cnt
    if (laborCount > 0) {
      throw new Error(`이 근로자에게 ${laborCount}건의 출역 기록이 있어 삭제할 수 없습니다. 비활성화를 사용해주세요.`)
    }

    db.prepare('DELETE FROM workers WHERE id = ?').run(id)
    logAudit(db, '근로자', id, '삭제', `근로자 '${worker.name}' 삭제`)
    return { success: true }
  })

  // 근로자 활성/비활성 전환
  ipcMain.handle(IPC_CHANNELS.WORKER_TOGGLE_ACTIVE, (_event, id: number) => {
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as { name: string; is_active: number } | undefined
    if (!worker) throw new Error('근로자를 찾을 수 없습니다.')

    const newActive = worker.is_active ? 0 : 1
    db.prepare('UPDATE workers SET is_active = ? WHERE id = ?').run(newActive, id)
    logAudit(db, '근로자', id, '수정', `근로자 '${worker.name}' ${newActive ? '활성화' : '비활성화'}`)
    return db.prepare('SELECT * FROM workers WHERE id = ?').get(id)
  })
}
