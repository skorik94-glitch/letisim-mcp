export class RetailApiError extends Error {
    code;
    status;
    constructor(code, status) {
        super(code);
        this.code = code;
        this.status = status;
        this.name = "RetailApiError";
    }
}
const stringValue = (value) => typeof value === "string" ? value : undefined;
const numberValue = (value) => Number.isFinite(value) ? Number(value) : undefined;
const nullableNumber = (value) => value === null ? null : numberValue(value);
const stringArray = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
function safeMoney(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const row = value;
    const amountMinor = numberValue(row.amountMinor);
    const currency = stringValue(row.currency);
    const exponent = numberValue(row.exponent);
    return Number.isSafeInteger(amountMinor) && currency && Number.isSafeInteger(exponent)
        ? { amountMinor: amountMinor, currency, exponent: exponent }
        : undefined;
}
function safeSeller(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const row = value;
    const legalName = stringValue(row.legalName);
    const country = stringValue(row.country);
    return legalName && country ? { legalName, country } : undefined;
}
function safeAgentProduct(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const row = value;
    const id = stringValue(row.id);
    const countryIso = stringValue(row.countryIso);
    if (!id || !countryIso)
        return undefined;
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
        ...(row.fupNote === null || stringValue(row.fupNote) ? { fupNote: row.fupNote } : {}),
    };
}
function safeCheckoutUrl(value) {
    if (typeof value !== "string")
        return undefined;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && (url.hostname === "letisim.com" || url.hostname.endsWith(".letisim.com"))
            ? url.toString()
            : undefined;
    }
    catch {
        return undefined;
    }
}
function projectAgentResponse(body) {
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
const normalizedName = (value) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
/**
 * Country name in the language of the conversation.
 *
 * The public catalog keeps its own locale contract — it is shared with the storefront and the
 * native clients and must not be widened for a chat surface. But "Türkiye" in a Thai conversation
 * reads as somebody else's product, and the country name is the one string this client can
 * localize on its own: it already knows the ISO code.
 */
export function localizedCountryName(country, lang) {
    try {
        const localized = new Intl.DisplayNames([lang], { type: "region" }).of(country.iso);
        if (localized && localized !== country.iso)
            return localized;
    }
    catch {
        // Small-ICU runtimes without DisplayNames data: the catalog name beats an invented one.
    }
    return country.name;
}
/**
 * A malformed handle is dropped here rather than sent: the server would ignore it anyway, and a
 * typo in one partner's config must never turn into a failed purchase for their reader.
 */
export function normalizeAttribution(value) {
    const raw = String(value ?? "").trim();
    return /^(promo|ref):[A-Za-z0-9_-]{3,64}$/.test(raw) ? raw : null;
}
export class RetailApiClient {
    baseUrl;
    constructor(input) {
        this.baseUrl = new URL(input.baseUrl);
        if (!/^https?:$/.test(this.baseUrl.protocol))
            throw new Error("LETISIM_API_BASE_URL must be http(s)");
        this.fetchImpl = input.fetch ?? fetch;
        this.timeoutMs = input.timeoutMs ?? 8_000;
        this.attribution = normalizeAttribution(input.attribution);
    }
    fetchImpl;
    timeoutMs;
    /**
     * Partner handle of THIS installation (`promo:CODE` or `ref:slug`), taken from process
     * configuration. It is deliberately not a tool argument and not reachable by the model: an
     * agent that read an untrusted page must not be able to redirect somebody else's commission.
     */
    attribution;
    async request(path, init = {}) {
        const url = new URL(path, this.baseUrl);
        if (url.origin !== this.baseUrl.origin)
            throw new Error("retail API path escaped configured origin");
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
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new RetailApiError(typeof body.code === "string" ? body.code : "upstream_unavailable", response.status);
        }
        return body;
    }
    async resolveDestination(destination, lang, currency) {
        const countries = await this.countries(lang, currency);
        if (/^[A-Za-z]{2}$/.test(destination.trim())) {
            const iso = destination.trim().toUpperCase();
            const exact = countries.find(country => country.iso === iso);
            if (exact)
                return exact;
            throw new RetailApiError("destination_not_found", 404);
        }
        const target = normalizedName(destination);
        // Match the catalog name and the localized one: a Thai speaker types "ตุรกี", not "Türkiye",
        // and answering "destination not found" to that is a lost sale.
        const matches = countries.filter(country => normalizedName(country.name) === target || normalizedName(localizedCountryName(country, lang)) === target);
        if (matches.length !== 1)
            throw new RetailApiError("destination_not_found", 404);
        return matches[0];
    }
    async countries(lang, currency) {
        const query = new URLSearchParams({
            locale: lang,
            lang,
            platform: "web",
            paymentContract: "pay026",
            include: "daypass",
        });
        if (currency)
            query.set("currency", currency);
        const body = await this.request(`/api/v1/catalog/countries?${query}`);
        const rows = Array.isArray(body.all) ? body.all : [];
        return rows.flatMap(row => {
            if (!row || typeof row !== "object")
                return [];
            const value = row;
            return typeof value.iso === "string" && typeof value.name === "string" && typeof value.flag === "string"
                ? [{ iso: value.iso, name: value.name, flag: value.flag }]
                : [];
        });
    }
    async search(input) {
        const lang = input.lang ?? "en";
        const destination = await this.resolveDestination(input.destination, lang, input.currency);
        const query = new URLSearchParams({
            locale: lang,
            lang,
            platform: "web",
            paymentContract: "pay026",
            include: "daypass",
        });
        if (input.currency)
            query.set("currency", input.currency);
        const body = await this.request(`/api/v1/catalog/countries/${encodeURIComponent(destination.iso)}/products?${query}`);
        const country = body.country;
        const countryName = localizedCountryName({ iso: destination.iso, name: typeof country?.name === "string" ? country.name : destination.name }, lang);
        const rawProducts = Array.isArray(body.products) ? body.products : [];
        const plans = rawProducts.flatMap(raw => {
            if (!raw || typeof raw !== "object")
                return [];
            const product = raw;
            if (typeof product.id !== "string" || !product.displayMoney || typeof product.displayAmountFormatted !== "string")
                return [];
            const option = product.offerOptions?.find(candidate => candidate.isDefault) ?? product.offerOptions?.[0] ?? null;
            const money = option?.displayMoney ?? product.displayMoney;
            const amountFormatted = option?.displayAmountFormatted ?? product.displayAmountFormatted;
            if (!money || !Number.isSafeInteger(money.amountMinor) || typeof money.currency !== "string")
                return [];
            const dataGb = product.isUnlimited ? null : Number(product.dataGb);
            if (input.tripDays != null && Number(product.days) < input.tripDays)
                return [];
            if (input.minDataGb != null && !product.isUnlimited && (dataGb == null || dataGb < input.minDataGb))
                return [];
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
                }];
        }).sort((left, right) => left.money.amountMinor - right.money.amountMinor || left.days - right.days)
            .slice(0, input.limit ?? 10);
        return { destination: { ...destination, name: countryName }, plans };
    }
    async quote(input) {
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
    async createCheckout(input) {
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
    async getCheckout(checkoutId) {
        return projectAgentResponse(await this.request(`/api/v1/agent-checkouts/${encodeURIComponent(checkoutId)}`));
    }
    async cancelCheckout(checkoutId) {
        return projectAgentResponse(await this.request(`/api/v1/agent-checkouts/${encodeURIComponent(checkoutId)}`, { method: "DELETE" }));
    }
}
//# sourceMappingURL=client.js.map