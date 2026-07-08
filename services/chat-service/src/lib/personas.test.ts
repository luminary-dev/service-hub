import { describe, expect, it } from "vitest";
import { PERSONAS, type PersonaContext } from "./personas";

const ctx: PersonaContext = { locale: "en", gatewayUrl: "http://gw.test" };

describe("marketplace.propose_inquiry (out-of-band confirmation #202)", () => {
  const marketplace = PERSONAS.marketplace;

  it("never writes — it returns a draft as an out-of-band client event", async () => {
    const outcome = await marketplace.runTool(
      "propose_inquiry",
      {
        providerId: "prov-1",
        providerName: "Kamal Plumbing",
        name: "Nimal",
        phone: "0771234567",
        message: "My kitchen sink is leaking and needs fixing.",
      },
      ctx
    );

    // The model is told the inquiry was NOT sent.
    const result = JSON.parse(outcome.result);
    expect(result.status).toBe("awaiting_user_confirmation");

    // The draft is streamed to the browser, not created server-side.
    expect(outcome.clientEvent).toMatchObject({
      type: "proposal",
      proposal: {
        providerId: "prov-1",
        providerName: "Kamal Plumbing",
        name: "Nimal",
        phone: "0771234567",
      },
    });
  });

  it("refuses to propose when required fields are missing", async () => {
    const outcome = await marketplace.runTool(
      "propose_inquiry",
      { providerId: "prov-1", name: "N", phone: "", message: "too short" },
      ctx
    );
    expect(outcome.clientEvent).toBeUndefined();
    expect(JSON.parse(outcome.result).error).toBeTruthy();
  });

  it("has no create_inquiry / model-set confirmed flag anywhere in its tools", () => {
    const names = marketplace.tools.map((t) => t.name);
    expect(names).toContain("propose_inquiry");
    expect(names).not.toContain("create_inquiry");
    const propose = marketplace.tools.find((t) => t.name === "propose_inquiry");
    expect(
      Object.keys(propose?.input_schema.properties ?? {})
    ).not.toContain("confirmed");
  });
});
