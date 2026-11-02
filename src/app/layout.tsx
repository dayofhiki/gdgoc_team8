import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"안심연습 | GDGoC Team 8",description:"가족과 함께하는 AI 사기 예방 교육"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>;}
