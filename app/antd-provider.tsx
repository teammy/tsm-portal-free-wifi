'use client'

import { ConfigProvider } from 'antd'
import thTH from 'antd/locale/th_TH'

const FONT_BODY = 'var(--font-thongterm), system-ui, sans-serif'

export function AntdProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: '#4aa97a',
          colorSuccess: '#4aa97a',
          colorInfo: '#4aa97a',
          colorText: '#1e4636',
          colorTextSecondary: 'rgba(44, 110, 80, 0.75)',
          colorBorder: '#c3ead3',
          colorLink: '#368a62',
          fontFamily: FONT_BODY,
          fontSize: 15,
          borderRadius: 14,
          borderRadiusLG: 20,
          controlHeight: 44,
          controlHeightLG: 50,
        },
        components: {
          Card: { borderRadiusLG: 32, bodyPadding: 28 },
          Form: { labelColor: '#255742', verticalLabelPadding: '0 0 6px' },
          Input: {
            colorBgContainer: '#f1fbf5',
            activeBg: '#ffffff',
            hoverBorderColor: '#6fc497',
            activeShadow: '0 0 0 4px rgba(157, 217, 184, 0.45)',
          },
          Select: {
            colorBgContainer: '#f1fbf5',
            hoverBorderColor: '#6fc497',
            activeOutlineColor: 'rgba(157, 217, 184, 0.45)',
            optionSelectedBg: '#dff5e8',
          },
          Button: {
            primaryShadow: '0 8px 20px -6px rgba(74, 169, 122, 0.55)',
            fontWeight: 500,
          },
          Typography: { titleMarginBottom: 0, titleMarginTop: 0 },
        },
      }}
    >
      {children}
    </ConfigProvider>
  )
}
