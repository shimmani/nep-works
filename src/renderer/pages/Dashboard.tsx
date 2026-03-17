import React, { useEffect, useState } from 'react'
import { Card, Statistic, Row, Col, Table, Tag, Typography, List, Button } from 'antd'
import {
  ProjectOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  ForwardOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../../shared/types'

const { Title } = Typography

const statusColors: Record<string, string> = {
  '입찰중': 'blue',
  '계약체결': 'cyan',
  '착공전': 'geekblue',
  '시공중': 'orange',
  '준공서류작성': 'gold',
  '준공검사': 'lime',
  '준공완료': 'green',
  '하자보증중': 'purple',
  '완료': 'default',
}

export default function Dashboard(): React.ReactElement {
  const [projects, setProjects] = useState<Project[]>([])
  const [pendingTasks, setPendingTasks] = useState<
    { id: number; title: string; project_name: string; task_type: string; due_date?: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [data, tasks] = await Promise.all([
        window.api.projectList(),
        window.api.workflowPendingAll(),
      ])
      setProjects(data)
      setPendingTasks(tasks)
    } catch {
      // 초기 데이터 없음
    } finally {
      setLoading(false)
    }
  }

  const activeProjects = projects.filter(p =>
    !['준공완료', '완료'].includes(p.status)
  )

  const totalContractAmount = activeProjects.reduce((sum, p) => sum + p.contract_amount, 0)

  async function handleCompleteTask(taskId: number) {
    try {
      await window.api.workflowComplete(taskId)
      await loadData()
    } catch {
      // 완료 처리 실패
    }
  }

  const columns = [
    {
      title: '공사명',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Project) => (
        <a onClick={() => navigate(`/projects/${record.id}`)}>{text}</a>
      )
    },
    {
      title: '발주처',
      dataIndex: 'client_name',
      key: 'client_name',
    },
    {
      title: '계약금액',
      dataIndex: 'contract_amount',
      key: 'contract_amount',
      render: (v: number) => `${v.toLocaleString()}원`,
      align: 'right' as const,
    },
    {
      title: '상태',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={statusColors[status] || 'default'}>{status}</Tag>
      )
    },
    {
      title: '계약기간',
      key: 'period',
      render: (_: unknown, record: Project) =>
        record.start_date && record.end_date
          ? `${record.start_date} ~ ${record.end_date}`
          : '-'
    },
  ]

  return (
    <div>
      <Title level={3}>대시보드</Title>

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="진행중 프로젝트"
              value={activeProjects.length}
              suffix="건"
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="시공중"
              value={projects.filter(p => p.status === '시공중').length}
              suffix="건"
              prefix={<CalculatorOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="준공 예정"
              value={projects.filter(p => ['준공서류작성', '준공검사'].includes(p.status)).length}
              suffix="건"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="총 계약금액"
              value={totalContractAmount}
              suffix="원"
              prefix={<CheckCircleOutlined />}
              formatter={(value) => `${Number(value).toLocaleString()}`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="진행중 프로젝트" style={{ marginBottom: 20 }}>
        <Table
          dataSource={activeProjects}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
        />
      </Card>

      <Card title="할일 목록" style={{ marginBottom: 20 }}>
        <List
          dataSource={pendingTasks}
          loading={loading}
          locale={{ emptyText: '대기중인 할일이 없습니다' }}
          renderItem={(task) => (
            <List.Item
              actions={[
                <Button
                  key="complete"
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleCompleteTask(task.id)}
                >
                  완료
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<ForwardOutlined style={{ fontSize: 18, color: '#1677ff' }} />}
                title={
                  <span>
                    <Tag color="blue">{task.project_name}</Tag>
                    {task.title}
                  </span>
                }
                description={task.due_date ? `기한: ${task.due_date}` : undefined}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
