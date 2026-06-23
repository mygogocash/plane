# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import math
import os

# Third party imports
import requests

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import IssueEmbedding


DEFAULT_ISSUE_EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5"
DEFAULT_ISSUE_EMBEDDING_PROVIDER = "cloudflare"
DEFAULT_ISSUE_EMBEDDING_TIMEOUT = 10


def issue_embeddings_enabled():
    return os.environ.get("WORKSPACE_AI_EMBEDDINGS_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"}


def get_issue_embedding_model_name():
    return (
        os.environ.get("WORKSPACE_AI_EMBEDDING_MODEL", DEFAULT_ISSUE_EMBEDDING_MODEL).strip()
        or DEFAULT_ISSUE_EMBEDDING_MODEL
    )


def issue_embedding_model():
    return os.environ.get("WORKSPACE_AI_EMBEDDING_MODEL", DEFAULT_ISSUE_EMBEDDING_MODEL)


def issue_embedding_timeout():
    try:
        return int(os.environ.get("WORKSPACE_AI_EMBEDDING_TIMEOUT", DEFAULT_ISSUE_EMBEDDING_TIMEOUT))
    except (TypeError, ValueError):
        return DEFAULT_ISSUE_EMBEDDING_TIMEOUT


def get_issue_embedding_provider():
    provider = os.environ.get("WORKSPACE_AI_EMBEDDING_PROVIDER", DEFAULT_ISSUE_EMBEDDING_PROVIDER).strip().lower()
    if provider not in {"cloudflare", "cloudflare-workers-ai", "workers-ai"}:
        return None

    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    if not account_id or not api_token:
        return None

    model = issue_embedding_model()
    timeout = issue_embedding_timeout()
    endpoint = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    pooling = os.environ.get("WORKSPACE_AI_EMBEDDING_POOLING", "").strip()

    def cloudflare_embedding_provider(text):
        payload = {"text": [text]}
        if pooling:
            payload["pooling"] = pooling

        response = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_token}"},
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        result = response.json().get("result", {})
        embeddings = result.get("data") or []
        if not embeddings:
            raise ValueError("Cloudflare Workers AI returned no embeddings")
        return embeddings[0]

    return cloudflare_embedding_provider


def build_issue_embedding_text(issue):
    parts = [
        getattr(issue, "name", "") or "",
        getattr(issue, "description_stripped", "") or "",
        getattr(issue, "description_html", "") or "",
    ]
    return "\n".join(part.strip() for part in parts if part and part.strip())


def issue_embedding_content_hash(issue):
    return hashlib.sha256(build_issue_embedding_text(issue).encode("utf-8")).hexdigest()


def cosine_similarity(left, right):
    if not left or not right or len(left) != len(right):
        return 0

    dot_product = sum(float(left_value) * float(right_value) for left_value, right_value in zip(left, right))
    left_norm = math.sqrt(sum(float(value) * float(value) for value in left))
    right_norm = math.sqrt(sum(float(value) * float(value) for value in right))
    if not left_norm or not right_norm:
        return 0

    return dot_product / (left_norm * right_norm)


def rank_issue_embeddings(query_text, issues, provider=None, model_name=None, limit=5):
    if not issue_embeddings_enabled() or provider is None:
        return None

    try:
        query_embedding = provider(query_text)
    except Exception:
        return None

    if not query_embedding:
        return None

    issue_by_id = {issue.id: issue for issue in issues}
    if not issue_by_id:
        return None

    ranked_embeddings = []
    embedding_rows = IssueEmbedding.objects.filter(
        issue_id__in=issue_by_id.keys(),
        model_name=model_name or get_issue_embedding_model_name(),
        status="ready",
        deleted_at__isnull=True,
    )

    for embedding_row in embedding_rows:
        score = cosine_similarity(query_embedding, embedding_row.embedding)
        if score > 0:
            ranked_embeddings.append((issue_by_id[embedding_row.issue_id], score))

    if not ranked_embeddings:
        return None

    ranked_embeddings.sort(key=lambda row: row[1], reverse=True)
    return ranked_embeddings[:limit]


def upsert_issue_embedding(issue, provider=None, model_name=None, provider_name=""):
    if not issue_embeddings_enabled() or provider is None:
        return None

    model_name = model_name or get_issue_embedding_model_name()
    content_hash = issue_embedding_content_hash(issue)
    existing_embedding = IssueEmbedding.objects.filter(
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        model_name=model_name,
        deleted_at__isnull=True,
    ).first()

    if existing_embedding and existing_embedding.content_hash == content_hash and existing_embedding.status == "ready":
        return existing_embedding

    try:
        vector = provider(build_issue_embedding_text(issue))
    except Exception:
        return None

    if not vector:
        return None

    embedding, _ = IssueEmbedding.objects.update_or_create(
        workspace=issue.workspace,
        project=issue.project,
        issue=issue,
        model_name=model_name,
        defaults={
            "content_hash": content_hash,
            "provider": provider_name,
            "embedding": list(vector),
            "status": "ready",
            "error_message": "",
            "embedded_at": timezone.now(),
        },
    )
    return embedding
