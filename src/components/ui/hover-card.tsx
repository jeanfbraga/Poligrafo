"use client";

import { useGSAP } from "@gsap/react";
import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import gsap from "gsap";
import * as React from "react";

import { cn } from "@/lib/utils";

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
	React.ElementRef<typeof HoverCardPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(
	(
		{ className, align = "center", sideOffset = 4, children, ...props },
		ref,
	) => {
		const [element, setElement] = React.useState<HTMLDivElement | null>(null);

		const contentRef = React.useCallback((node: HTMLDivElement | null) => {
			if (node) {
				setElement(node);
			}
		}, []);

		useGSAP(
			() => {
				if (!element) return;

				// Find the parent HoverCardPrimitive.Content that has data-state
				// Since our wrapper is inside it, the parent holds the data-state.
				const parentContent = element.closest("[data-state]");

				const animateIn = () => {
					const tl = gsap.timeline();

					const borders = element.querySelectorAll(".anim-border");
					const bg = element.querySelector(".anim-bg");
					const content = element.querySelector(".anim-content");
					const innerElements = content?.querySelectorAll(
						"h4, p, span, img, button, svg, [class*='border-green-500'], [class*='border-t']",
					);

					// Initial state
					gsap.set(borders, {
						scaleX: 0,
						scaleY: 0,
						transformOrigin: "top left",
					});
					gsap.set(bg, { opacity: 0, clipPath: "inset(0% 0% 100% 0%)" });
					gsap.set(content, { opacity: 0 });
					gsap.set(innerElements || [], {
						opacity: 0,
						y: 10,
						filter: "blur(4px)",
					});

					// 1. Draw outline (Top & Bottom rightwards, Left & Right downwards)
					tl.to(element.querySelector(".border-t"), {
						scaleX: 1,
						duration: 0.1,
						ease: "none",
					})
						.to(
							element.querySelector(".border-r"),
							{ scaleY: 1, duration: 0.1, ease: "none" },
							"-=0.08",
						)
						.to(
							element.querySelector(".border-b"),
							{
								scaleX: 1,
								duration: 0.1,
								ease: "none",
								transformOrigin: "bottom right",
							},
							"-=0.08",
						)
						.to(
							element.querySelector(".border-l"),
							{
								scaleY: 1,
								duration: 0.1,
								ease: "none",
								transformOrigin: "bottom left",
							},
							"-=0.08",
						);

					// 2. Build the background + checkerboard (starts almost immediately)
					tl.to(
						bg,
						{
							opacity: 1,
							clipPath: "inset(0% 0% 0% 0%)",
							duration: 0.2,
							ease: "power2.out",
						},
						0.05,
					);

					// 3. Reveal container and stagger inner content
					tl.to(content, { opacity: 1, duration: 0.1 }, 0.1);
					if (innerElements && innerElements.length > 0) {
						tl.to(
							innerElements,
							{
								opacity: 1,
								y: 0,
								filter: "blur(0px)",
								duration: 0.15,
								stagger: 0.02,
								ease: "power2.out",
							},
							0.1,
						);
					}
				};

				if (parentContent) {
					const observer = new MutationObserver((mutations) => {
						mutations.forEach((mutation) => {
							if (mutation.attributeName === "data-state") {
								const state = parentContent.getAttribute("data-state");
								if (state === "open") {
									animateIn();
								}
							}
						});
					});

					observer.observe(parentContent, { attributes: true });

					// initial check
					if (parentContent.getAttribute("data-state") === "open") {
						animateIn();
					}

					return () => observer.disconnect();
				} else {
					// Fallback if no parent with data-state is found
					animateIn();
				}
			},
			{ scope: element || undefined, dependencies: [element] },
		);

		return (
			<HoverCardPrimitive.Content
				ref={ref}
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-50 w-72 rounded-none p-0 text-green-400 outline-none relative overflow-hidden border-none bg-transparent shadow-none",
					"data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
					className,
				)}
				{...props}
			>
				<div ref={contentRef} className="w-full h-full relative p-4">
					{/* Borders */}
					<div className="anim-border border-t absolute top-0 left-0 w-full h-px bg-green-500 z-20"></div>
					<div className="anim-border border-r absolute top-0 right-0 w-px h-full bg-green-500 z-20"></div>
					<div className="anim-border border-b absolute bottom-0 right-0 w-full h-px bg-green-500 z-20"></div>
					<div className="anim-border border-l absolute bottom-0 left-0 w-px h-full bg-green-500 z-20"></div>

					{/* Background */}
					<div
						className="anim-bg absolute inset-0 z-[-1] pointer-events-none opacity-0 bg-black/95 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
					></div>
					<div className="anim-content relative z-10 w-full h-full opacity-0">
						{children}
					</div>
				</div>
			</HoverCardPrimitive.Content>
		);
	},
);
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardContent, HoverCardTrigger };
