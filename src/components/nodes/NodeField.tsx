import type { ReactNode } from "react";
import type { AccentTokens } from "./node-theme";

export type NodeFieldVariant =
	| "default"
	| "chip"
	| "money"
	| "clamp2"
	| "clamp3";

/**
 * Par rótulo/valor padronizado para o conteúdo dos nodes.
 * Rótulo: text-xs uppercase bold tracking-wider na cor de label do tema.
 */
export const NodeField = ({
	label,
	value,
	colors,
	variant = "default",
	valueClassName = "",
	isMobile = false,
}: {
	label: ReactNode;
	value: ReactNode;
	colors: AccentTokens;
	variant?: NodeFieldVariant;
	valueClassName?: string;
	isMobile?: boolean;
}) => {
	return (
		<div className={isMobile ? "mt-2 border-l-2 border-inherit pl-3" : ""}>
			<p
				className={`text-xs uppercase font-bold tracking-wider ${colors.label}`}
			>
				{label}
			</p>
			{variant === "money" ? (
				<p
					className={`text-lg font-bold truncate mt-0.5 ${colors.text} ${valueClassName}`}
				>
					{value}
				</p>
			) : variant === "chip" ? (
				<p className="text-xs mt-1">
					<span className={`${colors.chip} px-1 py-0.5 rounded-sm`}>
						{value}
					</span>
				</p>
			) : (
				<p
					className={`text-xs mt-0.5 ${variant === "clamp2" ? "line-clamp-2" : ""} ${variant === "clamp3" ? "line-clamp-3" : ""} ${colors.textSoft} ${valueClassName}`}
				>
					{value}
				</p>
			)}
		</div>
	);
};
