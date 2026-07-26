"use client";

import { NodeShell } from "./NodeShell";

export const SocioNode = ({ data, isMobile }: { data: any, isMobile?: boolean }) => {
	return (
		<NodeShell type="SOCIO" data={data} isMobile={isMobile}>
			<div>
				<p className="text-xs uppercase font-bold text-purple-600">
					Cargo / Qualificação
				</p>
				<p className="text-xs opacity-80 text-purple-400">{data.cargo}</p>
			</div>
		</NodeShell>
	);
};
