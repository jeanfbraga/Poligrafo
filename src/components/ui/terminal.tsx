import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// --- TERMINAL WINDOW ---
interface TerminalWindowProps {
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  badge?: ReactNode;
  scanline?: boolean;
}

export function TerminalWindow({ 
  title, 
  icon, 
  children, 
  className, 
  badge, 
  scanline = true 
}: TerminalWindowProps) {
  return (
    <section className={cn("p-4 md:p-6 border border-green-500/30 bg-black/60 relative overflow-hidden group", className)}>
      {scanline && (
        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(34,197,94,0.02)_50%)] bg-size-[100%_4px] pointer-events-none z-0"></div>
      )}
      
      {title && (
        <h2 className="text-base md:text-lg font-bold uppercase text-green-400 mb-4 flex flex-wrap items-center gap-2 relative z-10 border-b border-green-500/20 pb-2">
          {icon && <span className="text-green-500">{icon}</span>}
          <span>{title}</span>
          {badge && (
            <span className="text-[10px] md:text-xs font-normal bg-green-500/20 px-2 py-0.5 rounded-none text-green-400 whitespace-nowrap ml-auto sm:ml-2">
              {badge}
            </span>
          )}
        </h2>
      )}
      
      <div className={cn("relative z-10 flex-1 min-h-0 flex flex-col w-full", className?.includes("max-h-") || className?.includes("h-") ? "h-full" : "")}>
        {children}
      </div>
    </section>
  );
}

// --- TERMINAL CARD ---
interface TerminalCardProps {
  children: ReactNode;
  className?: string;
}

export function TerminalCard({ children, className }: TerminalCardProps) {
  return (
    <div className={cn("p-3 border border-green-500/10 bg-black/60 hover:border-green-500/40 transition-colors", className)}>
      {children}
    </div>
  );
}

// --- TERMINAL BADGE ---
interface TerminalBadgeProps {
  children: ReactNode;
  color?: "green" | "red" | "blue" | "yellow" | "neutral";
  className?: string;
}

export function TerminalBadge({ children, color = "green", className }: TerminalBadgeProps) {
  const colorMap = {
    green: "text-green-400 bg-green-400/10 border-green-400/30",
    red: "text-red-400 bg-red-400/10 border-red-400/30",
    blue: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    yellow: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    neutral: "text-neutral-400 bg-neutral-400/10 border-neutral-400/30",
  };
  
  return (
    <span className={cn("inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border rounded-none text-xs sm:text-sm font-bold uppercase", colorMap[color], className)}>
      {children}
    </span>
  );
}
