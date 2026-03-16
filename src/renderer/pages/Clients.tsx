import React, { useEffect, useState } from 'react'
import {
  Table, Button, Space, Typography, Modal, Form, Input, message, Popconfirm
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import type { Client } from '../../shared/types'

const { Title } = Typography

export default function Clients(): React.ReactElement {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form] = Form.useForm()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      setClients(await window.api.clientList())
    } catch {
      // empty
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    form.resetFields()
    setEditingId(null)
    setModalOpen(true)
  }

  function openEdit(record: Client) {
    form.setFieldsValue(record)
    setEditingId(record.id)
    setModalOpen(true)
  }

  async function handleSave() {
    try {
      const values = await form.validateFields()
      const data = {
        name: values.name,
        region: values.region || '',
        contact_person: values.contact_person || '',
        contact_phone: values.contact_phone || '',
        address: values.address || '',
        template_set: values.template_set || null,
        notes: values.notes || null,
      }

      if (editingId) {
        await window.api.clientUpdate(editingId, data)
        message.success('발주처가 수정되었습니다.')
      } else {
        await window.api.clientCreate(data)
        message.success('발주처가 등록되었습니다.')
      }
      setModalOpen(false)
      loadData()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  async function handleDelete(id: number) {
    try {
      await window.api.clientDelete(id)
      message.success('발주처가 삭제되었습니다.')
      loadData()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    }
  }

  const columns = [
    { title: '발주처명', dataIndex: 'name', key: 'name' },
    { title: '지역', dataIndex: 'region', key: 'region', width: 100 },
    { title: '담당자', dataIndex: 'contact_person', key: 'contact_person', width: 100 },
    { title: '연락처', dataIndex: 'contact_phone', key: 'contact_phone', width: 130 },
    { title: '주소', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '', key: 'actions', width: 80,
      render: (_: unknown, record: Client) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div className="page-header">
        <Title level={3}>발주처 관리</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          새 발주처
        </Button>
      </div>

      <Table
        dataSource={clients}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={editingId ? '발주처 수정' : '새 발주처'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="저장"
        cancelText="취소"
      >
        <Form form={form} layout="vertical" size="small">
          <Form.Item name="name" label="발주처명" rules={[{ required: true, message: '발주처명을 입력하세요' }]}>
            <Input placeholder="OO시청" />
          </Form.Item>
          <Form.Item name="region" label="지역">
            <Input placeholder="경기도 OO시" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="contact_person" label="담당자">
              <Input placeholder="홍길동" />
            </Form.Item>
            <Form.Item name="contact_phone" label="연락처">
              <Input placeholder="031-000-0000" />
            </Form.Item>
          </Space>
          <Form.Item name="address" label="주소">
            <Input placeholder="경기도 OO시 OO로 00" />
          </Form.Item>
          <Form.Item name="notes" label="비고">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
