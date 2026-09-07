"""Small bilingual keyword tokenizer for catalog, policies and personal facts."""

import re
import unicodedata

_WORDS = re.compile(r"[a-z0-9]+|[\u3400-\u9fff]+")


def keyword_terms(text: str) -> list[str]:
    terms = []
    for word in _WORDS.findall(unicodedata.normalize("NFKC", text).lower()):
        terms.append(word)
        if len(word) > 2 and "\u3400" <= word[0] <= "\u9fff":
            terms.extend(word[index : index + 2] for index in range(len(word) - 1))
    return list(dict.fromkeys(terms))
