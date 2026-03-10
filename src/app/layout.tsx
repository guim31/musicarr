import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

import { ToastProvider } from "@/context/ToastContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Musicarr - Gestion de Bibliothèque Musicale",
  description: "Alternative moderne à Lidarr pour la gestion de votre musique.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <ToastProvider>
          <div style={{ display: 'flex' }}>
            <Sidebar />
            <main style={{ 
              flex: 1, 
              marginLeft: '260px', 
              minHeight: '100vh',
              padding: '32px'
            }}>
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
