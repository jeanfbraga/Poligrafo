"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface HybridTooltipProps {
	content: React.ReactNode;
	children: React.ReactNode;
}

export function HybridTooltip({ content, children }: HybridTooltipProps) {
	const [show, setShow] = useState(false);
	const triggerRef = useRef<HTMLDivElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);
	const [placement, setPlacement] = useState<"top" | "bottom">("top");
	const [coords, setCoords] = useState({
		top: 0,
		left: 0,
		transformX: "translateX(-50%)",
	});

	const updatePosition = () => {
		if (!triggerRef.current) return;
		const rect = triggerRef.current.getBoundingClientRect();
		const margin = 16;

		// Mede altura real do tooltip, se já renderizado; senão usa estimativa conservadora
		const tooltipHeight = tooltipRef.current?.offsetHeight ?? 90;
		const topSpace = rect.top - margin;
		const bottomSpace = window.innerHeight - rect.bottom - margin;

		// Escolhe o lado que tem mais espaço disponível; prefere cima se empatar
		const nextPlacement =
			topSpace >= tooltipHeight && topSpace >= bottomSpace ? "top" : "bottom";
		if (nextPlacement !== placement) {
			setPlacement(nextPlacement);
		}

		// Alinha horizontalmente e evita estouro nas laterais
		let newLeft = rect.left + rect.width / 2;
		let newTransformX = "translateX(-50%)";
		if (newLeft < 100 + margin) {
			newLeft = margin;
			newTransformX = "translateX(0)";
		} else if (newLeft > window.innerWidth - 100 - margin) {
			newLeft = window.innerWidth - margin;
			newTransformX = "translateX(-100%)";
		}

		setCoords({
			top:
				nextPlacement === "top"
					? rect.top - 8
					: rect.bottom + 8,
			left: newLeft,
			transformX: newTransformX,
		});
	};

	useEffect(() => {
		if (!show) return;
		updatePosition();
		window.addEventListener("scroll", updatePosition, true);
		window.addEventListener("resize", updatePosition);
		return () => {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [show, placement]);

	// Fecha o tooltip se clicar fora
	useEffect(() => {
		if (!show) return;
		const handleOutsideClick = () => setShow(false);

		const timeoutId = setTimeout(() => {
			document.addEventListener("touchstart", handleOutsideClick);
			document.addEventListener("click", handleOutsideClick);
		}, 50);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("touchstart", handleOutsideClick);
			document.removeEventListener("click", handleOutsideClick);
		};
	}, [show]);

	return (
		<>
			<div
				ref={triggerRef}
				className="inline-block cursor-help relative"
				onPointerEnter={(e) => {
					// Apenas reage ao hover se for mouse genuíno. Evita conflitos no touch.
					if (e.pointerType === "mouse") setShow(true);
				}}
				onPointerLeave={(e) => {
					if (e.pointerType === "mouse") setShow(false);
				}}
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					setShow((prev) => !prev);
				}}
			>
				{children}
			</div>

			{show &&
				typeof document !== "undefined" &&
				createPortal(
					<div
						ref={tooltipRef}
						className="fixed z-[99999] bg-black border border-green-900 text-green-400 text-xs px-3 py-2 shadow-lg max-w-[200px] text-center pointer-events-none"
						style={{
							top: coords.top,
							left: coords.left,
							transform:
								placement === "top"
									? `translateY(-100%) ${coords.transformX}`
									: `translateY(0) ${coords.transformX}`,
						}}
					>
						{content}
					</div>,
					document.body,
				)}
		</>
	);
}
