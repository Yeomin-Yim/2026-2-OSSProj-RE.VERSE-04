import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// 공식 폰트 Pretendard (D014): 저장소의 가변 폰트를 자체 호스팅한다 (외부 CDN 중복 로딩 제거).
// --font-pretendard 변수로 내보내고, prototype.css 의 --font 맨 앞에서 쓴다.
const pretendard = localFont({
  src: "../prototype/fonts/woff2/PretendardVariable.woff2",
  weight: "45 920",
  display: "swap",
  variable: "--font-pretendard",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"],
});

export const metadata: Metadata = {
  title: "RE:Cord",
  description: "오늘의 경험을, 내일의 가능성으로",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  );
}
