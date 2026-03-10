import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "@/app/globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Recipes",
  description: "Recipe app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sync OS dark preference to class so Tailwind dark: and .dark { } tokens apply */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');function s(){document.documentElement.classList.toggle('dark',m.matches);}s();if(m.addEventListener)m.addEventListener('change',s);else if(m.addListener)m.addListener(s);}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`min-h-screen bg-background text-foreground antialiased ${beVietnamPro.className}`}>
        {children}
      </body>
    </html>
  );
}
