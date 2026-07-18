import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LicensingProvider } from "../features/licensing/LicensingProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://pindou.blogchen.asia/"),
  title: "Pindou Studio｜把图片变成真正能拼的图纸",
  description: "上传图片后直接拖拽裁剪，生成拼豆预览，继续精修、统计并导出图纸。图片只在当前浏览器处理。",
  alternates: {
    canonical: "/",
  },
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
  themeColor: "#f8fafc",
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
