"use client";

import { Toaster as Sonner } from "sonner";
import { Spinner } from "@/components/ds/Spinner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const glyph = (g: string) => <span className="pg-toast__icon">{g}</span>;

/** Toasts do terminal: glifos em vez de ícones, cores só para estado. */
const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			theme="dark"
			className="toaster group"
			icons={{
				success: glyph("✓"),
				info: glyph(">"),
				warning: glyph("▲"),
				error: glyph("◆"),
				loading: <Spinner />,
			}}
			toastOptions={{
				unstyled: true,
				classNames: {
					toast: "pg-toast",
					title: "pg-toast__title",
					description: "pg-toast__desc",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
