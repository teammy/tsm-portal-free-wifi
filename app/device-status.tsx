'use client'

import { Button, Result } from 'antd'
import { formatDuration } from '@/lib/format'

/**
 * Device already registered today with time left. A button rather than an
 * automatic redirect: the EG may send the browser back here after login, and
 * redirecting again from here would loop.
 */
export function WelcomeBack({ remainingSeconds, loginUrl }: { remainingSeconds: number; loginUrl: string }) {
  return (
    <Result
      status="success"
      title={<span className="font-heading text-mint-800">ท่านลงทะเบียนแล้ววันนี้</span>}
      subTitle={
        <>
          เหลือเวลาใช้งานวันนี้ {formatDuration(remainingSeconds)}
          <br />
          กดปุ่มด้านล่างเพื่อเชื่อมต่ออินเทอร์เน็ต
        </>
      }
      extra={
        <Button type="primary" size="large" href={loginUrl}>
          เชื่อมต่ออินเทอร์เน็ต
        </Button>
      }
      className="px-0! py-4!"
    />
  )
}

export function QuotaExhausted({ limitSeconds }: { limitSeconds: number }) {
  return (
    <Result
      status="warning"
      title={<span className="font-heading text-mint-800">ครบเวลาใช้งานวันนี้แล้ว</span>}
      subTitle={
        <>
          ท่านใช้งานครบ {formatDuration(limitSeconds)} ของวันนี้แล้ว
          <br />
          ใช้งานได้อีกครั้งหลังเวลา 00:00 น.
        </>
      }
      className="px-0! py-4!"
    />
  )
}
