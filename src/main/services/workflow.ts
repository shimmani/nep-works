import { ipcMain } from 'electron'
import Database from 'better-sqlite3'
import { logAudit } from './audit'

/**
 * 워크플로우 자동화 서비스
 * - 프로젝트 상태 변경시 자동으로 할일/알림 생성
 * - 다음 단계 안내
 * - 기한 관리
 */

interface WorkflowTask {
  id: number
  project_id: number
  task_type: string
  title: string
  description: string | null
  due_date: string | null
  status: string
  auto_generated: number
  created_at: string
  completed_at: string | null
}

// 상태별 자동 생성 할일 정의
const STATUS_TASKS: Record<string, Array<{ type: string; title: string; desc: string; dueDays?: number }>> = {
  '계약체결': [
    { type: '서류', title: '계약서 스캔 및 첨부', desc: '원본 계약서를 스캔하여 프로젝트 폴더에 저장' },
    { type: '설정', title: '설계내역서 엑셀 임포트', desc: '설계내역서를 시스템에 등록하여 기성처리 준비' },
    { type: '설정', title: '착공일 확인 및 상태 변경', desc: '착공일이 되면 프로젝트 상태를 "시공중"으로 변경' },
  ],
  '시공중': [
    { type: '기성', title: '1회차 기성 회차 생성', desc: '첫 기성 청구를 위한 회차 생성' },
    { type: '사진', title: '착공 전 현장 사진 촬영', desc: '준공사진첩에 사용할 착공 전 사진 촬영 및 보관' },
    { type: '노무', title: '일용직 출역 기록 시작', desc: '현장 근로자 출역 기록을 매일 입력' },
  ],
  '준공서류작성': [
    { type: '서류', title: '준공내역서 작성', desc: '최종 기성 기반 준공내역서 생성' },
    { type: '사진', title: '준공 후 현장 사진 촬영', desc: '준공사진첩에 사용할 완공 후 사진' },
    { type: '서류', title: '품질관리 서류 취합', desc: '자재 시험성적서, 반입확인서, 품질시험 결과' },
    { type: '서류', title: '안전관리 서류 정리', desc: '안전교육일지, 안전점검 체크리스트' },
    { type: '서류', title: '노무비 관련 서류', desc: '노무비 지급대장, 4대보험 납부확인서' },
    { type: '서류', title: '준공사진첩 생성', desc: '착공전/시공중/준공후 사진첩 자동 생성' },
  ],
  '준공완료': [
    { type: '설정', title: '하자보증 기간 설정', desc: '하자보증 종료일을 입력하고 상태를 "하자보증중"으로 변경' },
    { type: '서류', title: '하자보수보증서 첨부', desc: '보증보험 또는 보증서 스캔 첨부' },
  ],
}

