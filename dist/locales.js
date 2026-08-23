/**
 * Conversation languages this server can actually serve end to end.
 *
 * The list is duplicated from `packages/core/src/web-locales.ts` on purpose: this package is meant
 * to be publishable on its own and must not drag the private workspace into an installer's
 * `node_modules`. A parity test keeps the two lists — and the storefront's own `site/locale.js` —
 * from drifting. Nothing may be added here "for later": a locale without a storefront page is a
 * 404 in the payment step.
 */
export const RETAIL_MCP_LANGS = [
    "en", "ru", "es", "pt-BR", "fr", "de", "it", "nl",
    "tr", "ar", "he", "hi", "zh-CN", "ja", "ko", "th",
];
//# sourceMappingURL=locales.js.map