import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Descriptions, Tag, Button, Tabs, Space, Typography, message, Upload, Table,
  Empty, Modal, Alert, List, Progress, Divider, Checkbox
} from 'antd'
import {
  ArrowLeftOutlined, UploadOutlined, PlusOutlined, ExportOutlined,
  CheckOutlined, ForwardOutlined
} from '@ant-design/icons'
import type { Project, DesignItem, GiseongRound } from '../../shared/types'

const { Title, Text } = Typography

const statusColors: Record<string, string> = {
  '입찰중': 'blue', '계약체결': 'cyan', '착공전': 'geekblue',
  '시공중': 'orange', '준공서류작성': 'gold', '준공검사': 'lime',
  '준공완료': 'green', '하자보증중': 'purple', '완료': 'default',
}

interface DesignPreviewData {
  items: unknown[]
  totalAmount: number
  itemCount: number
  byCategory: Record<string, number>
  byCostType: Record<string, number>
  validation: { warnings: string[] }
  contractAmount: number
  amountRatio: number
}

interface GiseongPreviewData {
  nextRoundNo: number
  designItemCount: number
  totalDesignAmount: number
  totalPreviousCumul: number
  remainingAmount: number
  overallProgress: number
  items: unknown[]
  existingRounds: { round_no: number; claim_amount: number; status: string }[]
}

interface WorkflowTask {
  id: number
  title: string
  description: string
  task_type: string
  status: string
  due_date: string | null
  auto_generated: boolean
}

interface AuditEntry {
  id: number
  entity_type: string
  entity_id: number
  action: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  description: string
  created_at: string
}

