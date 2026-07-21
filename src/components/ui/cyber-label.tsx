import * as React from "react";
import { cn } from "@/lib/utils";

export const CyberLabel = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => (
	<p
		ref={ref}
		className={cn(
			"text-xs text-green-700 font-mono uppercase tracking-widest mb-1",
			className,
		)}
		{...props}
	>
		&gt; {children}
	</p>
));
CyberLabel.displayName = "CyberLabel";
