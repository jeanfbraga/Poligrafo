"use client";

import { Terminal, Loader2 } from "lucide-react";
import SearchBar from "@/components/search/SearchBar";
import { ScrambleText } from "@/components/ui/scramble-text";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ALCADAS_BR = [
	{ sigla: "FEDERAL", nome: "FEDERAL" },
	{ sigla: "AC", nome: "Acre" },
	{ sigla: "AL", nome: "Alagoas" },
	{ sigla: "AP", nome: "Amapá" },
	{ sigla: "AM", nome: "Amazonas" },
	{ sigla: "BA", nome: "Bahia" },
	{ sigla: "CE", nome: "Ceará" },
	{ sigla: "DF", nome: "Distrito Federal" },
	{ sigla: "ES", nome: "Espírito Santo" },
	{ sigla: "GO", nome: "Goiás" },
	{ sigla: "MA", nome: "Maranhão" },
	{ sigla: "MT", nome: "Mato Grosso" },
	{ sigla: "MS", nome: "Mato Grosso do Sul" },
	{ sigla: "MG", nome: "Minas Gerais" },
	{ sigla: "PA", nome: "Pará" },
	{ sigla: "PB", nome: "Paraíba" },
	{ sigla: "PR", nome: "Paraná" },
	{ sigla: "PE", nome: "Pernambuco" },
	{ sigla: "PI", nome: "Piauí" },
	{ sigla: "RJ", nome: "Rio de Janeiro" },
	{ sigla: "RN", nome: "Rio Grande do Norte" },
	{ sigla: "RS", nome: "Rio Grande do Sul" },
	{ sigla: "RO", nome: "Rondônia" },
	{ sigla: "RR", nome: "Roraima" },
	{ sigla: "SC", nome: "Santa Catarina" },
	{ sigla: "SP", nome: "São Paulo" },
	{ sigla: "SE", nome: "Sergipe" },
	{ sigla: "TO", nome: "Tocantins" },
];

interface SiteHeaderProps {
	isMobile?: boolean;
	isLoading?: boolean;
	showClearButton?: boolean;
	showSearch?: boolean;
	showOnMobile?: boolean;
	rightElement?: React.ReactNode;
	onClearAll?: () => void;
	searchTerm?: string;
	setSearchTerm?: (val: string) => void;
	selectedUf?: string;
	setSelectedUf?: (val: string) => void;
	onSearch?: (refOverride?: string, nomeOverride?: string) => void;
	onCancel?: () => void;
}

export function SiteHeader({
	isMobile = false,
	isLoading = false,
	showClearButton = false,
	showSearch = true,
	showOnMobile = false,
	rightElement,
	onClearAll,
	searchTerm: propSearchTerm,
	setSearchTerm: propSetSearchTerm,
	selectedUf: propSelectedUf,
	setSelectedUf: propSetSelectedUf,
	onSearch,
	onCancel,
}: SiteHeaderProps) {
	const router = useRouter();

	// Local state for pages that don't pass props (like the profile page)
	const [localSearchTerm, setLocalSearchTerm] = useState("");
	const [localSelectedUf, setLocalSelectedUf] = useState("FEDERAL");

	const searchTerm = propSearchTerm !== undefined ? propSearchTerm : localSearchTerm;
	const setSearchTerm = propSetSearchTerm || setLocalSearchTerm;
	const selectedUf = propSelectedUf !== undefined ? propSelectedUf : localSelectedUf;
	const setSelectedUf = propSetSelectedUf || setLocalSelectedUf;

	const handleSearch = (refOverride?: string, nomeOverride?: string) => {
		if (onSearch) {
			onSearch(refOverride, nomeOverride);
		} else {
			// If no onSearch is provided, navigate to homepage and trigger search event
			// For simplicity we just go to home, since we can't easily pass state
			router.push("/");
			// Let the homepage handle empty search state or we could pass ?q= parameter in the future
		}
	};

	const handleLogoClick = () => {
		if (onClearAll) {
			onClearAll();
		} else {
			router.push("/");
		}
	};

	return (
		<header
			className={`h-12 md:h-14 border-b border-green-500/50 md:border-green-500 bg-black backdrop-blur flex flex-row items-center justify-between px-4 md:px-6 shrink-0 z-50 relative gap-2 md:gap-4 ${showOnMobile ? 'flex' : 'hidden md:flex'}`}
		>
			<div className="flex items-center shrink-0 w-auto justify-start h-full">
				<button
					onClick={handleLogoClick}
					className="flex items-center gap-2 md:gap-3 cursor-pointer hover:opacity-80 transition-opacity outline-none"
				>
					<Terminal className="text-green-500 shrink-0 w-5 h-5 md:w-6 md:h-6" />
					<h1 className="text-base md:text-xl font-bold tracking-widest text-green-500 flex items-center gap-2 m-0 p-0">
						<span className="uppercase">
							<ScrambleText text="POLÍGRAFO" duration={1200} />
						</span>
						<span className="text-[10px] md:text-xs bg-green-900/50 text-green-400 px-1.5 md:px-2 py-0.5 rounded-none border border-green-500/50 shrink-0 font-sans tracking-normal">
							IA
						</span>
					</h1>
				</button>
				{isLoading && (
					<div className="flex items-center ml-2 text-green-500">
						<Loader2 className="w-4 h-4 animate-spin shrink-0" />
					</div>
				)}
			</div>

			{showSearch && (
				<div className="flex-1 w-full md:max-w-2xl lg:max-w-4xl flex items-center h-14 z-20">
					<SearchBar
						searchTerm={searchTerm}
						setSearchTerm={setSearchTerm}
						selectedUf={selectedUf}
						setSelectedUf={setSelectedUf}
						onSearch={handleSearch}
						onCancel={onCancel}
						isLoading={isLoading}
						isMobile={false}
						alcadas={ALCADAS_BR}
					/>
				</div>
			)}

			<div className="flex items-center gap-4 shrink-0">
				{showClearButton && onClearAll && (
					<Button
						variant="outline"
						className="border-green-500 bg-black hover:bg-green-500 hover:text-black text-green-500 rounded-none font-bold uppercase tracking-wider text-xs"
						onClick={onClearAll}
					>
						Limpar tudo
					</Button>
				)}
				{rightElement}
			</div>
		</header>
	);
}
