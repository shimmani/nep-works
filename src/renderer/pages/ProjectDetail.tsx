import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card, Descriptions, Tag, Button, Tabs, Space, Typography, message, Upload, Table,
  Empty
} from 'antd'
import {
  ArrowLeftOutlined, UploadOutlined, PlusOutlined, ExportOutlined
} from '@ant-design/icons'
import type { Project, DesignItem, GiseongRound } from '../../shared/types'

const { Title } = Typography

const statusColors: Record<string, string> = {
  '입찰중': 'blue', '계약체결': 'cyan', '착공전': 'geekblue',
  '시공중': 'orange', '준공서류작성': 'gold', '준공검사': 'lime',
  '준공완료': 'green', '하자보증중': 'purple', '완료': 'default',
}

export default function ProjectDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [designItems, setDesignItems] = useState<DesignItem[]>([])
  const [giseongRounds, setGiseongRounds] = useState<GiseongRound[]>([])
  const [loading, setLoading] = useState(true)

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

  async function handleImportDesign() {
    const filePath = await window.api.openFileDialog({
      filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
    })
    if (!filePath) return

    try {
      const result = await window.api.designImportExcel(projectId, filePath)
      message.success(`설계내역 ${result.count}건이 임포트되었습니다.`)
      loadProject()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleCreateGiseongRound() {
    try {
      await window.api.giseongRoundCreate({ project_id: projectId })
      message.success('새 기성 회차가 생성되었습니다.')
      loadProject()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
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

      <Tabs defaultActiveKey="design" items={[
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
        }
      ]} />
    </div>
  )
}
