import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetailApiClient, normalizeAttribution } from "../src/client.js";
import { RETAIL_MCP_LANGS } from "../src/locales.js";
import { createRetailMcpServer } from "../src/server.js";

const checkout = {
  checkout_id: "cm00000000000000000000001",
  state: "requires_user_action",
  next_action: "open_checkout",
  checkout_url: "https://letisim.com/en/?country=TR&view=checkout&product=p-tr-10&agentCheckout=cm00000000000000000000001#countries",
  seller: { legalName: "HOMIFY FOR COMPUTER SYSTEMS & COMMUNICATION EQUIPMENT SOFTWARE TRADING CO. L.L.C", country: "AE" },
  product: { id: "p-tr-10", countryIso: "TR", countryName: "Turkey", flag: "🇹🇷", dataGb: 10, isUnlimited: false, days: 30, packageKind: "fixed", dailyGb: null, postThrottleKbps: null, networks: ["Turkcell"], networkTypes: ["5G"], validityStartsAt: "first_connection", activationWindowDays: 90, fupNote: null },
  money: { amountMinor: 1990, currency: "USD", exponent: 2 },
  amount_formatted: "$19.90",
  quote_expires_at: "2026-08-24T00:15:00.000Z",
  expires_at: "2026-08-24T00:30:00.000Z",
  created_at: "2026-08-24T00:00:00.000Z",
  updated_at: "2026-08-24T00:00:00.000Z",
};

const apiFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  if (url.pathname === "/api/v1/catalog/countries") {
    return Response.json({ all: [{ iso: "TR", name: "Turkey", flag: "🇹🇷" }] });
  }
  if (url.pathname === "/api/v1/catalog/countries/TR/products") {
    return Response.json({
      country: { iso: "TR", name: "Turkey", flag: "🇹🇷" },
      products: [{
        id: "p-tr-10", dataGb: 10, isUnlimited: false, days: 30, packageKind: "fixed",
        dailyGb: null, postThrottleKbps: null, validityStartsAt: "first_connection",
        activationWindowDays: 90, fupNote: null,
        offerOptions: [{ id: "offer-a", networks: ["Turkcell"], networkTypes: ["5G"], isDefault: true,
          displayMoney: { amountMinor: 1990, currency: "USD", exponent: 2 }, displayAmountFormatted: "$19.90" }],
        displayMoney: { amountMinor: 1990, currency: "USD", exponent: 2 }, displayAmountFormatted: "$19.90",
      }],
    });
  }
  if (url.pathname === "/api/v1/agent-checkouts/quote") {
    return Response.json({
      state: "quoted",
      seller: checkout.seller,
      product: checkout.product,
      money: checkout.money,
      amount_formatted: checkout.amount_formatted,
      quote_expires_at: checkout.quote_expires_at,
    });
  }
  if (url.pathname === "/api/v1/agent-checkouts" && init?.method === "POST") {
    return Response.json({
      ...checkout,
      orderToken: "must-never-cross-mcp",
      clientSecret: "must-never-cross-mcp",
      qrPayload: "must-never-cross-mcp",
    }, { status: 201 });
  }
  if (url.pathname === `/api/v1/agent-checkouts/${checkout.checkout_id}`) {
    return Response.json(init?.method === "DELETE" ? { ...checkout, state: "cancelled" } : checkout);
  }
  return Response.json({ code: "not_found" }, { status: 404 });
}) as typeof fetch;

let client: Client | null = null;
let handler: ReturnType<typeof createMcpHandler> | null = null;

afterEach(async () => {
  await client?.close();
  await handler?.close();
  client = null;
  handler = null;
  apiFetch.mockClear();
});

async function harness(attribution?: string) {
  const api = new RetailApiClient({ baseUrl: "https://api.letisim.test", fetch: apiFetch, attribution });
  handler = createMcpHandler(() => createRetailMcpServer(api), { responseMode: "json" });
  client = new Client({ name: "retail-mcp-test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://mcp.letisim.test/retail"), {
    fetch: (url, init) => handler!.fetch(new Request(url, init)),
  }));
  return client;
}

