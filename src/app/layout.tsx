import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LicensingProvider } from "../features/licensing/LicensingProvider";

export const metadata: Metadata = {
  title: "Pindou Studio | 拼豆工作台",
  description: "上传图片，调整精细度，一键生成像素画图纸，简单实用的像素画生成工具",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pindou Studio",
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className="antialiased overflow-x-hidden bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      >
        <LicensingProvider>{children}</LicensingProvider>
      </body>
    </html>
  );
}
