import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design.css";

export const metadata: Metadata = {
  title: "户外装备助手 · 为下一次出发做好准备",
  description:
    "聊聊行程、人数和预算，一起挑选徒步与露营装备、比较参数、规划出行清单。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
