"use client";

import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

export function CrtTurnOn() {
	const containerRef = useRef<HTMLDivElement>(null);
	const topHalfRef = useRef<HTMLDivElement>(null);
	const bottomHalfRef = useRef<HTMLDivElement>(null);
	const lineRef = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		// Checa se a flag síncrona foi colocada pelo script na page.tsx
		const isPending = document.documentElement.classList.contains("crt-pending");
		if (!isPending || !containerRef.current) return;

		// Marca como tocado pra próximas vezes
		sessionStorage.setItem("crt_played", "true");

		const tl = gsap.timeline({
			onComplete: () => {
				if (containerRef.current) {
					containerRef.current.style.display = "none";
				}
				document.documentElement.classList.remove("crt-pending");
			}
		});

		// 1. Linha verde aparece no meio crescendo horizontalmente
		tl.fromTo(lineRef.current, 
			{ scaleX: 0, opacity: 0 }, 
			{ scaleX: 1, opacity: 1, duration: 0.15, ease: "power4.out" }
		);

		// 2. Linha brilha muito forte em verde (CRT beam)
		tl.to(lineRef.current, { 
			boxShadow: "0 0 40px 10px rgba(34, 197, 94, 1)", // Verde Tailwind (green-500)
			backgroundColor: "#4ade80", // green-400 pra dar núcleo branco-esverdeado
			duration: 0.1 
		});

		// 3. As metades pretas se abrem pra cima e pra baixo usando GPU (scaleY) em vez de height
		tl.to([topHalfRef.current, bottomHalfRef.current], {
			scaleY: 0,
			duration: 0.25,
			ease: "power2.inOut"
		}, "+=0.1");

		// ANIMAÇÃO CHAVE DA INTERFACE: O site também estica junto!
		// Assim não fica bruto a troca de tela preta pro site.
		tl.fromTo(".site-content", 
			{ scaleY: 0.01, scaleX: 0.8, opacity: 0 },
			{ scaleY: 1, scaleX: 1, opacity: 1, duration: 0.25, ease: "power2.out" },
			"<" // Exatamente no mesmo momento que as metades pretas abrem
		);

		// A linha expande menos e some rápido para não cegar o usuário
		tl.to(lineRef.current, {
			scaleY: 20,
			opacity: 0,
			duration: 0.25,
			ease: "power2.inOut"
		}, "<");

		tl.to(containerRef.current, {
			opacity: 0,
			duration: 0.15,
			ease: "power1.in"
		}, "-=0.1");

	}, []);

	return (
		<div 
			id="crt-overlay"
			ref={containerRef} 
			className="fixed inset-0 z-100 flex-col pointer-events-none hidden in-[.crt-pending]:flex"
			style={{ background: "transparent" }}
		>
			<div ref={topHalfRef} className="w-full bg-black flex-1 origin-top" />
			<div 
				ref={lineRef} 
				className="w-full h-1 bg-green-500 opacity-0"
				style={{ boxShadow: "0 0 10px 2px rgba(34, 197, 94, 0.8)" }}
			/>
			<div ref={bottomHalfRef} className="w-full bg-black flex-1 origin-bottom" />
		</div>
	);
}
