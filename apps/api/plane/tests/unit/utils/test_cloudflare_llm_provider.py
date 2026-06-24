# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from plane.app.views.external import base


def test_get_llm_response__given_cloudflare_provider__then_calls_workers_ai(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"result": {"choices": [{"message": {"content": "Cloudflare answer"}}]}}

    def post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return Response()

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "account-123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "env-token")
    monkeypatch.setattr(base.requests, "post", post)

    text, error = base.get_llm_response(
        task="Summarize this issue",
        prompt="You are a product assistant",
        api_key="request-token",
        model="@cf/zai-org/glm-5.2",
        provider="cloudflare",
    )

    assert text == "Cloudflare answer"
    assert error is None
    assert captured["url"] == (
        "https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/"
        "@cf/zai-org/glm-5.2"
    )
    assert captured["headers"] == {"Authorization": "Bearer request-token"}
    assert captured["json"] == {
        "messages": [
            {"role": "system", "content": "You are a product assistant"},
            {"role": "user", "content": "Summarize this issue"},
        ]
    }
    assert captured["timeout"] == 30


def test_get_llm_response__given_cloudflare_empty_response__then_returns_error(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"result": {}}

    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "account-123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "env-token")
    monkeypatch.setattr(base.requests, "post", lambda *args, **kwargs: Response())

    text, error = base.get_llm_response(
        task="Summarize this issue",
        prompt="You are a product assistant",
        api_key="",
        model="@cf/zai-org/glm-5.2",
        provider="cloudflare",
    )

    assert text is None
    assert error == "Cloudflare Workers AI returned no response"


def test_is_llm_configured__given_cloudflare_env_token__then_returns_true(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "account-123")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "env-token")

    assert base.is_llm_configured(
        api_key=None,
        model="@cf/zai-org/glm-5.2",
        provider="cloudflare",
    )
