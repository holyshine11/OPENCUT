import { ThemeProvider } from "next-themes";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { LocaleSync } from "@/i18n";
import { Inter } from "next/font/google";

const siteFont = Inter({ subsets: ["latin"] });

export const metadata = baseMetaData;

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="ko" suppressHydrationWarning>
			<head>
				{process.env.NODE_ENV === "development" &&
					process.env.NEXT_PUBLIC_REACT_SCAN === "true" && (
						<>
							<Script
								src="//unpkg.com/react-scan/dist/auto.global.js"
								crossOrigin="anonymous"
								strategy="beforeInteractive"
							/>
						</>
					)}
			</head>
			<body className={`${siteFont.className} font-sans antialiased`}>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange={true}
				>
					<TooltipProvider>
						<LocaleSync />
						<Toaster />
						{children}
					</TooltipProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
