import { Search, User } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { AnimatedNumber } from "@/components/dashboard/AnimatedNumber";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";

export interface DashboardListProfile {
	nome: string;
	partido: string;
	uf?: string;
	foto?: string | null;
	id?: string | number;
	cargo?: string;
	casa?: string;
	ref?: string;
}

export interface DashboardListItem {
	label: React.ReactNode;
	value: number;
	profile?: DashboardListProfile | null;
	ref?: string;
}

interface DashboardListProps {
	items?: DashboardListItem[];
	limit?: number;
	showRank?: boolean;
	valuePrefix?: string;
	valueSuffix?: string;
	isCurrency?: boolean;
}

const ProfileAvatar = ({ profile }: { profile: DashboardListProfile }) => {
	const [error, setError] = useState(false);

	if (!profile.foto || error) {
		return (
			<div className="h-16 w-16 bg-green-950/30 border border-green-500 flex items-center justify-center shrink-0">
				<User className="w-8 h-8 text-green-700" />
			</div>
		);
	}

	return (
		<div className="h-16 w-16 overflow-hidden rounded-none border border-green-500 shrink-0 bg-green-950/30">
			<img
				src={profile.foto}
				alt={profile.nome}
				className="object-cover w-full h-full"
				onError={() => setError(true)}
			/>
		</div>
	);
};

export function DashboardList({
	items,
	limit = 10,
	showRank = true,
	valuePrefix,
	valueSuffix,
	isCurrency,
}: DashboardListProps) {
	if (!items || items.length === 0) return null;

	return (
		<div className="space-y-3">
			{items.slice(0, limit).map((item, i) => {
				const content = (
					<>
						{showRank && (
							<span className="text-green-700 w-5 shrink-0">{i + 1}.</span>
						)}
						<span className="truncate text-amber-400 font-bold">
							{item.label}
						</span>
					</>
				);

				return (
					<div key={i} className="flex justify-between items-center text-sm">
						<div className="flex items-center gap-2 overflow-hidden mr-2">
							{item.profile ? (
								<HoverCard>
									<HoverCardTrigger className="flex items-center gap-2 overflow-hidden cursor-crosshair hover:text-green-300 transition-colors">
										{content}
									</HoverCardTrigger>
									<HoverCardContent className="w-80 bg-black/95 text-green-400 font-mono shadow-[0_0_20px_rgba(34,197,94,0.3)] z-50 border-none">
										<div className="flex justify-between space-x-4">
											<ProfileAvatar profile={item.profile} />

											<div className="space-y-1 flex-1 min-w-0">
												<h4 className="text-sm font-bold uppercase tracking-widest leading-tight">
													{item.profile.nome}
												</h4>
												{item.profile.cargo && (
													<div className="text-[10px] text-green-500 uppercase tracking-widest mt-1 mb-1 font-semibold">
														{item.profile.cargo}
													</div>
												)}
												<p className="text-xs text-green-600 uppercase tracking-wider">
													{item.profile.partido} — {item.profile.uf}
												</p>

												<div className="flex items-center pt-2">
													<span className="relative flex h-2 w-2 mr-2">
														<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
														<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
													</span>
													<span className="text-xs uppercase text-green-500 tracking-widest">
														PERFIL RASTREADO
													</span>
												</div>
											</div>
										</div>
										<div className="mt-4 pt-4 border-t border-green-900/50">
											<button
												className="w-full py-2 bg-green-500 hover:bg-green-400 text-black text-xs font-bold tracking-widest uppercase transition-colors flex items-center justify-center gap-2"
												onClick={() => {
													const event = new CustomEvent("poligrafo:search", {
														detail: {
															nome: item.profile?.nome,
															id: item.profile?.id,
															casa: item.profile?.casa,
															ref: item.profile?.ref || item.ref,
														},
													});
													window.dispatchEvent(event);
												}}
											>
												<Search className="w-3 h-3" />
												INICIAR VARREDURA
											</button>
										</div>
									</HoverCardContent>
								</HoverCard>
							) : (
								content
							)}
						</div>
						<span className="font-bold text-green-500 shrink-0 text-right">
							<AnimatedNumber
								value={item.value}
								prefix={valuePrefix}
								suffix={valueSuffix}
								isCurrency={isCurrency}
							/>
						</span>
					</div>
				);
			})}
		</div>
	);
}
