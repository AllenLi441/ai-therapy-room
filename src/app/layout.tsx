import type { Metadata } from "next";
import { Outfit, Inter, Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import { ButtonPressEffects } from "@/components/button-press-effects";
import "./globals.css";

// Display / UI face — geometric sans with warmth and character.
// Variable axis so the 600/650/700 heading weights all render crisply.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display-latin",
  display: "swap"
});

// Body Latin — clean humanist sans. Variable: covers the 450/550/650 weights
// the stylesheet uses for fine-grained hierarchy.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-latin",
  display: "swap"
});

// Editorial Chinese headings — the calm, literary 静室 feel.
// preload:false — the CJK webfonts are the ~1.3MB front-end cost (eval report).
// With display:swap the page paints immediately in the system CJK fallback and
// swaps these in when ready, so they no longer compete on the critical path.
// (No subsetting / weight cuts: those risk tofu or a visual-weight regression on a
// chat app with arbitrary user/AI text — perf is already strong, so we only defer.)
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-serif-sc",
  display: "swap",
  preload: false
});

// Body Chinese — larger size / loose leading for low-mood readers.
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-sc",
  display: "swap",
  preload: false
});

export const metadata: Metadata = {
  title: "静室 | AI 心理咨询室",
  description:
    "匿名中文 AI 心理咨询室。双模型架构提供专业级心理支持，配 PHQ-9 / GAD-7 / ISI 临床量表与持续更新的个案理解。",
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable} ${notoSerifSC.variable} ${notoSansSC.variable}`}
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('quiet-room-theme-v1');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`
          }}
        />
        <ButtonPressEffects />
        {children}
      </body>
    </html>
  );
}
