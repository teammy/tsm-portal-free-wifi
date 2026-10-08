import { Suspense } from "react";
import { Card, Flex } from "antd";
// Server Component: `Typography.Title` etc. are undefined on a client reference,
// so import the sub-components directly.
import Title from "antd/es/typography/Title";
import Paragraph from "antd/es/typography/Paragraph";
import Text from "antd/es/typography/Text";
import { RegisterForm } from "./register-form";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="relative flex flex-1 justify-center overflow-hidden bg-linear-to-b from-mint-100 via-mint-50 to-sky-mint px-4 py-10 sm:py-16">
      {/* Decorative pastel blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-mint-200/70 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-28 h-80 w-80 rounded-full bg-pistachio blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-sky-mint blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <Suspense fallback={<PageSkeleton />}>
          <RegisterPage searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// antd components call Date.now() while rendering (cssinjs style cache), which
// cacheComponents rejects in the static shell — keep all of them in here.
async function RegisterPage({
  searchParams,
}: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  // Client MAC/IP passed by the gateway's captive-portal redirect
  const mac = firstParam(params.mac);
  const ip = firstParam(params.ip);

  return (
    <>
      <Flex vertical align="center" className="mb-8 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/80 shadow-lg shadow-mint-300/40 ring-1 ring-mint-200">
          <WifiIcon className="h-11 w-11 text-mint-500" />
        </div>
        <Title level={1} className="font-heading! text-3xl! leading-tight! font-medium! text-mint-800! sm:text-4xl!">
          ลงทะเบียนใช้งาน
          <span className="block text-mint-500">Free WiFi</span>
        </Title>
        <Paragraph type="secondary" className="mt-3! mb-3! max-w-sm text-base">
          กรอกข้อมูลเพียงครั้งเดียว เพื่อเชื่อมต่ออินเทอร์เน็ตได้ทันที
        </Paragraph>
      </Flex>

      <Card
      style={{
        marginBottom:20
      }}
        variant="borderless"
        className="bg-white/75! shadow-xl! shadow-mint-300/30 ring-1! ring-white backdrop-blur-md"
      >
        <RegisterForm mac={mac} ip={ip} />
      </Card>

      <Flex justify="center" align="start" gap={8} className="mt-6 px-2 text-center">

        <Text type="secondary" className="text-xs! leading-relaxed">
          ข้อมูลของท่านถูกเข้ารหัสและจัดเก็บตาม พ.ร.บ. คอมพิวเตอร์ฯ<br/>
          และ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)
        </Text>
      </Flex>
    </>
  );
}

/** Static-shell placeholder; plain Tailwind since antd can't render here */
function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-8 flex flex-col items-center gap-4">
        <div className="h-20 w-20 rounded-3xl bg-white/80" />
        <div className="h-8 w-56 rounded-full bg-mint-200/60" />
        <div className="h-8 w-36 rounded-full bg-mint-200/60" />
        <div className="h-4 w-64 rounded-full bg-mint-100" />
      </div>
      <div className="space-y-5 rounded-4xl bg-white/75 p-7 shadow-xl shadow-mint-300/30">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-28 rounded-full bg-mint-100" />
            <div className="h-12 rounded-2xl bg-mint-50" />
          </div>
        ))}
        <div className="h-13 rounded-2xl bg-mint-200/60" />
      </div>
    </div>
  );
}

function WifiIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M2 8.82a15 15 0 0 1 20 0" />
      <path d="M5 12.86a10 10 0 0 1 14 0" />
      <path d="M8.5 16.43a5 5 0 0 1 7 0" />
      <path d="M12 20h.01" />
    </svg>
  );
}
