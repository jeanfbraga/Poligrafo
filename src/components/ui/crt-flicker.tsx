"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export function CrtFlicker() {
	useGSAP(() => {
		// EFEITO FLICKER ISOLADO: Usando uma div preta por cima de tudo e variando sua opacidade
		// para simular falhas de energia/fósforo. Usamos um timeline recursivo para randomizar de verdade.
		const flicker = () => {
			const delay = Math.random() * 4 + 1.8; // Espera mais tempo entre os flickers (1.5s a 5.5s)
			const duration = Math.random() * 0.15 + 0.05; // Duração um pouco mais longa e orgânica
			const opacity = Math.random() * 0.07 + 0.03; // Bem mais sutil: escurece só entre 3% e 10%

			gsap.to(".crt-flicker-overlay-global", {
				opacity: opacity,
				duration: duration,
				yoyo: true,
				repeat: 1,
				ease: "power2.inOut",
				delay: delay,
				onComplete: flicker // Chama recursivamente
			});
		};
		flicker();
	}, []);

	return (
		<div className="crt-flicker-overlay-global fixed inset-0 bg-black opacity-0 pointer-events-none z-90" />
	);
}
