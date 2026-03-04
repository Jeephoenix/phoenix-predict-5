import { Providers } from "./providers";
import { IBM_Plex_Mono } from "next/font/google";
import "../styles/globals.css";

const ibm = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-mono",
});

export const metadata = {
  title: "Phoenix Predict 5",
  description: "Decentralized BTC prediction market",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={ibm.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
