export type RetailMoney = {
  amountMinor: number;
  currency: string;
  exponent: number;
};

export type RetailPlan = {
  product_id: string;
  offer_option_id: string | null;
  country_iso: string;
  country_name: string;
  flag: string;
  data_gb: number | null;
  is_unlimited: boolean;
  days: number;
  package_kind: string;
  daily_gb: number | null;
  post_throttle_kbps: number | null;
  networks: string[];
  network_types: string[];
  validity_starts_at: string;
  activation_window_days: number | null;
  fup_note: string | null;
  money: RetailMoney;
  amount_formatted: string;
};

export type SearchResult = {
  destination: { iso: string; name: string; flag: string };
  plans: RetailPlan[];
};

export class RetailApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "RetailApiError";
  }
}

type FetchLike = typeof fetch;

type CatalogCountry = { iso: string; name: string; flag: string };
type CatalogProduct = {
  id: string;
  dataGb: number | null;
  isUnlimited: boolean;
  days: number;
  packageKind: string;
  dailyGb: number | null;
  postThrottleKbps: number | null;
  offerOptions?: Array<{
    id: string;
    networks?: string[];
    networkTypes?: string[];
    isDefault?: boolean;
    displayMoney?: RetailMoney;
    displayAmountFormatted?: string;
  }>;
  validityStartsAt: string;
  activationWindowDays: number | null;
  fupNote?: string | null;
  displayMoney: RetailMoney;
  displayAmountFormatted: string;
};

const stringValue = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const numberValue = (value: unknown): number | undefined => Number.isFinite(value) ? Number(value) : undefined;
const nullableNumber = (value: unknown): number | null | undefined => value === null ? null : numberValue(value);
const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : [];

function safeMoney(value: unknown): RetailMoney | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const amountMinor = numberValue(row.amountMinor);
  const currency = stringValue(row.currency);
  const exponent = numberValue(row.exponent);
  return Number.isSafeInteger(amountMinor) && currency && Number.isSafeInteger(exponent)
    ? { amountMinor: amountMinor!, currency, exponent: exponent! }
    : undefined;
}

function safeSeller(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const legalName = stringValue(row.legalName);
  const country = stringValue(row.country);
  return legalName && country ? { legalName, country } : undefined;
}

function safeAgentProduct(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const id = stringValue(row.id);
  const countryIso = stringValue(row.countryIso);
  if (!id || !countryIso) return undefined;
  return {
    id,
    countryIso,
    ...(stringValue(row.countryName) ? { countryName: stringValue(row.countryName) } : {}),
    ...(stringValue(row.flag) ? { flag: stringValue(row.flag) } : {}),
    ...(nullableNumber(row.dataGb) !== undefined ? { dataGb: nullableNumber(row.dataGb) } : {}),
    isUnlimited: row.isUnlimited === true,
    ...(numberValue(row.days) !== undefined ? { days: numberValue(row.days) } : {}),
    ...(stringValue(row.packageKind) ? { packageKind: stringValue(row.packageKind) } : {}),
    ...(nullableNumber(row.dailyGb) !== undefined ? { dailyGb: nullableNumber(row.dailyGb) } : {}),
    ...(nullableNumber(row.postThrottleKbps) !== undefined ? { postThrottleKbps: nullableNumber(row.postThrottleKbps) } : {}),
    networks: stringArray(row.networks),
    networkTypes: stringArray(row.networkTypes),
    ...(stringValue(row.validityStartsAt) ? { validityStartsAt: stringValue(row.validityStartsAt) } : {}),
    ...(nullableNumber(row.activationWindowDays) !== undefined ? { activationWindowDays: nullableNumber(row.activationWindowDays) } : {}),
    ...(row.fupNote === null || stringValue(row.fupNote) ? { fupNote: row.fupNote as string | null } : {}),
  };
}

function safeCheckoutUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "letisim.com" || url.hostname.endsWith(".letisim.com"))
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function projectAgentResponse(body: Record<string, unknown>): Record<string, unknown> {
  const state = stringValue(body.state);
  const product = safeAgentProduct(body.product);
  const money = safeMoney(body.money);
  const seller = safeSeller(body.seller);
  const allowedStates = new Set([
    "quoted", "requires_user_action", "payment_pending", "paid", "provisioning",
    "delivered", "provisioning_failed", "refund_requested", "refunded", "expired", "cancelled",
  ]);
  if (!state || !allowedStates.has(state) || !product || !money || !seller) {
    throw new RetailApiError("upstream_invalid_response", 502);
  }
  const checkoutId = stringValue(body.checkout_id);
  const checkoutUrl = safeCheckoutUrl(body.checkout_url);
  if (state !== "quoted" && (!checkoutId || !/^[a-z0-9]{20,40}$/i.test(checkoutId))) {
    throw new RetailApiError("upstream_invalid_response", 502);
  }
  if (state === "requires_user_action" && !checkoutUrl) {
    throw new RetailApiError("upstream_invalid_response", 502);
  }
  return {
    state,
    ...(checkoutId ? { checkout_id: checkoutId } : {}),
    ...(stringValue(body.next_action) ? { next_action: stringValue(body.next_action) } : {}),
    ...(state === "requires_user_action" && checkoutUrl ? { checkout_url: checkoutUrl } : {}),
    seller,
    product,
    money,
    ...(stringValue(body.amount_formatted) ? { amount_formatted: stringValue(body.amount_formatted) } : {}),
    ...(numberValue(body.base_usd_minor) !== undefined ? { base_usd_minor: numberValue(body.base_usd_minor) } : {}),
    ...(stringValue(body.offer_option_id) ? { offer_option_id: stringValue(body.offer_option_id) } : {}),
    ...(stringValue(body.quote_expires_at) ? { quote_expires_at: stringValue(body.quote_expires_at) } : {}),
    ...(stringValue(body.expires_at) ? { expires_at: stringValue(body.expires_at) } : {}),
    ...(stringValue(body.created_at) ? { created_at: stringValue(body.created_at) } : {}),
    ...(stringValue(body.updated_at) ? { updated_at: stringValue(body.updated_at) } : {}),
  };
}

const normalizedName = (value: string): string => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

/**
 * Country name in the language of the conversation.
 *
 * The public catalog keeps its own locale contract — it is shared with the storefront and the
 * native clients and must not be widened for a chat surface. But "Türkiye" in a Thai conversation
 * reads as somebody else's product, and the country name is the one string this client can
 * localize on its own: it already knows the ISO code.
 */
export function localizedCountryName(country: { iso: string; name: string }, lang: string): string {
  try {
    const localized = new Intl.DisplayNames([lang], { type: "region" }).of(country.iso);
    if (localized && localized !== country.iso) return localized;
  } catch {
    // Small-ICU runtimes without DisplayNames data: the catalog name beats an invented one.
  }
  return country.name;
}

/**
 * A malformed handle is dropped here rather than sent: the server would ignore it anyway, and a
 * typo in one partner's config must never turn into a failed purchase for their reader.
 */
export function normalizeAttribution(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  return /^(promo|ref):[A-Za-z0-9_-]{3,64}$/.test(raw) ? raw : null;
}

export class RetailApiClient {
  private readonly baseUrl: URL;

  constructor(input: { baseUrl: string; fetch?: FetchLike; timeoutMs?: number; attribution?: string }) {
    this.baseUrl = new URL(input.baseUrl);
    if (!/^https?:$/.test(this.baseUrl.protocol)) throw new Error("LETISIM_API_BASE_URL must be http(s)");
    this.fetchImpl = input.fetch ?? fetch;
    this.timeoutMs = input.timeoutMs ?? 8_000;
    this.attribution = normalizeAttribution(input.attribution);
  }

  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  /**
   * Partner handle of THIS installation (`promo:CODE` or `ref:slug`), taken from process
   * configuration. It is deliberately not a tool argument and not reachable by the model: an
   * agent that read an untrusted page must not be able to redirect somebody else's commission.
   */
  private readonly attribution: string | null;

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const url = new URL(path, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) throw new Error("retail API path escaped configured origin");
    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await this.fetchImpl(url, {
      ...init,
      signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new RetailApiError(typeof body.code === "string" ? body.code : "upstream_unavailable", response.status);
    }
    return body;
  }

  private async resolveDestination(destination: string, lang: string, currency?: string): Promise<CatalogCountry> {
    const countries = await this.countries(lang, currency);
    if (/^[A-Za-z]{2}$/.test(destination.trim())) {
      const iso = destination.trim().toUpperCase();
      const exact = countries.find(country => country.iso === iso);
      if (exact) return exact;
      throw new RetailApiError("destination_not_found", 404);
    }
    const target = normalizedName(destination);
    // Match the catalog name and the localized one: a Thai speaker types "ตุรกี", not "Türkiye",
    // and answering "destination not found" to that is a lost sale.
    const matches = countries.filter(country =>
      normalizedName(country.name) === target || normalizedName(localizedCountryName(country, lang)) === target);
    if (matches.length !== 1) throw new RetailApiError("destination_not_found", 404);
    return matches[0]!;
  }

