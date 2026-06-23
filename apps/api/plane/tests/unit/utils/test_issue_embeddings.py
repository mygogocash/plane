# Python imports
import pytest

# Module imports
from plane.db.models import Issue, IssueEmbedding, Project, State
from plane.utils.issue_embeddings import (
    cosine_similarity,
    get_issue_embedding_provider,
    issue_embedding_content_hash,
    rank_issue_embeddings,
    upsert_issue_embedding,
)


@pytest.fixture
def embedding_project(workspace, create_user):
    return Project.objects.create(
        name="Embedding Project",
        identifier="EMB",
        workspace=workspace,
        created_by=create_user,
    )


@pytest.fixture
def embedding_state(embedding_project):
    return State.objects.create(
        name="Triage",
        color="#4E5355",
        project=embedding_project,
    )


@pytest.fixture
def embedding_issue(embedding_project, embedding_state, create_user):
    return Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Checkout payment fails",
        description_html="<p>Card decline message is unclear.</p>",
        created_by=create_user,
    )


@pytest.mark.django_db
def test_upsert_issue_embedding__given_disabled_flag__then_noops(monkeypatch, embedding_issue):
    monkeypatch.delenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", raising=False)

    assert upsert_issue_embedding(embedding_issue, provider=lambda _: [0.1, 0.2]) is None
    assert IssueEmbedding.objects.count() == 0


@pytest.mark.django_db
def test_upsert_issue_embedding__given_provider__then_stores_embedding(monkeypatch, embedding_issue):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")

    embedding = upsert_issue_embedding(
        embedding_issue,
        provider=lambda text: [float(len(text)), 0.25],
        model_name="test-embedding-model",
        provider_name="test-provider",
    )

    assert embedding is not None
    assert embedding.workspace_id == embedding_issue.workspace_id
    assert embedding.project_id == embedding_issue.project_id
    assert embedding.issue_id == embedding_issue.id
    assert embedding.model_name == "test-embedding-model"
    assert embedding.provider == "test-provider"
    assert embedding.embedding[1] == 0.25
    assert embedding.content_hash == issue_embedding_content_hash(embedding_issue)
    assert embedding.status == "ready"


@pytest.mark.django_db
def test_upsert_issue_embedding__given_same_content_hash__then_reuses_ready_embedding(monkeypatch, embedding_issue):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    calls = []

    def provider(text):
        calls.append(text)
        return [1.0, 2.0]

    first = upsert_issue_embedding(embedding_issue, provider=provider, model_name="test-embedding-model")
    second = upsert_issue_embedding(embedding_issue, provider=provider, model_name="test-embedding-model")

    assert first.id == second.id
    assert len(calls) == 1
    assert IssueEmbedding.objects.count() == 1


@pytest.mark.django_db
def test_upsert_issue_embedding__given_provider_failure__then_preserves_existing_embedding(monkeypatch, embedding_issue):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    existing = upsert_issue_embedding(embedding_issue, provider=lambda _: [1.0, 2.0], model_name="test-embedding-model")
    embedding_issue.name = "Checkout payment fails after retry"
    embedding_issue.save(update_fields=["name"])

    def failing_provider(_text):
        raise RuntimeError("provider unavailable")

    result = upsert_issue_embedding(embedding_issue, provider=failing_provider, model_name="test-embedding-model")
    existing.refresh_from_db()

    assert result is None
    assert existing.embedding == [1.0, 2.0]
    assert existing.content_hash != issue_embedding_content_hash(embedding_issue)
    assert existing.status == "ready"


def test_cosine_similarity__given_vector_mismatch__then_returns_zero():
    assert cosine_similarity([], [1.0]) == 0
    assert cosine_similarity([1.0, 2.0], [1.0]) == 0
    assert cosine_similarity([0.0, 0.0], [1.0, 2.0]) == 0


@pytest.mark.django_db
def test_rank_issue_embeddings__given_disabled_flag__then_returns_none(monkeypatch, embedding_issue):
    monkeypatch.delenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", raising=False)

    assert rank_issue_embeddings("checkout payment", [embedding_issue], provider=lambda _: [1.0, 0.0]) is None


@pytest.mark.django_db
def test_rank_issue_embeddings__given_ready_embeddings__then_ranks_by_cosine(monkeypatch, embedding_issue, embedding_project, embedding_state, create_user):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDINGS_ENABLED", "1")
    other_issue = Issue.objects.create(
        project=embedding_project,
        state=embedding_state,
        name="Login page polish",
        created_by=create_user,
    )
    IssueEmbedding.objects.create(
        workspace=embedding_issue.workspace,
        project=embedding_project,
        issue=embedding_issue,
        model_name="test-embedding-model",
        content_hash=issue_embedding_content_hash(embedding_issue),
        embedding=[1.0, 0.0],
    )
    IssueEmbedding.objects.create(
        workspace=other_issue.workspace,
        project=embedding_project,
        issue=other_issue,
        model_name="test-embedding-model",
        content_hash=issue_embedding_content_hash(other_issue),
        embedding=[0.1, 0.9],
    )

    ranked_issues = rank_issue_embeddings(
        "checkout payment",
        [other_issue, embedding_issue],
        provider=lambda _: [1.0, 0.0],
        model_name="test-embedding-model",
    )

    assert ranked_issues is not None
    assert [issue.id for issue, _score in ranked_issues] == [embedding_issue.id, other_issue.id]


def test_get_issue_embedding_provider__given_missing_cloudflare_config__then_returns_none(monkeypatch):
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDING_PROVIDER", "cloudflare")
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)
    monkeypatch.delenv("CLOUDFLARE_API_TOKEN", raising=False)

    assert get_issue_embedding_provider() is None


def test_get_issue_embedding_provider__given_cloudflare_config__then_calls_workers_ai(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"result": {"data": [[0.25, 0.75]]}}

    def post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return Response()

    monkeypatch.setenv("WORKSPACE_AI_EMBEDDING_PROVIDER", "cloudflare")
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDING_MODEL", "@cf/baai/bge-base-en-v1.5")
    monkeypatch.setenv("WORKSPACE_AI_EMBEDDING_TIMEOUT", "7")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "account-123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "token-abc")
    monkeypatch.setattr("plane.utils.issue_embeddings.requests.post", post)

    provider = get_issue_embedding_provider()

    assert provider is not None
    assert provider("Refund workflow is unclear") == [0.25, 0.75]
    assert captured["url"] == (
        "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/"
        "@cf/baai/bge-base-en-v1.5"
    )
    assert captured["headers"] == {"Authorization": "Bearer token-abc"}
    assert captured["json"] == {"text": ["Refund workflow is unclear"]}
    assert captured["timeout"] == 7


def test_get_issue_embedding_provider__given_cloudflare_empty_response__then_raises(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"result": {"data": []}}

    monkeypatch.setenv("WORKSPACE_AI_EMBEDDING_PROVIDER", "cloudflare")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "account-123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "token-abc")
    monkeypatch.setattr(
        "plane.utils.issue_embeddings.requests.post",
        lambda *args, **kwargs: Response(),
    )

    provider = get_issue_embedding_provider()

    assert provider is not None
    with pytest.raises(ValueError, match="returned no embeddings"):
        provider("Refund workflow is unclear")
