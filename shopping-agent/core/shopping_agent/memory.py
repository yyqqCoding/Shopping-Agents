# Copyright 2026 Anthropic PBC
# SPDX-License-Identifier: Apache-2.0

"""The extraction prompt the shopping runtimes hand to ``commerce_common.memory``: what
the store may remember about one customer between visits."""

from __future__ import annotations

from commerce_common.memory import MEMORY_EXTRACTION_TEMPLATE

SHOPPING_MEMORY_EXTRACTION_PROMPT = MEMORY_EXTRACTION_TEMPLATE.format(
    keeper="a store or service",
    subject="one customer",
    occasions="visits",
    speaker="the customer",
    qualifies=(
        "a preference, a limit, or standing context the customer stated themselves: the "
        "seat or room they ask for, a size, a monthly ceiling for the household's lines, who "
        "usually travels with them, a material they avoid, a maker they keep coming back to."
    ),
    standalone_example=(
        '"under 90 a month" tells a future reader nothing, while "wants the family\'s three '
        'lines to stay under 90 a month in total" tells them everything'
    ),
    live_key_rule=(
        "A temporary task, its budget, dates, recipient and candidate products belong only "
        "to the current conversation, never to a current_project fact. A recipient's "
        "preference is not the customer's own preference. Do not record a fact the customer "
        "asked to forget, even if they repeat it while requesting deletion."
    ),
    excluded=(
        "anything that came from listings, results, or the store's own terms; the mechanics of "
        "this visit (what they searched for or put in the cart); your own guesses; and "
        "health, financial, or identity details, unless the customer asked in so many words "
        "for one to be kept."
    ),
)