  private async countries(lang: string, currency?: string): Promise<CatalogCountry[]> {
    const query = new URLSearchParams({
      locale: lang,
      lang,
      platform: "web",
      paymentContract: "pay026",
      include: "daypass",
    });
    if (currency) query.set("currency", currency);
    const body = await this.request(`/api/v1/catalog/countries?${query}`);
    const rows = Array.isArray(body.all) ? body.all : [];
    return rows.flatMap(row => {
      if (!row || typeof row !== "object") return [];
      const value = row as Record<string, unknown>;
      return typeof value.iso === "string" && typeof value.name === "string" && typeof value.flag === "string"
        ? [{ iso: value.iso, name: value.name, flag: value.flag }]
        : [];
    });
  }

  async search(input: {
    destination: string;
    tripDays?: number;
    minDataGb?: number;
    lang?: string;
    currency?: string;
    limit?: number;
  }): Promise<SearchResult> {
    const lang = input.lang ?? "en";
    const destination = await this.resolveDestination(input.destination, lang, input.currency);
    const query = new URLSearchParams({
      locale: lang,
      lang,
      platform: "web",
      paymentContract: "pay026",
      include: "daypass",
    });
    if (input.currency) query.set("currency", input.currency);
    const body = await this.request(`/api/v1/catalog/countries/${encodeURIComponent(destination.iso)}/products?${query}`);
    const country = body.country as Record<string, unknown> | undefined;
    const countryName = localizedCountryName(
      { iso: destination.iso, name: typeof country?.name === "string" ? country.name : destination.name },
      lang,
    );
    const rawProducts = Array.isArray(body.products) ? body.products : [];
    const plans = rawProducts.flatMap(raw => {
      if (!raw || typeof raw !== "object") return [];
      const product = raw as CatalogProduct;
      if (typeof product.id !== "string" || !product.displayMoney || typeof product.displayAmountFormatted !== "string") return [];
      const option = product.offerOptions?.find(candidate => candidate.isDefault) ?? product.offerOptions?.[0] ?? null;
      const money = option?.displayMoney ?? product.displayMoney;
      const amountFormatted = option?.displayAmountFormatted ?? product.displayAmountFormatted;
      if (!money || !Number.isSafeInteger(money.amountMinor) || typeof money.currency !== "string") return [];
      const dataGb = product.isUnlimited ? null : Number(product.dataGb);
      if (input.tripDays != null && Number(product.days) < input.tripDays) return [];
      if (input.minDataGb != null && !product.isUnlimited && (dataGb == null || dataGb < input.minDataGb)) return [];
      return [{
        product_id: product.id,
        offer_option_id: option?.id ?? null,
        country_iso: destination.iso,
        country_name: countryName,
        flag: typeof country?.flag === "string" ? country.flag : destination.flag,
        data_gb: dataGb,
        is_unlimited: Boolean(product.isUnlimited),
        days: Number(product.days),
        package_kind: String(product.packageKind ?? "fixed"),
        daily_gb: product.dailyGb == null ? null : Number(product.dailyGb),
        post_throttle_kbps: product.postThrottleKbps == null ? null : Number(product.postThrottleKbps),
        networks: option?.networks ?? [],
        network_types: option?.networkTypes ?? [],
        validity_starts_at: String(product.validityStartsAt ?? "unknown"),
        activation_window_days: product.activationWindowDays == null ? null : Number(product.activationWindowDays),
        fup_note: typeof product.fupNote === "string" ? product.fupNote : null,
        money,
        amount_formatted: amountFormatted,
      } satisfies RetailPlan];
    }).sort((left, right) => left.money.amountMinor - right.money.amountMinor || left.days - right.days)
      .slice(0, input.limit ?? 10);
    return { destination: { ...destination, name: countryName }, plans };
  }

  async quote(input: { productId: string; offerOptionId?: string; lang?: string; currency?: string }) {
    return projectAgentResponse(await this.request("/api/v1/agent-checkouts/quote", {
      method: "POST",
      body: JSON.stringify({
        productId: input.productId,
        offerOptionId: input.offerOptionId,
        lang: input.lang,
        currency: input.currency,
      }),
    }));
  }

  async createCheckout(input: { productId: string; offerOptionId?: string; lang?: string; currency?: string; requestId: string }) {
    return projectAgentResponse(await this.request("/api/v1/agent-checkouts", {
      method: "POST",
      headers: this.attribution ? { "X-Letisim-Agent-Attribution": this.attribution } : undefined,
      body: JSON.stringify({
        productId: input.productId,
        offerOptionId: input.offerOptionId,
        lang: input.lang,
        currency: input.currency,
        idempotencyKey: input.requestId,
      }),
    }));
  }

  async getCheckout(checkoutId: string) {
    return projectAgentResponse(await this.request(`/api/v1/agent-checkouts/${encodeURIComponent(checkoutId)}`));
  }

  async cancelCheckout(checkoutId: string) {
    return projectAgentResponse(await this.request(`/api/v1/agent-checkouts/${encodeURIComponent(checkoutId)}`, { method: "DELETE" }));
  }
}
