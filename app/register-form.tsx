'use client'

import { useState, useTransition } from 'react'
import { Alert, Button, Checkbox, Divider, Form, Input, Modal, Result, Select, Typography } from 'antd'
import isValidThaiID from 'thai-id-validator'
import { formatDuration } from '@/lib/format'
import { register, type RegisterInput } from './actions'
import { QuotaExhausted } from './device-status'

type DocType = 'thai_id' | 'passport' | 'pink_card' | 'other'

type FormValues = Omit<RegisterInput, 'mac' | 'ip' | 'docType'> & { docType: DocType }

const DOC_OPTIONS: {
  value: DocType
  label: string
  fieldLabel: string
  placeholder: string
  numeric: boolean
}[] = [
  {
    value: 'thai_id',
    label: 'บัตรประชาชน',
    fieldLabel: 'เลขบัตรประจำตัวประชาชน',
    placeholder: 'x-xxxx-xxxxx-xx-x',
    numeric: true,
  },
  {
    value: 'passport',
    label: 'หนังสือเดินทาง (Passport)',
    fieldLabel: 'เลขหนังสือเดินทาง (Passport No.)',
    placeholder: 'AA1234567',
    numeric: false,
  },
  {
    value: 'pink_card',
    label: 'บัตรชมพู (บุคคลไม่มีสัญชาติไทย)',
    fieldLabel: 'เลขบัตรประจำตัวบุคคลซึ่งไม่มีสัญชาติไทย',
    placeholder: 'x-xxxx-xxxxx-xx-x',
    numeric: true,
  },
  {
    value: 'other',
    label: 'เอกสารอื่นๆ',
    fieldLabel: 'เลขที่เอกสาร',
    placeholder: 'เลขที่เอกสารแสดงตน',
    numeric: false,
  },
]

const docOption = (type: DocType | undefined) =>
  DOC_OPTIONS.find((o) => o.value === type) ?? DOC_OPTIONS[0]

/** 1234567890123 → 1-2345-67890-12-3 */
function formatThirteenDigits(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13)
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 10), d.slice(10, 12), d.slice(12)]
    .filter(Boolean)
    .join('-')
}

