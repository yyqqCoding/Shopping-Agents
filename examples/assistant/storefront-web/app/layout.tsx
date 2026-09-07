import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ACME 购物助手",
  description: "用中文聊聊你的需求，让 ACME 购物助手帮你挑选、比较和搭配商品。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