describe("Letisim retail MCP protocol surface", () => {
  it("advertises a small annotated surface and returns exact safe Money", async () => {
    const connected = await harness();
    const listed = await connected.listTools();
    expect(listed.tools.map(tool => tool.name)).toEqual([
      "letisim_search_esims",
      "letisim_quote_esim",
      "letisim_create_checkout",
      "letisim_get_checkout",
      "letisim_cancel_checkout",
    ]);
    expect(listed.tools.find(tool => tool.name === "letisim_search_esims")?.annotations?.readOnlyHint).toBe(true);
    expect(listed.tools.find(tool => tool.name === "letisim_create_checkout")?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });

    const search = await connected.callTool({
      name: "letisim_search_esims",
      arguments: { destination: "Turkey", trip_days: 7, min_data_gb: 5, lang: "en", currency: "USD" },
    });
    expect(search.isError).not.toBe(true);
    expect(search.structuredContent).toMatchObject({
      destination: { iso: "TR", name: "Türkiye" },
      plans: [{ product_id: "p-tr-10", money: { amountMinor: 1990, currency: "USD", exponent: 2 } }],
    });

    const quoted = await connected.callTool({
      name: "letisim_quote_esim",
      arguments: { product_id: "p-tr-10", offer_option_id: "offer-a", lang: "en", currency: "USD" },
    });
    expect(quoted.isError).not.toBe(true);
    expect(quoted.structuredContent).toMatchObject({
      state: "quoted",
      money: { amountMinor: 1990, currency: "USD", exponent: 2 },
    });
  });

  it("creates only a requires-user-action handoff and never sends PII/payment fields", async () => {
    const connected = await harness();
    const created = await connected.callTool({
      name: "letisim_create_checkout",
      arguments: { product_id: "p-tr-10", offer_option_id: "offer-a", lang: "en", currency: "USD", request_id: "request-0001" },
    });
    expect(created.isError).not.toBe(true);
    expect(created.structuredContent).toMatchObject({
      state: "requires_user_action",
      next_action: "open_checkout",
      checkout_url: expect.stringContaining("https://letisim.com/"),
    });
    const createCall = apiFetch.mock.calls.find(call => new URL(String(call[0])).pathname === "/api/v1/agent-checkouts");
    expect(createCall).toBeDefined();
    const sent = String((createCall?.[1] as RequestInit | undefined)?.body ?? "");
    expect(sent).toContain('"idempotencyKey":"request-0001"');
    for (const forbidden of ["email", "card", "paymentMethod", "orderToken", "clientSecret", "qrPayload", "lpa"]) {
      expect(sent.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(JSON.stringify(created).toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("polls and cancels only through the opaque safe checkout projection", async () => {
    const connected = await harness();
    const status = await connected.callTool({
      name: "letisim_get_checkout",
      arguments: { checkout_id: checkout.checkout_id },
    });
    expect(status.structuredContent).toMatchObject({
      checkout_id: checkout.checkout_id,
      state: "requires_user_action",
      next_action: "open_checkout",
    });

    const cancelled = await connected.callTool({
      name: "letisim_cancel_checkout",
      arguments: { checkout_id: checkout.checkout_id },
    });
    expect(cancelled.structuredContent).toMatchObject({ checkout_id: checkout.checkout_id, state: "cancelled" });
    expect(cancelled.structuredContent).not.toHaveProperty("checkout_url");
  });
});

/**
 * `RETAIL-MCP-002`. Атрибуция — единственная величина в этом сервере, из-за которой у кого-то
 * появляются деньги, поэтому она обязана быть недостижимой для модели: не аргумент инструмента,
 * не поле тела запроса, а заголовок процесса, который запустил партнёр.
 */
describe("Letisim retail MCP partner attribution", () => {
  it("не даёт модели ни одного поля атрибуции ни в одном инструменте", async () => {
    const connected = await harness("promo:TRAVELPRO");
    const listed = await connected.listTools();
    for (const tool of listed.tools) {
      const fields = Object.keys((tool.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {});
      for (const field of fields) {
        expect(field, `${tool.name}.${field}`).not.toMatch(/promo|ref|partner|affiliate|attribution|utm|coupon|discount/i);
      }
    }
  });

  it("шлёт ручку заголовком, а не телом запроса", async () => {
    const connected = await harness("promo:TRAVELPRO");
    await connected.callTool({
      name: "letisim_create_checkout",
      arguments: { product_id: "p-tr-10", lang: "th", request_id: "request-0002" },
    });
    const call = apiFetch.mock.calls.find(entry => new URL(String(entry[0])).pathname === "/api/v1/agent-checkouts");
    const init = call?.[1] as RequestInit | undefined;
    expect((init?.headers as Record<string, string>)["X-Letisim-Agent-Attribution"]).toBe("promo:TRAVELPRO");
    expect(String(init?.body ?? "").toLowerCase()).not.toContain("promo");
    expect(String(init?.body ?? "").toLowerCase()).not.toContain("attribution");
  });

  it("не шлёт заголовок вовсе, когда инсталляция не настроена или ручка битая", async () => {
    for (const configured of [undefined, "", "TRAVELPRO", "promo:", "javascript:alert(1)"]) {
      apiFetch.mockClear();
      const connected = await harness(configured);
      await connected.callTool({
        name: "letisim_create_checkout",
        arguments: { product_id: "p-tr-10", request_id: "request-0003" },
      });
      const call = apiFetch.mock.calls.find(entry => new URL(String(entry[0])).pathname === "/api/v1/agent-checkouts");
      const headers = ((call?.[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>;
      expect(headers["X-Letisim-Agent-Attribution"], String(configured)).toBeUndefined();
      await client?.close();
      await handler?.close();
    }
  });

  it("нормализует ручку одинаково с сервером", () => {
    expect(normalizeAttribution("promo:TRAVELPRO")).toBe("promo:TRAVELPRO");
    expect(normalizeAttribution("  ref:sunny-blog  ")).toBe("ref:sunny-blog");
    expect(normalizeAttribution("promo:bad code")).toBeNull();
    expect(normalizeAttribution(undefined)).toBeNull();
  });

  it("принимает язык каждой обслуживаемой витрины, а не только исходной пятёрки", async () => {
    const connected = await harness();
    const listed = await connected.listTools();
    const langEnum = ((listed.tools[0].inputSchema as { properties?: Record<string, { enum?: string[] }> })
      .properties?.lang?.enum) ?? [];
    expect(langEnum).toEqual([...RETAIL_MCP_LANGS]);
    for (const lang of ["th", "ja", "zh-CN", "pt-BR"]) {
      const quoted = await connected.callTool({
        name: "letisim_quote_esim",
        arguments: { product_id: "p-tr-10", lang },
      });
      expect(quoted.isError, lang).not.toBe(true);
    }
  });
});

describe("Letisim retail MCP conversation language", () => {
  it("называет страну на языке разговора, а не на языке каталога", async () => {
    const connected = await harness();
    for (const [lang, expected] of [["th", "ตุรกี"], ["ja", "トルコ"], ["ru", "Турция"]] as const) {
      const search = await connected.callTool({
        name: "letisim_search_esims",
        arguments: { destination: "TR", lang },
      });
      expect((search.structuredContent as { destination: { name: string } }).destination.name, lang).toBe(expected);
      expect((search.structuredContent as { plans: Array<{ country_name: string }> }).plans[0].country_name).toBe(expected);
    }
  });

  it("находит страну по её локальному названию, а не только по ISO и английскому", async () => {
    const connected = await harness();
    for (const [destination, lang] of [["ตุรกี", "th"], ["Турция", "ru"], ["Türkiye", "en"], ["tr", "en"]] as const) {
      const search = await connected.callTool({
        name: "letisim_search_esims",
        arguments: { destination, lang },
      });
      expect(search.isError, destination).not.toBe(true);
      expect((search.structuredContent as { destination: { iso: string } }).destination.iso).toBe("TR");
    }
  });

  it("не выдумывает страну, которой нет в каталоге", async () => {
    const connected = await harness();
    const search = await connected.callTool({
      name: "letisim_search_esims",
      arguments: { destination: "Atlantis", lang: "en" },
    });
    expect(search.isError).toBe(true);
  });
});
