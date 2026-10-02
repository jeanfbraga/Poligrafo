import { Suspense } from "react";
import { HomeEntrada } from "@/components/dashboard/HomeEntrada";

export default function Home() {
	return (
		<Suspense fallback={null}>
			<HomeEntrada />
		</Suspense>
	);
}
