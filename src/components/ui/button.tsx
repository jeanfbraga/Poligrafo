import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Botão do design system "Terminal Fósforo".
 * Variantes canônicas: default (contorno), primary (ação principal), danger,
 * ghost. Os nomes legados (cyber, cyber-destructive, outline, destructive...)
 * continuam aceitos como alias para não quebrar chamadores antigos.
 */
const buttonVariants = cva("pg-btn", {
	variants: {
		variant: {
			default: "",
			outline: "",
			secondary: "",
			primary: "pg-btn--primary",
			cyber: "pg-btn--primary",
			danger: "pg-btn--danger",
			destructive: "pg-btn--danger",
			"cyber-destructive": "pg-btn--danger",
			ghost: "pg-btn--ghost",
			link: "pg-btn--ghost",
		},
		size: {
			default: "",
			sm: "",
			lg: "pg-btn--big",
			big: "pg-btn--big",
			icon: "pg-btn--icon",
			block: "pg-btn--block",
		},
	},
	defaultVariants: {
		variant: "default",
		size: "default",
	},
});

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				className={cn(buttonVariants({ variant, size }), className)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
