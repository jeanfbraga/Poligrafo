import { type PixelIconName, resolvePixelIcon } from "./pixel-icons";

interface PixelIconProps {
	name: PixelIconName;
	/** Tamanho pedido: 12–15 → 16px (8x8); ≥16 → 20px (10x10). Padrão 16. */
	size?: number;
	className?: string;
	/** Rótulo acessível. Sem rótulo o ícone é decorativo (aria-hidden). */
	label?: string;
}

/** Ícone pixel do design system. Herda a cor do texto (`currentColor`). */
export function PixelIcon({ name, size = 16, className, label }: PixelIconProps) {
	const { grid, px, path } = resolvePixelIcon(name, size);
	const a11y = label
		? ({ role: "img", "aria-label": label } as const)
		: ({ "aria-hidden": true } as const);

	return (
		<svg
			className={className ? `pg-ic ${className}` : "pg-ic"}
			width={px}
			height={px}
			viewBox={`0 0 ${grid} ${grid}`}
			shapeRendering="crispEdges"
			fill="currentColor"
			{...a11y}
		>
			<path d={path} />
		</svg>
	);
}

export type { PixelIconName };
