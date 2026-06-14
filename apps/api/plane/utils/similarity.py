# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re
from collections.abc import Iterable, Mapping
from typing import Any


MIN_SIMILARITY_TITLE_LENGTH = 4
MIN_SIMILARITY_CONFIDENCE = 0.05

_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "for",
    "in",
    "is",
    "of",
    "on",
    "the",
    "to",
    "with",
}


def _normalize(value: str) -> str:
    return " ".join(_TOKEN_PATTERN.findall(value.lower()))


def _tokenize(value: str) -> set[str]:
    return {token for token in _TOKEN_PATTERN.findall(value.lower()) if token not in _STOP_WORDS}


def _trigrams(value: str) -> set[str]:
    normalized = _normalize(value).replace(" ", "")
    if len(normalized) < 3:
        return set()
    return {normalized[index : index + 3] for index in range(len(normalized) - 2)}


def _dice_score(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0
    return (2 * len(left & right)) / (len(left) + len(right))


def _item_value(item: Mapping[str, Any], key: str) -> Any:
    return item[key]


def rank_similar_items(
    title: str | None,
    candidates: Iterable[Mapping[str, Any]],
    *,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Return candidate items ranked by deterministic title similarity."""

    query = (title or "").strip()
    if len(_normalize(query)) < MIN_SIMILARITY_TITLE_LENGTH:
        return []

    query_tokens = _tokenize(query)
    query_trigrams = _trigrams(query)
    scored_items = []

    for position, candidate in enumerate(candidates):
        candidate_name = str(_item_value(candidate, "name") or "")
        token_score = _dice_score(query_tokens, _tokenize(candidate_name))
        trigram_score = _dice_score(query_trigrams, _trigrams(candidate_name))
        confidence = round((token_score * 0.7) + (trigram_score * 0.3), 4)
        if confidence < MIN_SIMILARITY_CONFIDENCE:
            continue

        scored_items.append(
            {
                "id": str(_item_value(candidate, "id")),
                "name": candidate_name,
                "confidence": confidence,
                "_position": position,
            }
        )

    scored_items.sort(key=lambda item: (-item["confidence"], item["_position"]))
    ranked_items = [{key: value for key, value in item.items() if key != "_position"} for item in scored_items]
    return ranked_items[:limit] if limit else ranked_items