export function registerWorkflowHandlers(db: Database.Database): void {
  // 프로젝트 할일 목록
  ipcMain.handle('workflow:tasks', (_event, projectId: number) => {
    return db.prepare(`
      SELECT * FROM workflow_tasks
      WHERE project_id = ?
      ORDER BY status ASC, due_date ASC, created_at ASC
    `).all(projectId)
  })

  // 할일 완료 처리
  ipcMain.handle('workflow:complete', (_event, taskId: number) => {
    db.prepare(`
      UPDATE workflow_tasks SET status = '완료', completed_at = datetime('now','localtime')
      WHERE id = ?
    `).run(taskId)
    return { success: true }
  })

  // 할일 건너뛰기
  ipcMain.handle('workflow:skip', (_event, taskId: number) => {
    db.prepare(`
      UPDATE workflow_tasks SET status = '건너뜀', completed_at = datetime('now','localtime')
      WHERE id = ?
    `).run(taskId)
    return { success: true }
  })

  // 수동 할일 추가
  ipcMain.handle('workflow:create', (_event, data: { project_id: number; title: string; description?: string; due_date?: string }) => {
    const result = db.prepare(`
      INSERT INTO workflow_tasks (project_id, task_type, title, description, due_date, auto_generated)
      VALUES (?, '수동', ?, ?, ?, 0)
    `).run(data.project_id, data.title, data.description || null, data.due_date || null)
    return db.prepare('SELECT * FROM workflow_tasks WHERE id = ?').get(result.lastInsertRowid)
  })

  // 대시보드용: 전체 미완료 할일
  ipcMain.handle('workflow:pending-all', () => {
    return db.prepare(`
      SELECT wt.*, p.name as project_name
      FROM workflow_tasks wt
      JOIN projects p ON wt.project_id = p.id
      WHERE wt.status = '대기'
      ORDER BY wt.due_date ASC, wt.created_at ASC
      LIMIT 50
    `).all()
  })

  // 프로젝트 상태 변경시 자동 할일 생성
  ipcMain.handle('workflow:on-status-change', (_event, projectId: number, newStatus: string) => {
    const tasks = STATUS_TASKS[newStatus]
    if (!tasks || tasks.length === 0) return { created: 0 }

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { end_date: string | null } | undefined
    if (!project) return { created: 0 }

    const insert = db.prepare(`
      INSERT INTO workflow_tasks (project_id, task_type, title, description, due_date, auto_generated)
      VALUES (?, ?, ?, ?, ?, 1)
    `)

    const createTasks = db.transaction(() => {
      let created = 0
      for (const task of tasks) {
        // 중복 방지
        const existing = db.prepare(
          'SELECT id FROM workflow_tasks WHERE project_id = ? AND title = ? AND status = ?'
        ).get(projectId, task.title, '대기')
        if (existing) continue

        let dueDate: string | null = null
        if (task.dueDays && project.end_date) {
          const d = new Date(project.end_date)
          d.setDate(d.getDate() - task.dueDays)
          dueDate = d.toISOString().split('T')[0]
        }

        insert.run(projectId, task.type, task.title, task.desc, dueDate)
        created++
      }
      return created
    })

    const count = createTasks()
    logAudit(db, '프로젝트', projectId, '상태변경', `상태 → ${newStatus}, 할일 ${count}건 자동 생성`)
    return { created: count }
  })

  // 다음 단계 추천
  ipcMain.handle('workflow:next-steps', (_event, projectId: number) => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, unknown> | undefined
    if (!project) return { steps: [] }

    const status = project.status as string
    const steps: Array<{ action: string; description: string; ready: boolean; reason?: string }> = []

    switch (status) {
      case '계약체결': {
        const designCount = (db.prepare('SELECT COUNT(*) as cnt FROM design_items WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
        steps.push({
          action: '설계내역 임포트',
          description: '설계내역서 엑셀을 시스템에 등록',
          ready: designCount === 0,
          reason: designCount > 0 ? `이미 ${designCount}건 등록됨` : undefined
        })
        steps.push({
          action: '상태를 "시공중"으로 변경',
          description: '착공일에 맞춰 상태 변경',
          ready: designCount > 0,
          reason: designCount === 0 ? '설계내역을 먼저 임포트해주세요' : undefined
        })
        break
      }
      case '시공중': {
        const roundCount = (db.prepare('SELECT COUNT(*) as cnt FROM giseong_rounds WHERE project_id = ?').get(projectId) as { cnt: number }).cnt
        const inProgressRound = db.prepare("SELECT * FROM giseong_rounds WHERE project_id = ? AND status = '작성중' LIMIT 1").get(projectId) as { round_no: number } | undefined
        steps.push({
          action: inProgressRound ? `제${inProgressRound.round_no}회 기성 완료` : '새 기성 회차 생성',
          description: inProgressRound ? '진도율 입력 후 청구' : '다음 기성 청구를 위한 회차 생성',
          ready: true
        })
        steps.push({
          action: '준공서류 작성 시작',
          description: '공사 완료시 상태 변경',
          ready: roundCount > 0
        })
        break
      }
      case '준공서류작성': {
        steps.push({
          action: '준공사진첩 생성',
          description: '사진 폴더를 선택하여 자동 생성',
          ready: true
        })
        steps.push({
          action: '준공검사 요청',
          description: '모든 서류 준비 완료 후',
          ready: true
        })
        break
      }
    }

    return { steps, currentStatus: status }
  })
}
