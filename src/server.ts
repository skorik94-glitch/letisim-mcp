import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { RetailApiClient, RetailApiError } from "./client.js";
import { RETAIL_MCP_LANGS } from "./locales.js";

const lang = z.enum(RETAIL_MCP_LANGS)
  .describe("Language of the conversation. It selects wording and the localized checkout page, and never selects money.")
  .optional();
const currency = z.string().regex(/^[A-Za-z]{3,8}$/)
  .describe("ISO currency, ONLY when the buyer explicitly named one. Never infer it from the conversation language, the destination country or a guess about where the buyer lives — omit it instead and the server picks the default.")
  .transform(value => value.toUpperCase())
  .optional();
const productId = z.string().min(1).max(100);
const offerOptionId = z.string().min(1).max(200).optional();
const checkoutId = z.string().regex(/^[a-z0-9]{20,40}$/i);

function result(value: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function failure(error: unknown) {
  const code = error instanceof RetailApiError ? error.code : "retail_service_unavailable";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ code }) }],
    isError: true,
  };
}

export function createRetailMcpServer(api: RetailApiClient): McpServer {
  const server = new McpServer(
    { name: "letisim-retail", version: "0.1.0" },
    {
      instructions: "Search and quote public Letisim travel eSIM plans. Checkout creation is inert and never completes a purchase: the buyer must open the returned letisim.com URL, review the current total, provide email, accept terms and pay on the first-party/PSP surface. Never request card data, payment credentials, email, QR, LPA or activation codes in tool arguments. Language and currency are independent: `lang` is the conversation language and never changes the price, and `currency` may be sent only when the buyer explicitly named one. When a result carries `currency_source: \"default\"`, say that the amount is quoted in the default currency rather than calling it a local price.",
    },
  );

  server.registerTool("letisim_search_esims", {
    title: "Search Letisim eSIMs",
    description: "Find currently executable public eSIM plans for a destination. Prices are exact server-projected Money values; device compatibility is not inferred.",
    inputSchema: z.object({
      destination: z.string().min(2).max(100).describe("ISO alpha-2 code or exact localized country name"),
      trip_days: z.number().int().min(1).max(365).optional(),
      min_data_gb: z.number().positive().max(1000).optional(),
      lang,
      currency,
      limit: z.number().int().min(1).max(20).optional(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      return result(await api.search({
        destination: input.destination,
        tripDays: input.trip_days,
        minDataGb: input.min_data_gb,
        lang: input.lang,
        currency: input.currency,
        limit: input.limit,
      }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("letisim_quote_esim", {
    title: "Quote a Letisim eSIM",
    description: "Revalidate one public plan and return its exact current Money, currency provenance and quote expiry. This is read-only and does not reserve inventory or create a buyer/order/payment.",
    inputSchema: z.object({ product_id: productId, offer_option_id: offerOptionId, lang, currency }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      return result(await api.quote({
        productId: input.product_id,
        offerOptionId: input.offer_option_id,
        lang: input.lang,
        currency: input.currency,
      }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("letisim_create_checkout", {
    title: "Create Letisim checkout handoff",
    description: "Create an inert, PII-free cart and return a first-party Letisim checkout URL. This does not buy, charge, create an Order/Payment, contact a PSP or call a supplier; state is requires_user_action until the buyer acts on Letisim.",
    inputSchema: z.object({
      product_id: productId,
      offer_option_id: offerOptionId,
      lang,
      currency,
      request_id: z.string().min(8).max(64).regex(/^[A-Za-z0-9._:-]+$/).describe("Stable idempotency key for this attempted handoff"),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      return result(await api.createCheckout({
        productId: input.product_id,
        offerOptionId: input.offer_option_id,
        lang: input.lang,
        currency: input.currency,
        requestId: input.request_id,
      }));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("letisim_get_checkout", {
    title: "Get Letisim checkout status",
    description: "Read a coarse, secret-free checkout/payment/provisioning state. It never returns buyer email, Order capability, PSP identifiers, QR, LPA or activation data.",
    inputSchema: z.object({ checkout_id: checkoutId }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      return result(await api.getCheckout(input.checkout_id));
    } catch (error) {
      return failure(error);
    }
  });

  server.registerTool("letisim_cancel_checkout", {
    title: "Cancel inert Letisim checkout",
    description: "Cancel only an unpaid inert cart. It cannot cancel a started Order, paid service, provisioning, delivery or refund anything.",
    inputSchema: z.object({ checkout_id: checkoutId }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async input => {
    try {
      return result(await api.cancelCheckout(input.checkout_id));
    } catch (error) {
      return failure(error);
    }
  });

  return server;
}

export function retailMcpFactory(env: NodeJS.ProcessEnv = process.env) {
  const api = new RetailApiClient({
    // An installed package must work on first run: the default is the canonical public origin,
    // and localhost stays a deliberate override for local development.
    baseUrl: env.LETISIM_API_BASE_URL ?? "https://api.letisim.com",
    // Partner attribution belongs to whoever configured this process, not to the conversation.
    attribution: env.LETISIM_MCP_ATTRIBUTION,
  });
  return () => createRetailMcpServer(api);
}
