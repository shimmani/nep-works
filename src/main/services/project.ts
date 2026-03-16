import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'

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

  ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, (_event, data) => {
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
    return db.prepare(`
      SELECT p.*, c.name as client_name
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.id = ?
    `).get(result.lastInsertRowid)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_UPDATE, (_event, id: number, data) => {
    const stmt = db.prepare(`
      UPDATE projects SET
        client_id = @client_id,
        name = @name,
        contract_type = @contract_type,
        contract_method = @contract_method,
        contract_amount = @contract_amount,
        vat_included = @vat_included,
        start_date = @start_date,
        end_date = @end_date,
        status = @status,
        warranty_end_date = @warranty_end_date,
        folder_path = @folder_path,
        notes = @notes,
        updated_at = datetime('now','localtime')
      WHERE id = @id
    `)
    stmt.run({ ...data, id })
    return db.prepare(`
      SELECT p.*, c.name as client_name
      FROM projects p
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE p.id = ?
    `).get(id)
  })

  ipcMain.handle(IPC_CHANNELS.PROJECT_DELETE, (_event, id: number) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return { success: true }
  })
}
