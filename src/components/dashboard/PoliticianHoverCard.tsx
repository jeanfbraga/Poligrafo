"use client";

import { Search, User } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { formatName } from "@/lib/utils";

// ==========================================================================
// RASCUNHO (layout v2) — Wrapper do hover card do político.
// Suporta HOVER no Desktop e TOQUE (tap) no Mobile com colapso ao clicar fora.
// Nomes de políticos normalizados para caixa normal (Title Case).
// ==========================================================================

export interface DraftProfile {
	nome: string;
	partido: string;
	uf?: string;
	foto?: string | null;
	id?: string | number;
	cargo?: string | null;
	casa?: string;
}

const ProfileAvatar = ({ profile }: { profile: DraftProfile }) => {
	const [error, setError] = useState(false);

	if (!profile.foto || error) {
		return (
			<div className="h-16 w-16 bg-green-950/30 border border-green-500 flex items-center justify-center shrink-0">
				<User className="w-8 h-8 text-green-700" />
			</div>
		);
	}

	return (
		<div className="h-16 w-16 overflow-hidden rounded-none border border-green-500 shrink-0 bg-green-950/30">
			<img
				src={profile.foto}
				alt={profile.nome}
				className="object-cover w-full h-full"
				onError={() => setError(true)}
			/>
		</div>
	);
};

interface PoliticianHoverCardProps {
	profile: DraftProfile;
	children: React.ReactNode;
	className?: string;
}

export function PoliticianHoverCard({
	profile,
	children,
	className,
}: PoliticianHoverCardProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Fecha o hover card ao tocar ou clicar fora (Mobile & Desktop)
	useEffect(() => {
		if (!open) return;

		const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};

		const timer = setTimeout(() => {
			document.addEventListener("touchstart", handleOutsideClick, {
				passive: true,
			});
			document.addEventListener("click", handleOutsideClick);
		}, 50);

		return () => {
			clearTimeout(timer);
			document.removeEventListener("touchstart", handleOutsideClick);
			document.removeEventListener("click", handleOutsideClick);
		};
	}, [open]);

	return (
		<div ref={containerRef} className="inline-flex min-w-0 max-w-full">
			<HoverCard
				open={open}
				onOpenChange={setOpen}
				openDelay={100}
				closeDelay={150}
			>
				<HoverCardTrigger
					asChild
					className={
						className ??
						"cursor-crosshair hover:text-green-300 transition-colors"
					}
					onClick={(e) => {
						// Alterna o estado ao tocar/clicar (suporte pleno a mobile)
						e.stopPropagation();
						setOpen((prev) => !prev);
					}}
				>
					<span className="inline-flex items-center min-w-0 max-w-full">
						{children}
					</span>
				</HoverCardTrigger>
				<HoverCardContent className="w-80 bg-black/95 text-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)] z-50 border-none">
					<div className="flex justify-between space-x-4">
						<ProfileAvatar profile={profile} />

						<div className="space-y-1 flex-1 min-w-0">
							{/* Nome normalizado (caixa normal em vez de ALL CAPS) */}
							<h4 className="text-sm font-bold tracking-wide leading-tight text-green-300">
								{formatName(profile.nome)}
							</h4>
							{profile.cargo && (
								<div className="text-[10px] text-green-500 uppercase tracking-widest mt-1 mb-1 font-semibold">
									{profile.cargo}
								</div>
							)}
							<p className="text-xs text-green-600 uppercase tracking-wider">
								{profile.partido} — {profile.uf}
							</p>

							<div className="flex items-center pt-2">
								<span className="relative flex h-2 w-2 mr-2">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
								</span>
								<span className="text-xs uppercase text-green-500 tracking-widest">
									PERFIL RASTREADO
								</span>
							</div>
						</div>
					</div>
					<div className="mt-4 pt-4 border-t border-green-900/50">
						<button
							className="w-full py-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2"
							onClick={(e) => {
								e.stopPropagation();
								setOpen(false);
								const event = new CustomEvent("poligrafo:search", {
									detail: { nome: profile.nome, id: profile.id, casa: profile.casa },
								});
								window.dispatchEvent(event);
							}}
						>
							<Search className="w-3 h-3" />
							INICIAR VARREDURA
						</button>
					</div>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
