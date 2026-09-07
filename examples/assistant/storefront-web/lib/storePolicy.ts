import policy from "../../data/policies.json";

/** The page and backend quote the same frozen demonstration terms. */
export const STORE_POLICY = {
  currency: policy.terms.currency,
  returnsShort: policy.terms.returns_short,
  returnsLine: policy.terms.returns_line,
  freeShippingThreshold: policy.terms.free_shipping_over,
  standardShippingFee: policy.terms.standard_fee,
  standardShippingEta: policy.terms.standard_eta,
} as const;
