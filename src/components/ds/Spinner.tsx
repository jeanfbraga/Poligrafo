/** Spinner pixel: 4 quadrados acendendo em sequência. */
export function Spinner({ label = "em andamento" }: { label?: string }) {
	return (
		<span className="pg-spin" role="img" aria-label={label}>
			<u />
			<u />
			<u />
			<u />
		</span>
	);
}
