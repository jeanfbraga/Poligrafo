"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

interface AnimatedNumberProps {
	value: number;
	prefix?: string;
	suffix?: string;
	isCurrency?: boolean;
}

export function AnimatedNumber({
	value,
	prefix = "",
	suffix = "",
	isCurrency = false,
}: AnimatedNumberProps) {
	const nodeRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!nodeRef.current) return;
		const ctx = gsap.context(() => {
			const obj = { val: 0 };
			gsap.to(obj, {
				val: value,
				duration: 2,
				ease: "power3.out",
				onUpdate: () => {
					if (nodeRef.current) {
						const formatted = isCurrency
							? obj.val.toLocaleString("pt-BR", {
									minimumFractionDigits: 2,
									maximumFractionDigits: 2,
								})
							: Math.floor(obj.val).toLocaleString("pt-BR");
						nodeRef.current.innerText = `${prefix}${formatted}${suffix}`;
					}
				},
			});
		}, nodeRef);
		return () => ctx.revert();
	}, [value, prefix, suffix, isCurrency]);

	return (
		<span ref={nodeRef}>
			{prefix}0{suffix}
		</span>
	);
}
