# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
import pytest

# Module imports
from plane.utils.similarity import rank_similar_items


@pytest.mark.unit
class TestSimilarityScoring:
    def test_similarity_scoring_ranks_open_issues_by_confidence(self):
        results = rank_similar_items(
            "Checkout payment fails on mobile",
            [
                {"id": "less-related", "name": "Mobile layout overflows on dashboard"},
                {"id": "best-match", "name": "Checkout payment fails for mobile cards"},
                {"id": "weak-match", "name": "Invite email delivery delayed"},
            ],
        )

        assert [result["id"] for result in results] == ["best-match", "less-related"]
        assert all(0 <= result["confidence"] <= 1 for result in results)
        assert results[0]["confidence"] > results[1]["confidence"]

    def test_short_title_returns_empty_results(self):
        results = rank_similar_items("bug", [{"id": "candidate", "name": "Bug report flow fails"}])

        assert results == []
