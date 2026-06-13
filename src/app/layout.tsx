import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "静室 · JÌNGSHÌ — AI 心理陪伴室",
  description:
    "匿名中文 AI 心理陪伴室。以倾听为主，融合稳定化与温和的认知视角，配 PHQ-9 / GAD-7 / ISI 临床自评、危机安全分流与图片理解。",
  icons: { icon: "/avatar.png", apple: "/avatar.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover"
};

// Set theme/lang before paint to avoid a flash (mirrors the prototype's keys).
const initScript = `(function(){try{var t=localStorage.getItem('js_theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');var l=localStorage.getItem('js_lang');document.documentElement.lang=(l==='en')?'en':'zh';}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
