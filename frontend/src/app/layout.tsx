import type { Metadata } from "next";
import { Noto_Sans_SC, Space_Grotesk } from "next/font/google";
import RouteTransition from "@/components/RouteTransition";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "MiraPrep. - 像真实面试一样，练到你拿下 offer",
  description:
    "上传你的简历，Mira 会围绕经历与目标岗位展开一轮完整、有深度、会追问的仿真面试，并给出结构化评估报告。",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh"
      className={`${spaceGrotesk.variable} ${notoSansSC.variable}`}
    >
      <body className="min-h-screen bg-white font-sans text-[#0a0a0a] antialiased">
        <RouteTransition>{children}</RouteTransition>
      </body>
    </html>
  );
}
