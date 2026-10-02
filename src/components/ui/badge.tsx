import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Badge = Tag do design system. Tons canônicos: default, phos (ok/ativo),
 * warn (atenção), crit (crítico), steel (neutro frio).
 * Cor de família NÃO existe aqui: ela vive só no cabeçalho do node.
 */
const badgeVariants = cva("pg-tag", {
	variants: {
		variant: {
			default: "",
			secondary: "",
			outline: "",
			phos: "pg-tag--phos",
			warn: "pg-tag--warn",
			crit: "pg-tag--crit",
			steel: "pg-tag--steel",
			destructive: "pg-tag--crit",
			"cyber-green": "pg-tag--phos",
			"cyber-red": "pg-tag--crit",
			"cyber-yellow": "pg-tag--warn",
			"cyber-slate": "pg-tag--steel",
			"cyber-purple": "",
			"cyber-teal": "",
			"cyber-blue": "",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

export interface BadgeProps
	extends React.HTMLAttributes<HTMLDivElement>,
		VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
	({ className, variant, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(badgeVariants({ variant }), className)}
				{...props}
			/>
		);
	},
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
