import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AntdRegistry } from "./antd-registry";
import { AntdProvider } from "./antd-provider";

const sukhumvit = localFont({
  src: "../public/assets/fonts/SukhumvitSet-Medium.woff2",
  variable: "--font-sukhumvit",
  weight: "500",
  display: "swap",
});

const thongterm = localFont({
  src: [
    { path: "../public/assets/fonts/thongterm-reg.woff2", weight: "400" },
    { path: "../public/assets/fonts/thongterm-bold.woff2", weight: "700" },
  ],
  variable: "--font-thongterm",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ลงทะเบียนใช้งาน Free WiFi",
  description: "ลงทะเบียนเพื่อเข้าใช้งานอินเทอร์เน็ตไร้สายฟรี",
};

export const viewport: Viewport = {
  themeColor: "#dff5e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${sukhumvit.variable} ${thongterm.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AntdRegistry>
          <AntdProvider>{children}</AntdProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
