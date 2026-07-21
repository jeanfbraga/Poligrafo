"use client";

import { Monitor } from "lucide-react";

export default function MobileGate({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<>
			{/* TELA MOBILE — visível apenas em telas < 1024px */}
			<div className="lg:hidden fixed inset-0 z-9999 bg-black flex flex-col items-center justify-center px-8 text-center">
				{/* Scanline sutil */}
				<div
					className="absolute inset-0 pointer-events-none opacity-[0.03]"
					style={{
						backgroundImage:
							"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.1) 2px, rgba(0,255,0,0.1) 4px)",
					}}
				/>

				{/* Borda exterior */}
				<div className="border border-green-500/40 p-8 max-w-sm w-full relative">
					{/* Corner accents */}
					<div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-500" />
					<div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-500" />
					<div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-500" />
					<div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-500" />

					<Monitor className="w-10 h-10 text-green-500 mx-auto mb-6" />

					<h1 className="text-green-500 text-lg font-bold uppercase tracking-[0.3em] mb-2 bytesized-regular">
						POLÍGRAFO
					</h1>

					<div className="w-12 h-px bg-green-500/40 mx-auto mb-6" />

					<p className="text-green-500/80 text-xs uppercase tracking-widest mb-6 leading-relaxed">
						Este sistema foi projetado para uso exclusivo em computadores.
					</p>

					<p className="text-green-600/60 text-xs font-bold uppercase tracking-wider leading-relaxed mb-8">
						Acesse pelo seu desktop ou notebook para operar o painel de
						investigação.
					</p>

					{/* Separator */}
					<div className="border-t border-green-500/20 pt-6">
						<p className="text-xs font-bold text-green-500/30 uppercase tracking-[0.2em] mb-3">
							[ SOBRE O SISTEMA ]
						</p>
						<p className="text-green-500/50 text-xs font-bold leading-relaxed">
							O Polígrafo é uma ferramenta de inteligência que cruza dados
							abertos de transparência governamental para auditar gastos
							públicos de políticos brasileiros em tempo real.
						</p>
					</div>
				</div>

				{/* Footer */}
				<p className="text-green-900/60 text-xs font-bold uppercase tracking-widest mt-8">
					sys::desktop_only
				</p>
			</div>

			{/* CONTEÚDO PRINCIPAL — visível apenas em telas >= 1024px */}
			<div className="hidden lg:contents">{children}</div>
		</>
	);
}
