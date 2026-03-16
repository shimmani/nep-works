import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'

export function registerClientHandlers(db: Database.Database): void {
  ipcMain.handle(IPC_CHANNELS.CLIENT_LIST, () => {
    return db.prepare('SELECT * FROM clients ORDER BY name').all()
  })

  ipcMain.handle(IPC_CHANNELS.CLIENT_GET, (_event, id: number) => {
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  })

  ipcMain.handle(IPC_CHANNELS.CLIENT_CREATE, (_event, data) => {
    const stmt = db.prepare(`
      INSERT INTO clients (name, region, contact_person, contact_phone, address, template_set, notes)
      VALUES (@name, @region, @contact_person, @contact_phone, @address, @template_set, @notes)
    `)
    const result = stmt.run(data)
    return { id: result.lastInsertRowid, ...data }
  })

  ipcMain.handle(IPC_CHANNELS.CLIENT_UPDATE, (_event, id: number, data) => {
    const stmt = db.prepare(`
      UPDATE clients SET
        name = @name,
        region = @region,
        contact_person = @contact_person,
        contact_phone = @contact_phone,
        address = @address,
        template_set = @template_set,
        notes = @notes,
        updated_at = datetime('now','localtime')
      WHERE id = @id
    `)
    stmt.run({ ...data, id })
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id)
  })

  ipcMain.handle(IPC_CHANNELS.CLIENT_DELETE, (_event, id: number) => {
    // 프로젝트가 있으면 삭제 불가
    const projects = db.prepare('SELECT COUNT(*) as cnt FROM projects WHERE client_id = ?').get(id) as { cnt: number }
    if (projects.cnt > 0) {
      throw new Error(`이 발주처에 ${projects.cnt}건의 프로젝트가 등록되어 있어 삭제할 수 없습니다.`)
    }
    db.prepare('DELETE FROM clients WHERE id = ?').run(id)
    return { success: true }
  })
}
