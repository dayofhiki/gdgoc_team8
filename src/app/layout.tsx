import type { Metadata, Viewport } from "next";
import { AppStateProvider } from "@/components/AppState";
import "./globals.css";

export const metadata: Metadata = {
  title: "미끼주의보 | 가족과 함께하는 AI 보이스피싱 대처 연습",
  description: "뻐끄미와 함께 AI 보이스피싱 대처법을 연습하고, 우리 가족만의 확인 암호를 정해요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F5F5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <AppStateProvider>{children}</AppStateProvider>
      </body>
    </html>
  );
}
