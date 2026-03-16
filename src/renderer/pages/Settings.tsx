import React from 'react'
import { Card, Typography, Descriptions } from 'antd'

const { Title } = Typography

export default function Settings(): React.ReactElement {
  return (
    <div>
      <Title level={3}>설정</Title>

      <Card title="시스템 정보" style={{ marginBottom: 16 }}>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="버전">NEP-WORKS v1.0.0</Descriptions.Item>
          <Descriptions.Item label="데이터베이스">SQLite (로컬)</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="보험요율 관리 (2026년)">
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="국민연금">근로자 4.5% / 사업주 4.5%</Descriptions.Item>
          <Descriptions.Item label="건강보험">근로자 3.545% / 사업주 3.545%</Descriptions.Item>
          <Descriptions.Item label="장기요양보험">건강보험의 12.95%</Descriptions.Item>
          <Descriptions.Item label="고용보험(실업급여)">근로자 0.9% / 사업주 0.9%</Descriptions.Item>
          <Descriptions.Item label="고용보험(고용안정)">사업주 0.25% (150인 미만)</Descriptions.Item>
          <Descriptions.Item label="산재보험">사업주 3.7% (건설업 평균)</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  )
}
