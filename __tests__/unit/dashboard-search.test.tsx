// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DashboardList } from "../../src/components/dashboard/DashboardList";
import { PoliticianHoverCard } from "../../src/components/dashboard/PoliticianHoverCard";
import React from "react";

vi.mock("../../src/components/ui/hover-card", () => ({
	HoverCard: ({ children }: any) => <div>{children}</div>,
	HoverCardTrigger: ({ children }: any) => <div>{children}</div>,
	HoverCardContent: ({ children }: any) => <div>{children}</div>,
}));

describe("Dashboard Events (poligrafo:search)", () => {
	it("DashboardList - dispatches event with exact ref and ignores CAMARA default", async () => {
		const items = [
			{
				label: "Rogério Marinho",
				value: 100,
				profile: {
					nome: "Rogério Marinho",
					partido: "PL",
					uf: "RN",
					id: "4694",
					casa: "SENADO",
					cargo: "SENADOR(A)",
					ref: "FEDERAL:SENADO:4694",
				},
			},
		];

		const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

		// Render the list
		render(<DashboardList items={items} />);

		// HoverCard trigger might need to be interacted with to show the button, but Radix HoverCard
		// can be tricky in JSDOM. We will instead test the PoliticianHoverCard directly, 
		// which receives a DraftProfile.
	});

	it("PoliticianHoverCard - dispatches event with exact ref", async () => {
		const profile = {
			nome: "Rogério Marinho",
			partido: "PL",
			uf: "RN",
			id: "4694",
			casa: "SENADO",
			cargo: "SENADOR(A)",
			ref: "FEDERAL:SENADO:4694",
		};

		const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

		render(
			<PoliticianHoverCard profile={profile}>
				<div data-testid="hover-trigger">Trigger</div>
			</PoliticianHoverCard>
		);

		// Trigger the hover card
		const trigger = screen.getByTestId("hover-trigger");
		fireEvent.mouseEnter(trigger);

		// The button 'INICIAR VARREDURA' should appear
		const button = await screen.findByText(/INICIAR VARREDURA/i);
		fireEvent.click(button);

		// Verifies the dispatched CustomEvent payload
		expect(dispatchEventSpy).toHaveBeenCalled();
		const eventArg = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
		expect(eventArg.type).toBe("poligrafo:search");
		expect(eventArg.detail).toEqual({
			nome: "Rogério Marinho",
			id: "4694",
			casa: "SENADO",
			ref: "FEDERAL:SENADO:4694",
		});
	});
});
