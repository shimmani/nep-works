import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'

export function registerDesignHandlers(db: Database.Database): void {
  // 설계내역 목록
  ipcMain.handle(IPC_CHANNELS.DESIGN_ITEMS, (_event, projectId: number) => {
    return db.prepare(
      'SELECT * FROM design_items WHERE project_id = ? ORDER BY sort_order'
    ).all(projectId)
  })

  // 엑셀에서 설계내역 임포트
  ipcMain.handle(IPC_CHANNELS.DESIGN_IMPORT_EXCEL, async (_event, projectId: number, filePath: string) => {
    const { importDesignFromExcel } = await import('../excel/reader')
    const items = await importDesignFromExcel(filePath)

    const importItems = db.transaction(() => {
      // 기존 데이터 삭제 (기성이 진행된 경우 삭제 방지)
      const rounds = db.prepare(
        'SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?'
      ).get(projectId) as { cnt: number }

      if (rounds.cnt > 0) {
        throw new Error('이미 기성이 진행된 프로젝트입니다. 설계내역을 초기화하려면 기성 데이터를 먼저 삭제해주세요.')
      }

      db.prepare('DELETE FROM design_items WHERE project_id = ?').run(projectId)

      const insert = db.prepare(`
        INSERT INTO design_items (project_id, category, subcategory, item_name, unit, quantity, unit_price, total_price, cost_type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let sortOrder = 0
      for (const item of items) {
        insert.run(
          projectId,
          item.category || '',
          item.subcategory || null,
          item.item_name,
          item.unit || '',
          item.quantity || 0,
          item.unit_price || 0,
          item.total_price || 0,
          item.cost_type || '재료비',
          sortOrder++
        )
      }

      return sortOrder
    })

    const count = importItems()
    return { success: true, count }
  })
}
