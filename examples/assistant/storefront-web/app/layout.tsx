import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./design.css";
import "./redesign.css";

export const metadata: Metadata = {
  title: "户外装备助手 · 为下一次出发做好准备",
  description:
    "聊聊行程、人数和预算，一起挑选徒步与露营装备、比较参数、规划出行清单。",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "户外装备助手 · 为下一次出发做好准备",
    description:
      "从行程、人数和预算开始，挑选真正适合下一程的户外装备。",
    type: "website",
    locale: "zh_CN",
  },
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
