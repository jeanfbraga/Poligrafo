"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect } from "react";

export default function GoogleAnalytics({ gaId }: { gaId: string }) {
	const pathname = usePathname();
	const searchParams = useSearchParams();

	useEffect(() => {
		if (!gaId || typeof window === "undefined" || !(window as any).gtag) return;
		const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
		(window as any).gtag("config", gaId, {
			page_path: url,
		});
	}, [pathname, searchParams, gaId]);

	return (
		<>
			<Script
				src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
				strategy="afterInteractive"
			/>
			<Script id="google-analytics" strategy="afterInteractive">
				{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${gaId}', {
            page_path: window.location.pathname,
          });
        `}
			</Script>
		</>
	);
}
