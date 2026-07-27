import React, { useEffect, useState, useRef } from "react";

interface ScrambleTextProps {
	text: string;
	duration?: number;
	delay?: number;
	characters?: string;
	className?: string;
}

export function ScrambleText({
	text,
	duration = 800,
	delay = 0,
	characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;':,./<>?",
	className = "",
}: ScrambleTextProps) {
	const [displayText, setDisplayText] = useState("");
	const [started, setStarted] = useState(false);
	const requestRef = useRef<number | null>(null);
	const startTimeRef = useRef<number | null>(null);

	useEffect(() => {
		let timeoutId: NodeJS.Timeout;

		if (delay > 0) {
			timeoutId = setTimeout(() => {
				setStarted(true);
			}, delay);
		} else {
			setStarted(true);
		}

		return () => {
			clearTimeout(timeoutId);
			if (requestRef.current) cancelAnimationFrame(requestRef.current);
		};
	}, [delay]);

	useEffect(() => {
		if (!started) return;

		const animate = (time: number) => {
			if (!startTimeRef.current) startTimeRef.current = time;
			const progress = time - startTimeRef.current;
			const percent = Math.min(progress / duration, 1);

			// Quantos caracteres corretos já devem ser mostrados (da esquerda pra direita)
			const resolvedLength = Math.floor(text.length * percent);

			let scrambled = "";
			for (let i = 0; i < text.length; i++) {
				if (i < resolvedLength) {
					// Caractere já resolvido
					scrambled += text[i];
				} else if (text[i] === " ") {
					// Pula espaços
					scrambled += " ";
				} else {
					// Caractere embaralhado
					const randomChar = characters[Math.floor(Math.random() * characters.length)];
					scrambled += randomChar;
				}
			}

			setDisplayText(scrambled);

			if (percent < 1) {
				requestRef.current = requestAnimationFrame(animate);
			} else {
				setDisplayText(text);
			}
		};

		requestRef.current = requestAnimationFrame(animate);

		return () => {
			if (requestRef.current) cancelAnimationFrame(requestRef.current);
			startTimeRef.current = null;
		};
	}, [text, duration, characters, started]);

	return <span className={className}>{displayText || text.replace(/./g, "\u00A0")}</span>;
}
