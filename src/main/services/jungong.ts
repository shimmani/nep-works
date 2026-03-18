import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { logAudit } from './audit'
import { IPC_CHANNELS } from '../../shared/types'
import { exportJungongChecklist } from '../excel/writer'

// 기본 준공서류 체크리스트 템플릿 (시설물 유지관리)
const DEFAULT_CHECKLIST = [
  { type: '행정', name: '준공계', order: 1 },
  { type: '행정', name: '준공내역서', order: 2 },
  { type: '행정', name: '준공사진첩', order: 3 },
  { type: '품질', name: '품질시험성과총괄표', order: 4 },
  { type: '품질', name: '자재검수확인서', order: 5 },
  { type: '안전', name: '안전관리비사용내역', order: 6 },
  { type: '환경', name: '환경관리비사용내역', order: 7 },
  { type: '행정', name: '하자보증서', order: 8 },
  { type: '행정', name: '하도급관련서류', order: 9 },
  { type: '환경', name: '폐기물처리확인서', order: 10 },
  { type: '노무', name: '노무비지급확인서', order: 11 },
  { type: '보험', name: '4대보험 납부확인서', order: 12 },
]

export function registerJungongHandlers(db: Database.Database): void {
  // 체크리스트 초기화 (기본 템플릿 삽입)
  ipcMain.handle(IPC_CHANNELS.JUNGONG_INIT_CHECKLIST, (_event, projectId: number) => {
    // 이미 존재하면 스킵
    const existing = (db.prepare('SELECT COUNT(*) as cnt FROM jungong_docs WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
    if (existing > 0) {
      return { created: 0, message: '이미 체크리스트가 초기화되어 있습니다.' }
    }

    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name: string } | undefined
    if (!project) throw new Error('프로젝트를 찾을 수 없습니다.')

    const insert = db.prepare(`
      INSERT INTO jungong_docs (project_id, doc_type, doc_name, status, sort_order)
      VALUES (?, ?, ?, '미완료', ?)
    `)

    const initAll = db.transaction(() => {
      for (const item of DEFAULT_CHECKLIST) {
        insert.run(projectId, item.type, item.name, item.order)
      }
      return DEFAULT_CHECKLIST.length
    })

    const count = initAll()
    logAudit(db, '준공서류', projectId, '생성', `준공서류 체크리스트 초기화 (${count}건)`)
    return { created: count }
  })

  // 체크리스트 조회
  ipcMain.handle(IPC_CHANNELS.JUNGONG_LIST, (_event, projectId: number) => {
    return db.prepare(`
      SELECT * FROM jungong_docs WHERE project_id = ? ORDER BY sort_order
    `).all(projectId)
  })

  // 항목 업데이트
  ipcMain.handle(IPC_CHANNELS.JUNGONG_UPDATE_ITEM, (_event, id: number, data: Record<string, unknown>) => {
    const old = db.prepare('SELECT * FROM jungong_docs WHERE id = ?').get(id) as Record<string, unknown>
    if (!old) throw new Error('항목을 찾을 수 없습니다.')

    db.prepare(`
      UPDATE jungong_docs SET status = ?, file_path = ?, notes = ?
      WHERE id = ?
    `).run(
      data.status ?? old.status,
      data.file_path !== undefined ? data.file_path : old.file_path,
      data.notes !== undefined ? data.notes : old.notes,
      id
    )

    if (data.status && data.status !== old.status) {
      logAudit(db, '준공서류', Number(old.project_id), '수정',
        `'${old.doc_name}' 상태: ${old.status} → ${data.status}`)
    }

    return db.prepare('SELECT * FROM jungong_docs WHERE id = ?').get(id)
  })

  // 진행률 조회
  ipcMain.handle(IPC_CHANNELS.JUNGONG_PROGRESS, (_event, projectId: number) => {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = '완료' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = '해당없음' THEN 1 ELSE 0 END) as not_applicable
      FROM jungong_docs WHERE project_id = ?
    `).get(projectId) as { total: number; completed: number; not_applicable: number }

    const applicable = stats.total - stats.not_applicable
    const progress = applicable > 0 ? Math.round(stats.completed / applicable * 100) : 0

    return {
      total: stats.total,
      completed: stats.completed,
      notApplicable: stats.not_applicable,
      remaining: applicable - stats.completed,
      progress
    }
  })

  // 체크리스트 엑셀 내보내기
  ipcMain.handle(IPC_CHANNELS.JUNGONG_EXPORT_EXCEL, async (_event, projectId: number, savePath: string) => {
    return exportJungongChecklist(db, projectId, savePath)
  })
}
