import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'
import { logAudit, detectChanges } from './audit'
import { validateProject, validateStatusTransition } from './validation'

export function registerProjectHandlers(db: Database.Database): void {
  ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, (_event, filters?: { status?: string; year?: number }) => {
    let query = `
      SELECT p.*, c.name as client_name
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE 1=1
    `
    const params: unknown[] = []

    if (filters?.status) {
      query += ' AND p.status = ?'
      params.push(filters.status)
    }

    if (filters?.year) {
      query += ' AND (strftime("%Y", p.start_date) = ? OR strftime("%Y", p.end_date) = ?)'
      params.push(String(filters.year), String(filters.year))
    }

    query += ' ORDER BY p.created_at DESC'
    return db.prepare(query).all(...params)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET, (_event, id: number) => {
    return db.prepare(`
      SELECT p.*, c.name as client_name
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.id = ?
    `).get(id)
  })

  // 프로젝트 생성 전 검증
  ipcMain.handle('project:validate', (_event, data) => {
    return validateProject(data)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, (_event, data) => {
    // 검증
    const validation = validateProject(data)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    const stmt = db.prepare(`
      INSERT INTO projects (
        client_id, name, contract_type, contract_method,
        contract_amount, vat_included, start_date, end_date,
        status, warranty_end_date, folder_path, notes
      ) VALUES (
        @client_id, @name, @contract_type, @contract_method,
        @contract_amount, @vat_included, @start_date, @end_date,
        @status, @warranty_end_date, @folder_path, @notes
      )
    `)
    const result = stmt.run(data)
    const projectId = result.lastInsertRowid as number

    // 감사 로그
    logAudit(db, '프로젝트', projectId, '생성',
      `프로젝트 "${data.name}" 생성 (${data.contract_method}, ${Number(data.contract_amount).toLocaleString()}원)`)

    const created = db.prepare(`
        SELECT p.*, c.name as client_name
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        WHERE p.id = ?
      `).get(projectId) as Record<string, unknown>
    return { ...created, warnings: validation.warnings }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, (_event, id: number, data) => {
    // 기존 데이터 조회
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown>
    if (!existing) throw new Error('프로젝트를 찾을 수 없습니다.')

    // 검증
    const validation = validateProject(data)
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    // 상태 전이 검증
    if (data.status !== existing.status) {
      const statusValidation = validateStatusTransition(existing.status as string, data.status)
      if (!statusValidation.valid) {
        throw new Error(statusValidation.errors.join('\n'))
      }
      validation.warnings.push(...statusValidation.warnings)
    }

    // 변경 내역 감지
    const changes = detectChanges(existing, data, [
      'name', 'client_id', 'contract_type', 'contract_method',
      'contract_amount', 'start_date', 'end_date', 'status', 'notes'
    ])

    const stmt = db.prepare(`
      UPDATE projects SET
        client_id = @client_id, name = @name,
        contract_type = @contract_type, contract_method = @contract_method,
        contract_amount = @contract_amount, vat_included = @vat_included,
        start_date = @start_date, end_date = @end_date,
        status = @status, warranty_end_date = @warranty_end_date,
        folder_path = @folder_path, notes = @notes,
        updated_at = datetime('now','localtime')
      WHERE id = @id
    `)
    stmt.run({ ...data, id })

    // 감사 로그 (변경된 필드만)
    if (changes.length > 0) {
      logAudit(db, '프로젝트', id, data.status !== existing.status ? '상태변경' : '수정',
        `프로젝트 수정: ${changes.map(c => `${c.field}: ${c.old} → ${c.new}`).join(', ')}`,
        changes
      )
    }

    const updated = db.prepare(`
        SELECT p.*, c.name as client_name
        FROM projects p
        LEFT JOIN clients c ON p.client_id = c.id
        WHERE p.id = ?
      `).get(id) as Record<string, unknown>
    return { ...updated, warnings: validation.warnings }
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_event, id: number) => {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(id) as { name: string } | undefined
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.')

    // 기성이 진행중이면 삭제 경고
    const rounds = db.prepare(
      "SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ? AND status != '작성중'"
    ).get(id) as { cnt: number }
    if (rounds.cnt > 0) {
      throw new Error(`${rounds.cnt}건의 기성이 청구/승인 상태이므로 삭제할 수 없습니다. 먼저 기성을 정리해주세요.`)
    }

    logAudit(db, '프로젝트', id, '삭제', `프로젝트 "${project.name}" 삭제`)
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return { success: true }
  })
}