export function RegisterForm({
  mac,
  ip,
  thaidEnabled,
  thaidFailed,
}: {
  mac: string
  ip: string
  thaidEnabled: boolean
  thaidFailed: boolean
}) {
  const [form] = Form.useForm<FormValues>()
  const docType = Form.useWatch('docType', form)
  const doc = docOption(docType)

  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | undefined>(
    thaidFailed ? 'ยืนยันตัวตนด้วย ThaID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือกรอกแบบฟอร์ม' : undefined,
  )
  const [success, setSuccess] = useState<{ expiresAt: string; remainingSeconds: number }>()
  const [exhaustedLimit, setExhaustedLimit] = useState<number>()
  const [termsOpen, setTermsOpen] = useState(false)

  if (success) {
    return <SuccessView {...success} />
  }
  if (exhaustedLimit) {
    return <QuotaExhausted limitSeconds={exhaustedLimit} />
  }

  // ThaID fills in name and ID itself; only the consent box has to be ticked
  const startThaid = async () => {
    try {
      await form.validateFields(['consent'])
    } catch {
      return
    }
    // A full navigation, not router.push: /thaid/start is a route handler that
    // redirects off-site to DOPA
    const url = new URL('/thaid/start', window.location.origin)
    url.search = new URLSearchParams({ mac, ip, consent: '1' }).toString()
    window.location.assign(url)
  }

  const onFinish = (values: FormValues) => {
    setMessage(undefined)
    startTransition(async () => {
      const res = await register({ ...values, mac, ip })
      if (res.ok) {
        setSuccess({ expiresAt: res.expiresAt!, remainingSeconds: res.remainingSeconds! })
        // EG checks the credentials against RADIUS, then redirects to its Post URL
        if (res.loginUrl) window.location.assign(res.loginUrl)
        return
      }
      if (res.exhaustedLimitSeconds) {
        setExhaustedLimit(res.exhaustedLimitSeconds)
        return
      }
      setMessage(res.message)
      if (res.errors) {
        form.setFields(
          Object.entries(res.errors)
            .filter(([, msg]) => msg)
            .map(([name, msg]) => ({ name: name as keyof FormValues, errors: [msg!] })),
        )
      }
    })
  }

  return (
    <>
      <Form<FormValues>
        form={form}
        layout="vertical"
        size="large"
        requiredMark={false}
        initialValues={{ docType: 'thai_id', consent: false }}
        onValuesChange={(changed) => {
          if ('docType' in changed) form.setFieldValue('docNumber', '')
        }}
        onFinish={onFinish}
        disabled={isPending}
      >
        {message && (
          <Alert type="error" showIcon title={message} className="mb-5!" />
        )}

        <Form.Item
          name="fullName"
          label="ชื่อ-นามสกุล (บังคับกรอก)"
          rules={[
            { required: true, whitespace: true, message: 'กรุณากรอกชื่อ-นามสกุล' },
            { max: 200, message: 'ชื่อยาวเกินไป' },
          ]}
        >
          <Input autoComplete="name" placeholder="เช่น สมชาย ใจดี" />
        </Form.Item>

        <Form.Item name="docType" label="ประเภทเอกสารแสดงตน">
          <Select options={DOC_OPTIONS.map(({ value, label }) => ({ value, label }))} />
        </Form.Item>

        <Form.Item
          name="docNumber"
          label={doc.fieldLabel}
          dependencies={['docType']}
          normalize={(value: string = '', _prev, all) =>
            docOption(all.docType as DocType).numeric
              ? formatThirteenDigits(value)
              : value.toUpperCase()
          }
          rules={[
            { required: true, message: 'กรุณากรอกเลขที่เอกสาร' },
            ({ getFieldValue }) => ({
              validator(_, value: string = '') {
                const plain = value.replace(/[\s-]/g, '')
                if (!plain) return Promise.resolve()
                const type: DocType = getFieldValue('docType')
                if (type === 'thai_id' && !isValidThaiID(plain)) {
                  return Promise.reject(new Error('เลขบัตรประชาชนไม่ถูกต้อง'))
                }
                if (type === 'pink_card' && !/^\d{13}$/.test(plain)) {
                  return Promise.reject(new Error('เลขบัตรต้องเป็นตัวเลข 13 หลัก'))
                }
                return Promise.resolve()
              },
            }),
          ]}
        >
          <Input
            inputMode={doc.numeric ? 'numeric' : 'text'}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={doc.placeholder}
            className="tracking-wider"
          />
        </Form.Item>

        <Form.Item
          name="phone"
          label="เบอร์โทรศัพท์ (บังคับกรอก)"
          rules={[
            {
              validator: (_, value: string = '') => {
                const digits = value.replace(/[\s-]/g, '')
                return !digits || /^0\d{8,9}$/.test(digits)
                  ? Promise.resolve()
                  : Promise.reject(new Error('เบอร์โทรศัพท์ไม่ถูกต้อง'))
              },
            },
          ]}
        >
          <Input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="08x-xxx-xxxx" />
        </Form.Item>

        <Form.Item
          name="consent"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) =>
                value
                  ? Promise.resolve()
                  : Promise.reject(new Error('กรุณายอมรับเงื่อนไขการใช้งาน')),
            },
          ]}
          className="rounded-2xl bg-pistachio/50 px-4 py-3"
        >
          <Checkbox className="leading-relaxed">
            ข้าพเจ้ายอมรับ{' '}
            <Typography.Link
              onClick={(e) => {
                e.preventDefault()
                setTermsOpen(true)
              }}
              underline
            >
              เงื่อนไขการใช้งาน
            </Typography.Link>{' '}
            และยินยอมให้จัดเก็บข้อมูลส่วนบุคคลเพื่อใช้ยืนยันตัวตนตามที่กฎหมายกำหนด
          </Checkbox>
        </Form.Item>

        <Form.Item className="mb-0!">
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={isPending}
            className="h-13! font-heading! text-lg!"
          >
            {isPending ? 'กำลังลงทะเบียน…' : 'เชื่อมต่อ WiFi'}
          </Button>
        </Form.Item>

        {thaidEnabled && (
          <>
            <Divider plain className="my-5! text-sm!">
              หรือ
            </Divider>
            <Button block onClick={startThaid} className="h-13! font-heading! text-lg!">
              ลงทะเบียนด้วย ThaID
            </Button>
            <Typography.Paragraph type="secondary" className="mt-2! mb-0! text-center text-xs!">
              ไม่ต้องกรอกชื่อและเลขบัตร — ติ๊กยอมรับเงื่อนไขด้านบนก่อน
            </Typography.Paragraph>
          </>
        )}
      </Form>

      <Modal
        title={<span className="font-heading">เงื่อนไขการใช้งาน</span>}
        open={termsOpen}
        onCancel={() => setTermsOpen(false)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              form.setFieldValue('consent', true)
              form.validateFields(['consent'])
              setTermsOpen(false)
            }}
          >
            ยอมรับ
          </Button>
        }
        centered
      >
        <ul className="list-disc space-y-1.5 pl-5">
          <li>ข้อมูลที่กรอกจะถูกเข้ารหัสและใช้เพื่อการยืนยันตัวตนเท่านั้น</li>
          <li>ระบบจัดเก็บข้อมูลการใช้งานตาม พ.ร.บ. ว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์</li>
          <li>สิทธิ์การใช้งานมีอายุ 8 ชั่วโมงต่อการลงทะเบียน 1 ครั้ง</li>
          <li>ห้ามใช้งานเครือข่ายเพื่อกระทำการที่ผิดกฎหมาย</li>
        </ul>
      </Modal>
    </>
  )
}

function SuccessView({ expiresAt, remainingSeconds }: { expiresAt: string; remainingSeconds: number }) {
  const until = new Date(expiresAt).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <Result
      status="success"
      title={<span className="font-heading text-mint-800">ลงทะเบียนสำเร็จ</span>}
      subTitle={
        <>
          อุปกรณ์ของท่านพร้อมใช้งานอินเทอร์เน็ตแล้ว
          <br />
          เหลือเวลาใช้งานวันนี้ {formatDuration(remainingSeconds)} (ภายใน {until})
        </>
      }
      className="px-0! py-4!"
    />
  )
}
