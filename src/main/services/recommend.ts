import { ipcMain } from 'electron'
import Database from 'better-sqlite3'

/**
 * 자동 추천/자동완성 서비스
 * 과거 데이터 기반으로 입력값 추천
 */

export function registerRecommendHandlers(db: Database.Database): void {
  // 발주처 선택시 기본값 추천 (과거 프로젝트 기반)
  ipcMain.handle('recommend:project-defaults', (_event, clientId: number) => {
    // 해당 발주처의 최근 프로젝트 5건에서 패턴 추출
    const recentProjects = db.prepare(`
      SELECT contract_type, contract_method, contract_amount,
             start_date, end_date,
             julianday(end_date) - julianday(start_date) as duration_days
      FROM projects
      WHERE client_id = ? AND start_date IS NOT NULL AND end_date IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 5
    `).all(clientId) as Array<{
      contract_type: string
      contract_method: string
      contract_amount: number
      duration_days: number
    }>

    if (recentProjects.length === 0) {
      return { hasHistory: false }
    }

    // 가장 흔한 계약유형/방식
    const typeCounts: Record<string, number> = {}
    const methodCounts: Record<string, number> = {}
    let totalAmount = 0
    let totalDuration = 0

    for (const p of recentProjects) {
      typeCounts[p.contract_type] = (typeCounts[p.contract_type] || 0) + 1
      methodCounts[p.contract_method] = (methodCounts[p.contract_method] || 0) + 1
      totalAmount += p.contract_amount
      totalDuration += p.duration_days || 0
    }

    const mostCommonType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const mostCommonMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const avgAmount = Math.round(totalAmount / recentProjects.length)
    const avgDuration = Math.round(totalDuration / recentProjects.length)

    // 발주처 커스텀 기본값 조회
    const customDefaults = db.prepare(
      'SELECT setting_key, setting_value FROM client_defaults WHERE client_id = ?'
    ).all(clientId) as Array<{ setting_key: string; setting_value: string }>

    const customMap: Record<string, string> = {}
    for (const d of customDefaults) {
      customMap[d.setting_key] = d.setting_value
    }

    return {
      hasHistory: true,
      projectCount: recentProjects.length,
      recommended: {
        contract_type: customMap.default_contract_type || mostCommonType,
        contract_method: customMap.default_contract_method || mostCommonMethod,
        avg_amount: avgAmount,
        avg_duration_days: avgDuration,
      },
      customDefaults: customMap,
    }
  })

  // 기성 진도율 추천 (같은 발주처의 유사 프로젝트 패턴)
  ipcMain.handle('recommend:giseong-rates', (_event, projectId: number, roundNo: number) => {
    // 현재 프로젝트 정보
    const project = db.prepare(`
      SELECT p.*, c.id as cid FROM projects p
      JOIN clients c ON p.client_id = c.id
      WHERE p.id = ?
    `).get(projectId) as { cid: number; contract_amount: number } | undefined

    if (!project) return { hasPattern: false }

    // 같은 발주처의 다른 프로젝트에서 같은 회차의 평균 진도율
    const pattern = db.prepare(`
      SELECT AVG(gd.curr_rate) as avg_rate, di.cost_type
      FROM giseong_details gd
      JOIN giseong_rounds gr ON gd.round_id = gr.id
      JOIN design_items di ON gd.item_id = di.id
      JOIN projects p ON gr.project_id = p.id
      WHERE p.client_id = ? AND p.id != ? AND gr.round_no = ?
      GROUP BY di.cost_type
    `).all(project.cid, projectId, roundNo) as Array<{ avg_rate: number; cost_type: string }>

    if (pattern.length === 0) return { hasPattern: false }

    return {
      hasPattern: true,
      suggestedRates: pattern.map(p => ({
        cost_type: p.cost_type,
        suggested_rate: Math.round(p.avg_rate * 10) / 10,
      })),
      note: `${roundNo}회차 기성에서 같은 발주처 과거 프로젝트의 평균 진도율입니다.`
    }
  })

  // 프리뷰: 기성 회차 생성 전 예상 결과
  ipcMain.handle('recommend:giseong-preview', (_event, projectId: number) => {
    const designItems = db.prepare(
      'SELECT * FROM design_items WHERE project_id = ? ORDER BY sort_order'
    ).all(projectId) as Array<{ id: number; category: string; item_name: string; total_price: number; cost_type: string }>

    const rounds = db.prepare(
      'SELECT * FROM giseong_rounds WHERE project_id = ? ORDER BY round_no'
    ).all(projectId) as Array<{ id: number; round_no: number; claim_amount: number; status: string }>

    const nextRoundNo = rounds.length > 0 ? rounds[rounds.length - 1].round_no + 1 : 1

    // 이전 회차의 누계
    let prevCumul: Record<number, { rate: number; amount: number }> = {}
    if (rounds.length > 0) {
      const lastRound = rounds[rounds.length - 1]
      const details = db.prepare(
        'SELECT item_id, cumul_rate, cumul_amount FROM giseong_details WHERE round_id = ?'
      ).all(lastRound.id) as Array<{ item_id: number; cumul_rate: number; cumul_amount: number }>
      for (const d of details) {
        prevCumul[d.item_id] = { rate: d.cumul_rate, amount: d.cumul_amount }
      }
    }

    const totalDesign = designItems.reduce((s, i) => s + i.total_price, 0)
    const totalPrevCumul = Object.values(prevCumul).reduce((s, v) => s + v.amount, 0)
    const remainingAmount = totalDesign - totalPrevCumul

    return {
      nextRoundNo,
      designItemCount: designItems.length,
      totalDesignAmount: totalDesign,
      totalPreviousCumul: totalPrevCumul,
      remainingAmount,
      overallProgress: totalDesign > 0 ? Math.round(totalPrevCumul / totalDesign * 1000) / 10 : 0,
      items: designItems.map(item => ({
        id: item.id,
        category: item.category,
        item_name: item.item_name,
        total_price: item.total_price,
        prev_cumul_rate: prevCumul[item.id]?.rate || 0,
        remaining_rate: 100 - (prevCumul[item.id]?.rate || 0),
        remaining_amount: item.total_price - (prevCumul[item.id]?.amount || 0),
      })),
      existingRounds: rounds.map(r => ({
        round_no: r.round_no,
        amount: r.claim_amount,
        status: r.status,
      })),
    }
  })

  // 발주처 기본 설정 저장
  ipcMain.handle('recommend:save-client-default', (_event, clientId: number, key: string, value: string) => {
    db.prepare(`
      INSERT INTO client_defaults (client_id, setting_key, setting_value)
      VALUES (?, ?, ?)
      ON CONFLICT(client_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value
    `).run(clientId, key, value)
    return { success: true }
  })

  // 설계내역 임포트 프리뷰 (파일 파싱만 하고 저장은 안 함)
  ipcMain.handle('recommend:design-preview', async (_event, filePath: string, contractAmount: number) => {
    const { importDesignFromExcel } = await import('../excel/reader')
    const { validateDesignImport } = await import('./validation')

    const items = await importDesignFromExcel(filePath)
    const validation = validateDesignImport(items, contractAmount)

    const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0)
    const byCategory: Record<string, { count: number; amount: number }> = {}
    const byCostType: Record<string, { count: number; amount: number }> = {}

    for (const item of items) {
      const cat = item.category || '(미분류)'
      byCategory[cat] = byCategory[cat] || { count: 0, amount: 0 }
      byCategory[cat].count++
      byCategory[cat].amount += item.total_price

      byCostType[item.cost_type] = byCostType[item.cost_type] || { count: 0, amount: 0 }
      byCostType[item.cost_type].count++
      byCostType[item.cost_type].amount += item.total_price
    }

    return {
      items,
      totalAmount,
      itemCount: items.length,
      byCategory: Object.entries(byCategory).map(([name, data]) => ({ name, ...data })),
      byCostType: Object.entries(byCostType).map(([name, data]) => ({ name, ...data })),
      validation,
      contractAmount,
      amountRatio: contractAmount > 0 ? Math.round(totalAmount / contractAmount * 1000) / 10 : 0,
    }
  })

  // 엑셀 내보내기 전 검증 프리뷰
  ipcMain.handle('recommend:export-preview', (_event, roundId: number) => {
    const { validateGiseongExport } = require('./validation')

    const round = db.prepare(`
      SELECT gr.*, p.name as project_name, p.contract_amount, c.name as client_name
      FROM giseong_rounds gr
      JOIN projects p ON gr.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE gr.id = ?
    `).get(roundId) as Record<string, unknown>

    const details = db.prepare(`
      SELECT gd.*, di.category, di.item_name, di.total_price, di.cost_type
      FROM giseong_details gd
      JOIN design_items di ON gd.item_id = di.id
      WHERE gd.round_id = ?
      ORDER BY di.sort_order
    `).all(roundId) as Array<Record<string, unknown>>

    const totalDesign = details.reduce((s, d) => s + (d.total_price as number || 0), 0)
    const totalCurr = details.reduce((s, d) => s + (d.curr_amount as number || 0), 0)
    const totalCumul = details.reduce((s, d) => s + (d.cumul_amount as number || 0), 0)

    const validation = validateGiseongExport({
      roundStatus: round.status as string,
      details: details as Array<{ curr_rate: number; cumul_rate: number; item_name: string }>,
      claimAmount: round.claim_amount as number,
    })

    return {
      round,
      summary: {
        totalDesign,
        totalCurr,
        totalCumul,
        progressPercent: totalDesign > 0 ? Math.round(totalCumul / totalDesign * 1000) / 10 : 0,
        itemCount: details.length,
        changedItems: details.filter(d => (d.curr_rate as number) > 0).length,
      },
      validation,
    }
  })
}
