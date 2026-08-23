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
    destination: {
        iso: string;
        name: string;
        flag: string;
    };
    plans: RetailPlan[];
};
export declare class RetailApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, status: number);
}
type FetchLike = typeof fetch;
/**
 * Country name in the language of the conversation.
 *
 * The public catalog keeps its own locale contract — it is shared with the storefront and the
 * native clients and must not be widened for a chat surface. But "Türkiye" in a Thai conversation
 * reads as somebody else's product, and the country name is the one string this client can
 * localize on its own: it already knows the ISO code.
 */
export declare function localizedCountryName(country: {
    iso: string;
    name: string;
}, lang: string): string;
/**
 * A malformed handle is dropped here rather than sent: the server would ignore it anyway, and a
 * typo in one partner's config must never turn into a failed purchase for their reader.
 */
export declare function normalizeAttribution(value: string | null | undefined): string | null;
export declare class RetailApiClient {
    private readonly baseUrl;
    constructor(input: {
        baseUrl: string;
        fetch?: FetchLike;
        timeoutMs?: number;
        attribution?: string;
    });
    private readonly fetchImpl;
    private readonly timeoutMs;
    /**
     * Partner handle of THIS installation (`promo:CODE` or `ref:slug`), taken from process
     * configuration. It is deliberately not a tool argument and not reachable by the model: an
     * agent that read an untrusted page must not be able to redirect somebody else's commission.
     */
    private readonly attribution;
    private request;
    private resolveDestination;
    private countries;
    search(input: {
        destination: string;
        tripDays?: number;
        minDataGb?: number;
        lang?: string;
        currency?: string;
        limit?: number;
    }): Promise<SearchResult>;
    quote(input: {
        productId: string;
        offerOptionId?: string;
        lang?: string;
        currency?: string;
    }): Promise<Record<string, unknown>>;
    createCheckout(input: {
        productId: string;
        offerOptionId?: string;
        lang?: string;
        currency?: string;
        requestId: string;
    }): Promise<Record<string, unknown>>;
    getCheckout(checkoutId: string): Promise<Record<string, unknown>>;
    cancelCheckout(checkoutId: string): Promise<Record<string, unknown>>;
}
export {};
