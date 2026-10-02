import * as React from "react";

export const MOBILE_BREAKPOINT = 768;

/** `null` até a primeira medição no cliente (evita piscar o layout errado). */
export function useViewport(): "mobile" | "desktop" | null {
	const [vp, setVp] = React.useState<"mobile" | "desktop" | null>(null);

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		const atualizar = () => setVp(mql.matches ? "mobile" : "desktop");
		atualizar();
		mql.addEventListener("change", atualizar);
		return () => mql.removeEventListener("change", atualizar);
	}, []);

	return vp;
}

/** Compatibilidade: true somente no celular (false enquanto não mediu). */
export function useIsMobile() {
	return useViewport() === "mobile";
}
