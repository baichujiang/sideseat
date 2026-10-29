import type { Metadata } from "next";
import "./web.css";
import "./workspace.css";
export const metadata: Metadata = {
  title: { default: "SideSeat · 你的校园生活", template: "%s · SideSeat" },
  robots: { index: false, follow: false },
};
export default function WebLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sideseat-web" lang="zh-CN">
      {children}
    </div>
  );
}
