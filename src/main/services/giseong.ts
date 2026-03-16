import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'

export function registerGiseongHandlers(db: Database.Database): void {
  // 기성 회차 목록
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUNDS, (_event, projectId: number) => {
    return db.prepare(`
      SELECT * FROM giseong_rounds
      WHERE project_id = ?
      ORDER BY round_no ASC
    `).all(projectId)
  })

  // 기성 회차 상세
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUND_GET, (_event, roundId: number) => {
    return db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId)
  })

  // 기성 회차 생성
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUND_CREATE, (_event, data: { project_id: number }) => {
    const { project_id } = data

    // 다음 회차 번호
    const last = db.prepare(
      'SELECT MAX(round_no) as max_no FROM giseong_rounds WHERE project_id = ?'
    ).get(project_id) as { max_no: number | null }
    const nextRound = (last.max_no || 0) + 1

    // 설계내역 항목 가져오기
    const designItems = db.prepare(
      'SELECT * FROM design_items WHERE project_id = ? ORDER BY sort_order'
    ).all(project_id) as Array<{ id: number; total_price: number }>

    if (designItems.length === 0) {
      throw new Error('설계내역이 등록되지 않았습니다. 먼저 설계내역서를 임포트해주세요.')
    }

    const createRound = db.transaction(() => {
      // 회차 생성
      const result = db.prepare(`
        INSERT INTO giseong_rounds (project_id, round_no) VALUES (?, ?)
      `).run(project_id, nextRound)
      const roundId = result.lastInsertRowid as number

      // 이전 회차의 누계 가져오기
      let prevRound: { id: number } | undefined
      if (nextRound > 1) {
        prevRound = db.prepare(
          'SELECT id FROM giseong_rounds WHERE project_id = ? AND round_no = ?'
        ).get(project_id, nextRound - 1) as { id: number } | undefined
      }

      // 각 설계내역별 기성 상세 생성
      const insertDetail = db.prepare(`
        INSERT INTO giseong_details (round_id, item_id, prev_rate, prev_amount, curr_rate, curr_amount, cumul_rate, cumul_amount)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `)

      for (const item of designItems) {
        let prevRate = 0
        let prevAmount = 0

        if (prevRound) {
          const prevDetail = db.prepare(
            'SELECT cumul_rate, cumul_amount FROM giseong_details WHERE round_id = ? AND item_id = ?'
          ).get(prevRound.id, item.id) as { cumul_rate: number; cumul_amount: number } | undefined

          if (prevDetail) {
            prevRate = prevDetail.cumul_rate
            prevAmount = prevDetail.cumul_amount
          }
        }

        // 금회 = 0, 누계 = 전회
        insertDetail.run(roundId, item.id, prevRate, prevAmount, prevRate, prevAmount)
      }

      return roundId
    })

    const roundId = createRound()
    return db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId)
  })

  // 기성 회차 수정 (상태, 메모 등)
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUND_UPDATE, (_event, roundId: number, data) => {
    const fields: string[] = []
    const params: Record<string, unknown> = { id: roundId }

    if (data.claim_date !== undefined) {
      fields.push('claim_date = @claim_date')
      params.claim_date = data.claim_date
    }
    if (data.status !== undefined) {
      fields.push('status = @status')
      params.status = data.status
    }
    if (data.approved_amount !== undefined) {
      fields.push('approved_amount = @approved_amount')
      params.approved_amount = data.approved_amount
    }
    if (data.notes !== undefined) {
      fields.push('notes = @notes')
      params.notes = data.notes
    }

    if (fields.length > 0) {
      db.prepare(`UPDATE giseong_rounds SET ${fields.join(', ')} WHERE id = @id`).run(params)
    }

    // claim_amount 재계산
    const total = db.prepare(
      'SELECT COALESCE(SUM(curr_amount), 0) as total FROM giseong_details WHERE round_id = ?'
    ).get(roundId) as { total: number }
    db.prepare('UPDATE giseong_rounds SET claim_amount = ? WHERE id = ?').run(total.total, roundId)

    return db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId)
  })

  // 기성 상세 목록 (내역별 진도율)
  ipcMain.handle(IPC_CHANNELS.GISEONG_DETAILS, (_event, roundId: number) => {
    return db.prepare(`
      SELECT gd.*, di.category, di.subcategory, di.item_name, di.unit, di.quantity,
             di.unit_price, di.total_price, di.cost_type
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.round_id = ?
      ORDER BY di.sort_order
    `).all(roundId)
  })

  // 기성 상세 수정 (진도율 입력)
  ipcMain.handle(IPC_CHANNELS.GISEONG_DETAIL_UPDATE, (_event, detailId: number, data: { curr_rate: number }) => {
    // 현재 상세 정보 가져오기
    const detail = db.prepare(`
      SELECT gd.*, di.total_price
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.id = ?
    `).get(detailId) as { prev_rate: number; prev_amount: number; total_price: number; round_id: number } | undefined

    if (!detail) throw new Error('기성 상세 정보를 찾을 수 없습니다.')

    const currRate = Math.max(0, Math.min(100, data.curr_rate))
    const cumulRate = detail.prev_rate + currRate
    if (cumulRate > 100) {
      throw new Error(`누계 진도율이 100%를 초과합니다. (전회: ${detail.prev_rate}% + 금회: ${currRate}% = ${cumulRate}%)`)
    }

    const currAmount = Math.round(detail.total_price * currRate / 100)
    const cumulAmount = detail.prev_amount + currAmount

    db.prepare(`
      UPDATE giseong_details SET
        curr_rate = ?,
        cumul_rate = ?,
        curr_amount = ?,
        cumul_amount = ?
      WHERE id = ?
    `).run(currRate, cumulRate, currAmount, cumulAmount, detailId)

    // 회차 총 기성금액 재계산
    const total = db.prepare(
      'SELECT COALESCE(SUM(curr_amount), 0) as total FROM giseong_details WHERE round_id = ?'
    ).get(detail.round_id) as { total: number }
    db.prepare('UPDATE giseong_rounds SET claim_amount = ? WHERE id = ?').run(total.total, detail.round_id)

    // 업데이트된 상세 반환
    return db.prepare(`
      SELECT gd.*, di.category, di.subcategory, di.item_name, di.unit, di.quantity,
             di.unit_price, di.total_price, di.cost_type
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.id = ?
    `).get(detailId)
  })

  // 기성내역서 엑셀 내보내기
  ipcMain.handle(IPC_CHANNELS.GISEONG_EXPORT_EXCEL, async (_event, roundId: number, savePath: string) => {
    const { exportGiseongExcel } = await import('../excel/writer')
    return exportGiseongExcel(db, roundId, savePath)
  })
}
