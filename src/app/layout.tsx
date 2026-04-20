import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import styles from "./layout.module.css";

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
      <body className={inter.className} suppressHydrationWarning>
        <ToastProvider>
          <div className={styles.layoutContainer}>
            <Sidebar />
            <main className={styles.mainContent}>
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
