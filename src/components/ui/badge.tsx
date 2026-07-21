import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
				outline: "text-foreground",
				"cyber-green":
					"border-green-500 bg-green-900/30 text-green-500 rounded-none uppercase tracking-widest font-mono",
				"cyber-red":
					"border-red-500 bg-red-950/20 text-red-500 shadow-[0_0_12px_rgba(239,68,68,0.3)] rounded-none uppercase tracking-widest font-mono",
				"cyber-yellow":
					"border-yellow-500 bg-yellow-950/20 text-yellow-500 rounded-none uppercase tracking-widest font-mono",
				"cyber-purple":
					"border-purple-500 bg-purple-950/20 text-purple-400 rounded-none uppercase tracking-widest font-mono",
				"cyber-slate":
					"border-slate-700 bg-slate-900 text-slate-300 rounded-none uppercase tracking-widest font-mono",
				"cyber-teal":
					"border-teal-500 bg-teal-950/20 text-teal-400 rounded-none uppercase tracking-widest font-mono",
				"cyber-blue":
					"border-blue-500 bg-blue-950/20 text-blue-400 rounded-none uppercase tracking-widest font-mono",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

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
