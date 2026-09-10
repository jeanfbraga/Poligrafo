"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
	[k in string]: {
		label?: React.ReactNode;
		icon?: React.ComponentType;
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<keyof typeof THEMES, string> }
	);
};

type ChartContextProps = {
	config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
	const context = React.useContext(ChartContext);

	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}

	return context;
}

const ChartContainer = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> & {
		config: ChartConfig;
		children: React.ComponentProps<
			typeof RechartsPrimitive.ResponsiveContainer
		>["children"];
	}
>(({ id, className, children, config, ...props }, ref) => {
	const uniqueId = React.useId();
	const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				data-chart={chartId}
				ref={ref}
				className={cn(
					"flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
					className,
				)}
				{...props}
			>
				<ChartStyle id={chartId} config={config} />
				<RechartsPrimitive.ResponsiveContainer>
					{children}
				</RechartsPrimitive.ResponsiveContainer>
			</div>
		</ChartContext.Provider>
	);
});
ChartContainer.displayName = "Chart";

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
	const colorConfig = Object.entries(config).filter(
		([, config]) => config.theme || config.color,
	);

	if (!colorConfig.length) {
		return null;
	}

	return (
		<style
			dangerouslySetInnerHTML={{
				__html: Object.entries(THEMES)
					.map(
						([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
	.map(([key, itemConfig]) => {
		const color =
			itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
			itemConfig.color;
		return color ? `  --color-${key}: ${color};` : null;
	})
	.join("\n")}
}
`,
					)
					.join("\n"),
			}}
		/>
	);
};

const ChartTooltip = RechartsPrimitive.Tooltip;

function resolveTooltipLabelValue(
	config: ChartConfig,
	item: any,
	labelKey?: string,
	label?: React.ReactNode,
	itemConfig?: any,
): React.ReactNode {
	if (!labelKey && typeof label === "string") {
		return config[label as keyof typeof config]?.label || label;
	}
	return itemConfig?.label;
}

function resolveItemKey(nameKey?: string, item?: any): string {
	if (nameKey) return nameKey;
	if (item?.name) return item.name;
	if (item?.dataKey) return item.dataKey;
	return "value";
}

interface ChartIndicatorProps {
	itemConfig?: any;
	hideIndicator?: boolean;
	indicator?: "dot" | "line" | "dashed";
	indicatorColor?: string;
	nestLabel?: boolean;
}

const ChartIndicator = ({
	itemConfig,
	hideIndicator,
	indicator,
	indicatorColor,
	nestLabel,
}: ChartIndicatorProps) => {
	if (itemConfig?.icon) {
		const Icon = itemConfig.icon;
		return <Icon />;
	}
	if (hideIndicator) return null;
	return (
		<div
			className={cn(
				"shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
				indicator === "dot" && "h-2.5 w-2.5",
				indicator === "line" && "w-1",
				indicator === "dashed" && "w-0 border-[1.5px] border-dashed bg-transparent",
				nestLabel && indicator === "dashed" && "my-0.5",
			)}
			style={
				{
					"--color-bg": indicatorColor,
					"--color-border": indicatorColor,
				} as React.CSSProperties
			}
		/>
	);
};

const ChartItemDetails = ({
	nestLabel,
	tooltipLabel,
	label,
	value,
}: {
	nestLabel: boolean;
	tooltipLabel: React.ReactNode;
	label: string;
	value?: any;
}) => (
	<div
		className={cn(
			"flex flex-1 justify-between leading-none",
			nestLabel ? "items-end" : "items-center",
		)}
	>
		<div className="grid gap-1.5">
			{nestLabel ? tooltipLabel : null}
			<span className="text-muted-foreground">{label}</span>
		</div>
		{value !== undefined && value !== null && (
			<span className="font-mono font-medium tabular-nums text-foreground">
				{value.toLocaleString()}
			</span>
		)}
	</div>
);

interface ChartTooltipRowProps {
	item: any;
	index: number;
	config: any;
	nameKey?: string;
	color?: string;
	formatter?: any;
	indicator?: "line" | "dot" | "dashed";
	hideIndicator?: boolean;
	nestLabel: boolean;
	tooltipLabel?: React.ReactNode;
}

const ChartTooltipRow = ({
	item,
	index,
	config,
	nameKey,
	color,
	formatter,
	indicator,
	hideIndicator,
	nestLabel,
	tooltipLabel,
}: ChartTooltipRowProps) => {
	const key = resolveItemKey(nameKey, item);
	const itemConfig = getPayloadConfigFromPayload(config, item, key);
	const indicatorColor = color || item.payload?.fill || item.color;
	const rowClass = cn(
		"flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
		indicator === "dot" && "items-center",
	);

	if (formatter && item?.value !== undefined && item.name) {
		return (
			<div className={rowClass}>
				{formatter(item.value, item.name, item, index, item.payload)}
			</div>
		);
	}

	return (
		<div className={rowClass}>
			<ChartIndicator
				itemConfig={itemConfig}
				hideIndicator={hideIndicator}
				indicator={indicator}
				indicatorColor={indicatorColor}
				nestLabel={nestLabel}
			/>
			<ChartItemDetails
				nestLabel={nestLabel}
				tooltipLabel={tooltipLabel}
				label={itemConfig?.label || item.name}
				value={item.value}
			/>
		</div>
	);
};

const ChartTooltipContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
		React.ComponentProps<"div"> & {
			hideLabel?: boolean;
			hideIndicator?: boolean;
			indicator?: "line" | "dot" | "dashed";
			nameKey?: string;
			labelKey?: string;
		}
>(
	(
		{
			active,
			payload,
			className,
			indicator = "dot",
			hideLabel = false,
			hideIndicator = false,
			label,
			labelFormatter,
			labelClassName,
			formatter,
			color,
			nameKey,
			labelKey,
		},
		ref,
	) => {
		const { config } = useChart();

		const tooltipLabel = React.useMemo(() => {
			if (hideLabel || !payload?.length) {
				return null;
			}

			const [item] = payload;
			const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
			const itemConfig = getPayloadConfigFromPayload(config, item, key);
			const value = resolveTooltipLabelValue(config, item, labelKey, label, itemConfig);

			if (labelFormatter) {
				return (
					<div className={cn("font-medium", labelClassName)}>
						{labelFormatter(value, payload)}
					</div>
				);
			}

			if (!value) {
				return null;
			}

			return <div className={cn("font-medium", labelClassName)}>{value}</div>;
		}, [
			label,
			labelFormatter,
			payload,
			hideLabel,
			labelClassName,
			config,
			labelKey,
		]);

		if (!active || !payload?.length) {
			return null;
		}

		const nestLabel = payload.length === 1 && indicator !== "dot";

		return (
			<div
				ref={ref}
				className={cn(
					"grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
					className,
				)}
			>
				{!nestLabel ? tooltipLabel : null}
				<div className="grid gap-1.5">
					{payload
						.filter((item) => item.type !== "none")
						.map((item, index) => (
							<ChartTooltipRow
								key={item.dataKey || index}
								item={item}
								index={index}
								config={config}
								nameKey={nameKey}
								color={color}
								formatter={formatter}
								indicator={indicator}
								hideIndicator={hideIndicator}
								nestLabel={nestLabel}
								tooltipLabel={tooltipLabel}
							/>
						))}
				</div>
			</div>
		);
	},
);
ChartTooltipContent.displayName = "ChartTooltip";

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
	HTMLDivElement,
	React.ComponentProps<"div"> &
		Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
			hideIcon?: boolean;
			nameKey?: string;
		}
>(
	(
		{ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey },
		ref,
	) => {
		const { config } = useChart();

		if (!payload?.length) {
			return null;
		}

		return (
			<div
				ref={ref}
				className={cn(
					"flex items-center justify-center gap-4",
					verticalAlign === "top" ? "pb-3" : "pt-3",
					className,
				)}
			>
				{payload
					.filter((item) => item.type !== "none")
					.map((item) => {
						const key = `${nameKey || item.dataKey || "value"}`;
						const itemConfig = getPayloadConfigFromPayload(config, item, key);

						return (
							<div
								key={item.value}
								className={cn(
									"flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
								)}
							>
								{itemConfig?.icon && !hideIcon ? (
									<itemConfig.icon />
								) : (
									<div
										className="h-2 w-2 shrink-0 rounded-[2px]"
										style={{
											backgroundColor: item.color,
										}}
									/>
								)}
								{itemConfig?.label}
							</div>
						);
					})}
			</div>
		);
	},
);
ChartLegendContent.displayName = "ChartLegend";

function extractPayloadObject(payload: unknown): Record<string, unknown> | undefined {
	if (typeof payload !== "object" || payload === null) return undefined;
	if ("payload" in payload && typeof (payload as any).payload === "object" && (payload as any).payload !== null) {
		return (payload as any).payload;
	}
	return undefined;
}

function resolveConfigLabelKey(payload: any, innerPayload: any, key: string): string {
	if (key in payload && typeof payload[key] === "string") {
		return payload[key];
	}
	if (innerPayload && key in innerPayload && typeof innerPayload[key] === "string") {
		return innerPayload[key];
	}
	return key;
}

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(
	config: ChartConfig,
	payload: unknown,
	key: string,
) {
	if (typeof payload !== "object" || payload === null) {
		return undefined;
	}

	const inner = extractPayloadObject(payload);
	const configLabelKey = resolveConfigLabelKey(payload, inner, key);

	return configLabelKey in config
		? config[configLabelKey]
		: config[key as keyof typeof config];
}

export {
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartStyle,
	ChartTooltip,
	ChartTooltipContent,
};
