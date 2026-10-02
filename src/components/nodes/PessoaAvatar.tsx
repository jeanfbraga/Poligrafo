"use client";

import { useState } from "react";
import { PixelIcon } from "@/components/pixel/PixelIcon";

interface PessoaAvatarProps {
	urlFoto?: string | null;
	urlFotoFallback?: string | null;
	nome?: string;
	/** "node" (32px, no cabeçalho do card) ou "insp" (48px, inspetor). */
	tamanho?: "node" | "insp";
}

/** Foto da pessoa com cadeia de fallback (principal → fallback → ícone pixel). */
export function PessoaAvatar({ urlFoto, urlFotoFallback, nome, tamanho = "node" }: PessoaAvatarProps) {
	const [usarFallback, setUsarFallback] = useState(false);
	const [falhou, setFalhou] = useState(false);
	const src = usarFallback && urlFotoFallback ? urlFotoFallback : urlFoto || urlFotoFallback;
	const px = tamanho === "insp" ? 48 : 32;

	if (!src || falhou) {
		return <PixelIcon name="user" size={tamanho === "insp" ? 20 : 14} />;
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img
			src={src}
			alt={nome || "Foto"}
			width={px}
			height={px}
			className="pg-node__avatar"
			style={{ width: px, height: px }}
			onError={() => {
				if (!usarFallback && urlFotoFallback) setUsarFallback(true);
				else setFalhou(true);
			}}
		/>
	);
}
