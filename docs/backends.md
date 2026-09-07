# Backends: mapping your systems

`StorefrontBackend` translates your systems into the records the agent reads. This guide
covers identity and credentials, ordered flows, checkout, and products with options. The
method docstrings in `shopping_agent/backend.py` and `shopping_agent/types.py` are the
contract. The assistant example shows all of it running.

## Step 1: Decide who the caller is and how you authenticate

**Bind identity at session start.** Your host authenticates the caller and starts a session
with the customer id it resolved. Every backend method receives that session object and
reads the identity from it. No route and no tool argument ever carries a user id.

**Keep the credential beside the identity.** Whatever your backend needs to call your
platform for that customer lives with the session, never with the model:

- A per-customer token: put it on a subclass of the session context, or in a store your host
  fills at sign-in and the backend reads by customer id.
- A service credential: pass it to the backend's constructor.

**Treat a guest as a principal.** Mark the session as a guest. When a read needs an account
(order history, saved addresses), raise an exception your executor subclass turns into "ask
the customer to sign in". When the guest signs in, start a new session. The Chinese demo
uses verified Supabase anonymous users with no account UI; unowned orders stay unavailable.
`examples/demo_common/experience.py` checks ownership on every private request, not only
when the conversation starts. The older profile-based host is for local integrations only.

## Step 2: Keep multi-step flows in order

Some flows only make sense in sequence: verify identity, then check eligibility, then
submit. The backend enforces that order.

1. Keep the flow's state in the backend, keyed by session.
2. When a call arrives before the step it depends on, raise your own exception class.
3. Map that class in an executor subclass (`domain_error`) so the tool result names the
   missing step instead of reading as a system failure. The model then tells the customer
   what comes first.
4. For a write your platform deduplicates, derive an idempotency key from the session id
   and a hash of the cart lines.
5. When the customer completes a step outside the conversation (a payment page, a
   verification code), have the host queue an app event on the session; the next turn reads
   it.

## Step 3: Decide how checkout completes

The `checkout` tool ends the agent's part: it renders the cart. Nothing in this repo places
an order or takes payment. Pick one of three handoffs for the checkout card:

| Your situation | What the card does | What you implement |
|---|---|---|
| Checkout is a route in your own app | Links to that route | Nothing; the default applies |
| Platform hosted checkout (the cart API cannot take payment server-side) | Opens the platform's hosted checkout URL | `checkout_handoff` returns the URL for this cart |
| Marketplace where each seller checks out separately | Shows one link per seller | `checkout_handoff` returns one entry per seller |

The executor adds what `checkout_handoff` returns to the card's payload after the model's
call, so the URL never passes through the model. The demo card links only `https` URLs.
When payment completes, queue an app event so the next turn knows.

## Step 4: Map products with options

A product record is one of three shapes:

| Shape | How to recognize it | What the agent does with it |
|---|---|---|
| Plain | No options | Search returns it; the cart takes its id |
| Family | Has `options`, e.g. size: twin, queen, king | Search returns it; details list its variants. Cart writes need a variant id |
| Variant | Has `option_values` (one value per option) and `variant_of` (the family's id) | Returned inside its family's details with its own id, price, and stock; the cart takes its id |

A variant's id goes wherever a product id goes; there is no separate variant-id field.
Family and variant ids share one namespace, so if a parent's platform id can equal a
child's, prefix the family id in your backend. Search matches option values as well as
attributes, so a filter like size = king works. A backend that has already resolved every
option from the query may return the variant from search; otherwise search returns
families.

**Mapping from common catalog models.**

| Your catalog | Family | Variant | Plain |
|---|---|---|---|
| Parent and child records; the parent is not purchasable | The parent: its id, content, and variation attributes as options | Each child: id, price, stock, option values, parent id | A standalone product |
| Every row is a purchasable SKU; siblings share a group key (a shopping feed) | Synthesized: a prefixed group key as the id, the first row's title and image, options collected from the rows; details resolve that id | Each row, with the synthesized id as its family | A row with no group |
| A product shell that always has variants; price and stock only on variants | The product: id, content, option names and values | Each variant | A one-variant product, served under the variant's id with no options |

```text
your platform                              this record
product  P-88  "Trail Tee"                 {"product_id": "P-88", "title": "Trail Tee", "price": 24.0,
  option  size: S M L                       "options": {"size": ["S", "M", "L"]}}
  variant V-1  S  24.00  12 in stock       details.variants[0] = {"product_id": "V-1", "price": 24.0,
  variant V-2  M  24.00   0 in stock         "in_stock": true, "option_values": {"size": "S"},
  variant V-3  L  26.00   4 in stock         "variant_of": "P-88"}  … and V-2, V-3
```

**What is not a variant.**

- A price or availability computed per request (a nightly rate for searched dates, a fare
  for a party size, a seat). The request's dimensions arrive as search filters and the
  record returned is a quote for that context.
- Siblings that differ in more than their option values (ticket tiers with their own
  sections and fees; plan tiers with their own allowances). Keep them as separate records
  grouped by an attribute.
- One product sold by several sellers at different prices. A record has one price: return
  the offer you would sell, or list each offer as its own record.
- Built-to-order products, bundles, and menu items with modifiers. The choices travel as
  request attributes or in your own cart extension, and the backend prices them.
- Goods priced by measured weight. Quantity counts whole units, so sell them as fixed packs,
  which may themselves be variants.

**A family's own figures.**

- Storefront price is the lowest in-stock variant's (a "from" price); a family is in stock
  while any variant is.
- Title, description, and image describe the family. A variant may override any field it
  inherits (a color with its own image). Inside the family's details each variant is a
  compact row: id, option values, price, stock, and only the fields that differ.
- Only the variants listed exist. If the king/blush row is absent, the product is not sold in
  king/blush; the agent says so and offers the nearest listed variant.

**How many variants.** Details return every variant of a family inside one fenced result,
capped at `max_fenced_chars` (12,000 characters by default). A compact row is 70 to 120
characters, so a family holds up to about sixty variants. Serve a larger matrix as one
family per leading option: a shoe in eight colors and fourteen sizes becomes eight families
of fourteen. Past the cap the result is cut short with no error, so check your largest
family against it.

**Out of stock.** When `add_to_cart` names a variant that exists but cannot be bought, raise
`Unavailable` with a message of ids only: what is out, and which sibling variants are in
stock. The executor relays it and nothing is written; the demo's mock backend does this.
Use `NotOffered` and the `enable_*` switches for things the store does not sell at all.

## Where to see it in the demo

- The catalog (`examples/assistant/data/catalog.json`): a mattress by size (one size out of
  stock, prices that step), a pillowcase set by size and color (one combination out of
  stock), a tinted moisturizer in six shades at one price, and a weighted blanket whose
  description states the rule for choosing a weight.
- Fixtures author variants compactly under their family; the loader in
  `demo_common/storefront_fixtures.py` fills in the rest and derives the options. The wire
  shape is what the details tool returns.