export default function ProjectDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [designItems, setDesignItems] = useState<DesignItem[]>([])
  const [giseongRounds, setGiseongRounds] = useState<GiseongRound[]>([])
  const [loading, setLoading] = useState(true)

  // Design import preview
  const [designPreviewOpen, setDesignPreviewOpen] = useState(false)
  const [designPreviewData, setDesignPreviewData] = useState<DesignPreviewData | null>(null)
  const [designPreviewFilePath, setDesignPreviewFilePath] = useState<string>('')
  const [designImporting, setDesignImporting] = useState(false)

  // Giseong round preview
  const [giseongPreviewOpen, setGiseongPreviewOpen] = useState(false)
  const [giseongPreviewData, setGiseongPreviewData] = useState<GiseongPreviewData | null>(null)
  const [giseongCreating, setGiseongCreating] = useState(false)

  // Workflow tasks
  const [workflowTasks, setWorkflowTasks] = useState<WorkflowTask[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(false)

  // Audit log
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const projectId = Number(id)

  useEffect(() => {
    loadProject()
  }, [id])

  async function loadProject() {
    setLoading(true)
    try {
      const [proj, items, rounds] = await Promise.all([
        window.api.projectGet(projectId),
        window.api.designItems(projectId),
        window.api.giseongRounds(projectId),
      ])
      setProject(proj)
      setDesignItems(items)
      setGiseongRounds(rounds)
    } catch {
      message.error('프로젝트를 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkflowTasks() {
    setWorkflowLoading(true)
    try {
      const tasks = await window.api.workflowTasks(projectId)
      setWorkflowTasks(tasks)
    } catch {
      message.error('할일 목록을 불러올 수 없습니다.')
    } finally {
      setWorkflowLoading(false)
    }
  }

  async function loadAuditLog() {
    setAuditLoading(true)
    try {
      const entries = await window.api.auditProjectAll(projectId)
      setAuditEntries(entries)
    } catch {
      message.error('변경이력을 불러올 수 없습니다.')
    } finally {
      setAuditLoading(false)
    }
  }

  async function handleImportDesign() {
    const filePath = await window.api.openFileDialog({
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    })
    if (!filePath) return

    try {
      const preview = await window.api.recommendDesignPreview(filePath, project!.contract_amount)
      setDesignPreviewData(preview)
      setDesignPreviewFilePath(filePath)
      setDesignPreviewOpen(true)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleDesignImportConfirm() {
    setDesignImporting(true)
    try {
      const result = await window.api.designImportExcel(projectId, designPreviewFilePath)
      message.success(`설계내역 ${result.count}건이 임포트되었습니다.`)
      setDesignPreviewOpen(false)
      setDesignPreviewData(null)
      setDesignPreviewFilePath('')
      loadProject()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setDesignImporting(false)
    }
  }

  async function handleCreateGiseongRound() {
    try {
      const preview = await window.api.recommendGiseongPreview(projectId)
      setGiseongPreviewData(preview)
      setGiseongPreviewOpen(true)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleGiseongCreateConfirm() {
    setGiseongCreating(true)
    try {
      await window.api.giseongRoundCreate({ project_id: projectId })
      message.success('새 기성 회차가 생성되었습니다.')
      setGiseongPreviewOpen(false)
      setGiseongPreviewData(null)
      loadProject()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setGiseongCreating(false)
    }
  }

  async function handleTaskComplete(taskId: number) {
    try {
      await window.api.workflowComplete(taskId)
      message.success('할일을 완료 처리했습니다.')
      loadWorkflowTasks()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleTaskSkip(taskId: number) {
    try {
      await window.api.workflowSkip(taskId)
      message.success('할일을 건너뛰었습니다.')
      loadWorkflowTasks()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  function handleTabChange(key: string) {
    if (key === 'workflow') {
      loadWorkflowTasks()
    } else if (key === 'audit') {
      loadAuditLog()
    }
  }

  if (loading || !project) {
    return <div>로딩 중...</div>
  }

  const designTotal = designItems.reduce((sum, item) => sum + item.total_price, 0)

  const designColumns = [
    { title: 'No', key: 'no', width: 50, render: (_: unknown, __: unknown, idx: number) => idx + 1 },
    { title: '공종', dataIndex: 'category', key: 'category', width: 100 },
    { title: '항목명', dataIndex: 'item_name', key: 'item_name' },
    { title: '단위', dataIndex: 'unit', key: 'unit', width: 60, align: 'center' as const },
    {
      title: '수량', dataIndex: 'quantity', key: 'quantity', width: 80,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '단가', dataIndex: 'unit_price', key: 'unit_price', width: 100,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString()
    },
    {
      title: '금액', dataIndex: 'total_price', key: 'total_price', width: 120,
      align: 'right' as const,
      render: (v: number) => `${v.toLocaleString()}원`
    },
    {
      title: '구분', dataIndex: 'cost_type', key: 'cost_type', width: 70,
      render: (v: string) => <Tag>{v}</Tag>
    },
  ]

  const giseongColumns = [
    { title: '회차', dataIndex: 'round_no', key: 'round_no', width: 60, render: (v: number) => `제${v}회` },
    {
      title: '기성금액', dataIndex: 'claim_amount', key: 'claim_amount', width: 140,
      align: 'right' as const,
      render: (v: number) => `${v.toLocaleString()}원`
    },
    {
      title: '승인금액', dataIndex: 'approved_amount', key: 'approved_amount', width: 140,
      align: 'right' as const,
      render: (v: number | null) => v != null ? `${v.toLocaleString()}원` : '-'
    },
    { title: '기성일자', dataIndex: 'claim_date', key: 'claim_date', width: 120, render: (v: string | null) => v || '-' },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 100,
      render: (s: string) => {
        const colors: Record<string, string> = { '작성중': 'blue', '청구완료': 'orange', '승인완료': 'green', '보완요청': 'red' }
        return <Tag color={colors[s]}>{s}</Tag>
      }
    },
    {
      title: '', key: 'actions', width: 60,
      render: (_: unknown, record: GiseongRound) => (
        <Button type="link" size="small" onClick={() => navigate(`/giseong?round=${record.id}`)}>
          상세
        </Button>
      )
    }
  ]

  const auditColumns = [
    {
      title: '일시', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR') : '-'
    },
    { title: '작업', dataIndex: 'action', key: 'action', width: 80 },
    { title: '대상', dataIndex: 'entity_type', key: 'entity_type', width: 100 },
    { title: '설명', dataIndex: 'description', key: 'description' },
  ]

  const taskStatusColors: Record<string, string> = {
    'pending': 'blue',
    'completed': 'green',
    'skipped': 'default',
  }

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
          목록
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title={project.name} bordered size="small" column={2}>
          <Descriptions.Item label="발주처">{project.client_name}</Descriptions.Item>
          <Descriptions.Item label="상태">
            <Tag color={statusColors[project.status]}>{project.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="계약유형">{project.contract_type}</Descriptions.Item>
          <Descriptions.Item label="계약방식">{project.contract_method}</Descriptions.Item>
          <Descriptions.Item label="계약금액">
            {project.contract_amount.toLocaleString()}원
          </Descriptions.Item>
          <Descriptions.Item label="계약기간">
            {project.start_date && project.end_date
              ? `${project.start_date} ~ ${project.end_date}`
              : '-'}
          </Descriptions.Item>
          {project.notes && (
            <Descriptions.Item label="비고" span={2}>{project.notes}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Tabs defaultActiveKey="design" onChange={handleTabChange} items={[
        {
          key: 'design',
          label: `설계내역 (${designItems.length}건)`,
          children: (
            <Card
              extra={
                <Button icon={<UploadOutlined />} onClick={handleImportDesign}>
                  엑셀 임포트
                </Button>
              }
            >
              {designItems.length > 0 ? (
                <>
                  <Table
                    dataSource={designItems}
                    columns={designColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6} align="center">
                          <strong>합 계</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <strong>{designTotal.toLocaleString()}원</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={7} />
                      </Table.Summary.Row>
                    )}
                  />
                </>
              ) : (
                <Empty description="설계내역이 없습니다. 엑셀 파일을 임포트해주세요." />
              )}
            </Card>
          )
        },
        {
          key: 'giseong',
          label: `기성처리 (${giseongRounds.length}회)`,
          children: (
            <Card
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateGiseongRound}
                  disabled={designItems.length === 0}
                >
                  새 기성 회차
                </Button>
              }
            >
              {giseongRounds.length > 0 ? (
                <Table
                  dataSource={giseongRounds}
                  columns={giseongColumns}
                  rowKey="id"
                  size="small"
                  pagination={false}
                />
              ) : (
                <Empty description={
                  designItems.length === 0
                    ? '먼저 설계내역을 임포트해주세요.'
                    : '기성 회차가 없습니다. 새 회차를 생성해주세요.'
                } />
              )}
            </Card>
          )
        },
        {
          key: 'docs',
          label: '증빙서류',
          children: (
            <Card>
              <Empty description="증빙서류 관리 (구현 예정)" />
            </Card>
          )
        },
        {
          key: 'workflow',
          label: '할일',
          children: (
            <Card>
              {workflowLoading ? (
                <div>로딩 중...</div>
              ) : workflowTasks.length > 0 ? (
                <List
                  dataSource={workflowTasks}
                  renderItem={(task) => (
                    <List.Item
                      actions={
                        task.status === 'pending'
                          ? [
                              <Button
                                key="complete"
                                type="primary"
                                size="small"
                                icon={<CheckOutlined />}
                                onClick={() => handleTaskComplete(task.id)}
                              >
                                완료
                              </Button>,
                              <Button
                                key="skip"
                                size="small"
                                icon={<ForwardOutlined />}
                                onClick={() => handleTaskSkip(task.id)}
                              >
                                건너뛰기
                              </Button>,
                            ]
                          : []
                      }
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag color={taskStatusColors[task.status]}>{task.status}</Tag>
                            <span>{task.title}</span>
                            {task.auto_generated && <Tag>자동생성</Tag>}
                          </Space>
                        }
                        description={
                          <Space direction="vertical" size={0}>
                            {task.description && <Text type="secondary">{task.description}</Text>}
                            {task.due_date && <Text type="secondary">기한: {task.due_date}</Text>}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="할일이 없습니다." />
              )}
            </Card>
          )
        },
        {
          key: 'audit',
          label: '변경이력',
          children: (
            <Card>
              {auditLoading ? (
                <div>로딩 중...</div>
              ) : auditEntries.length > 0 ? (
                <Table
                  dataSource={auditEntries}
                  columns={auditColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20 }}
                />
              ) : (
                <Empty description="변경이력이 없습니다." />
              )}
            </Card>
          )
        },
      ]} />

      {/* Design Import Preview Modal */}
      <Modal
        title="설계내역 임포트 미리보기"
        open={designPreviewOpen}
        onOk={handleDesignImportConfirm}
        onCancel={() => {
          setDesignPreviewOpen(false)
          setDesignPreviewData(null)
          setDesignPreviewFilePath('')
        }}
        okText="임포트 실행"
        cancelText="취소"
        confirmLoading={designImporting}
        width={600}
      >
        {designPreviewData && (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="항목 수">{designPreviewData.itemCount}건</Descriptions.Item>
              <Descriptions.Item label="총 금액">{designPreviewData.totalAmount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="계약금액">{designPreviewData.contractAmount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="계약 대비 비율">
                <Progress
                  percent={Math.round(designPreviewData.amountRatio * 100)}
                  size="small"
                  status={designPreviewData.amountRatio > 1 ? 'exception' : 'normal'}
                />
              </Descriptions.Item>
            </Descriptions>

            <Divider plain>공종별 내역</Divider>
            <Descriptions bordered size="small" column={1}>
              {Object.entries(designPreviewData.byCategory).map(([cat, amount]) => (
                <Descriptions.Item key={cat} label={cat}>
                  {(amount as number).toLocaleString()}원
                </Descriptions.Item>
              ))}
            </Descriptions>

            <Divider plain>비용구분별 내역</Divider>
            <Descriptions bordered size="small" column={1}>
              {Object.entries(designPreviewData.byCostType).map(([type, amount]) => (
                <Descriptions.Item key={type} label={type}>
                  {(amount as number).toLocaleString()}원
                </Descriptions.Item>
              ))}
            </Descriptions>

            {designPreviewData.validation.warnings.length > 0 && (
              <>
                <Divider plain>검증 경고</Divider>
                {designPreviewData.validation.warnings.map((warn, idx) => (
                  <Alert
                    key={idx}
                    message={warn}
                    type="warning"
                    showIcon
                    style={{ marginBottom: 8 }}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Giseong Round Preview Modal */}
      <Modal
        title="기성 회차 생성 미리보기"
        open={giseongPreviewOpen}
        onOk={handleGiseongCreateConfirm}
        onCancel={() => {
          setGiseongPreviewOpen(false)
          setGiseongPreviewData(null)
        }}
        okText="회차 생성"
        cancelText="취소"
        confirmLoading={giseongCreating}
        width={600}
      >
        {giseongPreviewData && (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="다음 회차">제{giseongPreviewData.nextRoundNo}회</Descriptions.Item>
              <Descriptions.Item label="설계항목 수">{giseongPreviewData.designItemCount}건</Descriptions.Item>
              <Descriptions.Item label="설계 총액">{giseongPreviewData.totalDesignAmount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="기집행 누계">{giseongPreviewData.totalPreviousCumul.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="잔여금액">{giseongPreviewData.remainingAmount.toLocaleString()}원</Descriptions.Item>
              <Descriptions.Item label="전체 진행률">
                <Progress percent={Math.round(giseongPreviewData.overallProgress * 100)} size="small" />
              </Descriptions.Item>
            </Descriptions>

            {giseongPreviewData.existingRounds.length > 0 && (
              <>
                <Divider plain>기존 회차 현황</Divider>
                <Table
                  dataSource={giseongPreviewData.existingRounds}
                  rowKey="round_no"
                  size="small"
                  pagination={false}
                  columns={[
                    { title: '회차', dataIndex: 'round_no', key: 'round_no', width: 80, render: (v: number) => `제${v}회` },
                    {
                      title: '기성금액', dataIndex: 'claim_amount', key: 'claim_amount',
                      align: 'right' as const,
                      render: (v: number) => `${v.toLocaleString()}원`
                    },
                    {
                      title: '상태', dataIndex: 'status', key: 'status', width: 100,
                      render: (s: string) => {
                        const colors: Record<string, string> = { '작성중': 'blue', '청구완료': 'orange', '승인완료': 'green', '보완요청': 'red' }
                        return <Tag color={colors[s]}>{s}</Tag>
                      }
                    },
                  ]}
                />
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
