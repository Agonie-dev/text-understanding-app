import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "文本理解 - AI 文档总结与转换",
  description: "上传 Word 或 PDF，AI 自动总结，支持格式转换",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
