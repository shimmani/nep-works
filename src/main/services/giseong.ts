import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { IPC_CHANNELS } from '../../shared/types'
import { logAudit } from './audit'
import { validateGiseongRound, validateGiseongRate } from './validation'

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

  // 기성 회차 생성 (검증 포함)
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUND_CREATE, (_event, data: { project_id: number; confirmed?: boolean }) => {
    const { project_id } = data

    // 설계내역 항목
    const designItems = db.prepare(
      'SELECT * FROM design_items WHERE project_id = ? ORDER BY sort_order'
    ).all(project_id) as Array<{ id: number; total_price: number }>

    // 기존 회차
    const existingRounds = db.prepare(
      'SELECT round_no, status FROM giseong_rounds WHERE project_id = ? ORDER BY round_no'
    ).all(project_id) as Array<{ round_no: number; status: string }>

    // 검증
    const validation = validateGiseongRound({
      project_id,
      designItemCount: designItems.length,
      existingRounds,
    })

    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    // 경고가 있고 확인 안 된 경우 경고 반환 (프론트에서 확인 후 재요청)
    if (validation.warnings.length > 0 && !data.confirmed) {
      return { needsConfirmation: true, warnings: validation.warnings }
    }

    const nextRound = existingRounds.length > 0
      ? existingRounds[existingRounds.length - 1].round_no + 1
      : 1

    const createRound = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO giseong_rounds (project_id, round_no) VALUES (?, ?)
      `).run(project_id, nextRound)
      const roundId = result.lastInsertRowid as number

      // 이전 회차 누계 가져오기
      let prevRound: { id: number } | undefined
      if (nextRound > 1) {
        prevRound = db.prepare(
          'SELECT id FROM giseong_rounds WHERE project_id = ? AND round_no = ?'
        ).get(project_id, nextRound - 1) as { id: number } | undefined
      }

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

        insertDetail.run(roundId, item.id, prevRate, prevAmount, prevRate, prevAmount)
      }

      return roundId
    })

    const roundId = createRound()

    logAudit(db, '기성회차', roundId, '생성',
      `제${nextRound}회 기성 회차 생성 (설계내역 ${designItems.length}건)`)

    return db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId)
  })

  // 기성 회차 수정 (상태 변경시 검증 + 감사)
  ipcMain.handle(IPC_CHANNELS.GISEONG_ROUND_UPDATE, (_event, roundId: number, data) => {
    const existing = db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId) as Record<string, unknown>
    if (!existing) throw new Error('기성 회차를 찾을 수 없습니다.')

    // 상태 변경 검증
    if (data.status && data.status !== existing.status) {
      const validTransitions: Record<string, string[]> = {
        '작성중': ['청구완료'],
        '청구완료': ['승인완료', '보완요청'],
        '보완요청': ['작성중', '청구완료'],
        '승인완료': [],
      }
      const allowed = validTransitions[existing.status as string] || []
      if (!allowed.includes(data.status)) {
        throw new Error(
          `'${existing.status}'에서 '${data.status}'로 변경할 수 없습니다. 가능: ${allowed.join(', ') || '없음'}`
        )
      }

      // 청구완료 시 기성금액 0 체크
      if (data.status === '청구완료') {
        const total = db.prepare(
          'SELECT COALESCE(SUM(curr_amount), 0) as total FROM giseong_details WHERE round_id = ?'
        ).get(roundId) as { total: number }
        if (total.total === 0) {
          throw new Error('금회 기성금액이 0원입니다. 진도율을 입력한 후 청구해주세요.')
        }
      }
    }

    const fields: string[] = []
    const params: Record<string, unknown> = { id: roundId }
    const changeDesc: string[] = []

    if (data.claim_date !== undefined) {
      fields.push('claim_date = @claim_date')
      params.claim_date = data.claim_date
      if (data.claim_date !== existing.claim_date) changeDesc.push(`기성일자: ${data.claim_date}`)
    }
    if (data.status !== undefined) {
      fields.push('status = @status')
      params.status = data.status
      if (data.status !== existing.status) changeDesc.push(`상태: ${existing.status} → ${data.status}`)
    }
    if (data.approved_amount !== undefined) {
      fields.push('approved_amount = @approved_amount')
      params.approved_amount = data.approved_amount
      if (data.approved_amount !== existing.approved_amount) {
        changeDesc.push(`승인금액: ${Number(data.approved_amount).toLocaleString()}원`)
      }
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

    if (changeDesc.length > 0) {
      logAudit(db, '기성회차', roundId,
        data.status !== existing.status ? '상태변경' : '수정',
        `제${existing.round_no}회: ${changeDesc.join(', ')}`)
    }

    return db.prepare('SELECT * FROM giseong_rounds WHERE id = ?').get(roundId)
  })

  // 기성 상세 목록
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

  // 기성 상세 수정 (진도율 입력 - 검증 + 감사)
  ipcMain.handle(IPC_CHANNELS.GISEONG_DETAIL_UPDATE, (_event, detailId: number, data: { curr_rate: number }) => {
    const detail = db.prepare(`
      SELECT gd.*, di.total_price, di.item_name
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.id = ?
    `).get(detailId) as {
      prev_rate: number; prev_amount: number; curr_rate: number;
      total_price: number; round_id: number; item_name: string
    } | undefined

    if (!detail) throw new Error('기성 상세 정보를 찾을 수 없습니다.')

    // 회차가 작성중인지 확인
    const round = db.prepare('SELECT status, round_no FROM giseong_rounds WHERE id = ?').get(detail.round_id) as { status: string; round_no: number }
    if (round.status !== '작성중') {
      throw new Error(`제${round.round_no}회는 '${round.status}' 상태이므로 수정할 수 없습니다.`)
    }

    // 검증
    const validation = validateGiseongRate({
      prevRate: detail.prev_rate,
      currRate: data.curr_rate,
      itemName: detail.item_name,
      totalPrice: detail.total_price,
    })
    if (!validation.valid) {
      throw new Error(validation.errors.join('\n'))
    }

    const currRate = data.curr_rate
    const cumulRate = detail.prev_rate + currRate
    const currAmount = Math.round(detail.total_price * currRate / 100)
    const cumulAmount = detail.prev_amount + currAmount

    const oldRate = detail.curr_rate

    db.prepare(`
      UPDATE giseong_details SET curr_rate = ?, cumul_rate = ?, curr_amount = ?, cumul_amount = ?
      WHERE id = ?
    `).run(currRate, cumulRate, currAmount, cumulAmount, detailId)

    // 회차 총액 재계산
    const total = db.prepare(
      'SELECT COALESCE(SUM(curr_amount), 0) as total FROM giseong_details WHERE round_id = ?'
    ).get(detail.round_id) as { total: number }
    db.prepare('UPDATE giseong_rounds SET claim_amount = ? WHERE id = ?').run(total.total, detail.round_id)

    // 감사 로그 (값이 실제로 변경된 경우만)
    if (oldRate !== currRate) {
      logAudit(db, '기성상세', detailId, '수정',
        `"${detail.item_name}" 진도율: ${oldRate}% → ${currRate}% (금액: ${currAmount.toLocaleString()}원)`,
        [{ field: 'curr_rate', old: oldRate, new: currRate }])
    }

    const updatedDetail = db.prepare(`
        SELECT gd.*, di.category, di.subcategory, di.item_name, di.unit, di.quantity,
               di.unit_price, di.total_price, di.cost_type
        FROM giseong_details gd
        JOIN design_items di ON gd.item_id = di.id
        WHERE gd.id = ?
      `).get(detailId) as Record<string, unknown>
    return { ...updatedDetail, warnings: validation.warnings }
  })

  // 기성내역서 엑셀 내보내기 (감사 로그)
  ipcMain.handle(IPC_CHANNELS.GISEONG_EXPORT_EXCEL, async (_event, roundId: number, savePath: string) => {
    const { exportGiseongExcel } = await import('../excel/writer')
    const result = await exportGiseongExcel(db, roundId, savePath)

    const round = db.prepare('SELECT round_no, claim_amount FROM giseong_rounds WHERE id = ?').get(roundId) as { round_no: number; claim_amount: number }
    logAudit(db, '기성회차', roundId, '내보내기',
      `제${round.round_no}회 기성내역서 엑셀 내보내기 (${round.claim_amount.toLocaleString()}원) → ${savePath}`)

    return result
  })
}
