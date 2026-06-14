# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python import
import os
from typing import List, Dict, Tuple

# Third party import
from openai import OpenAI
import requests

from rest_framework import status
from rest_framework.response import Response

# Module import
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectLiteSerializer, WorkspaceLiteSerializer
from plane.db.models import Project, Workspace
from plane.license.utils.instance_value import get_configuration_value
from plane.utils.exception_logger import log_exception

from ..base import BaseAPIView


class LLMProvider:
    """Base class for LLM provider configurations"""

    name: str = ""
    models: List[str] = []
    default_model: str = ""
    requires_api_key: bool = True

    @classmethod
    def get_config(cls) -> Dict[str, str | List[str]]:
        return {
            "name": cls.name,
            "models": cls.models,
            "default_model": cls.default_model,
        }

    @classmethod
    def supports_model(cls, model: str) -> bool:
        return model in cls.models


class OpenAIProvider(LLMProvider):
    name = "OpenAI"
    models = ["gpt-3.5-turbo", "gpt-4o-mini", "gpt-4o", "o1-mini", "o1-preview"]
    default_model = "gpt-4o-mini"


class AnthropicProvider(LLMProvider):
    name = "Anthropic"
    models = [
        "claude-3-5-sonnet-20240620",
        "claude-3-haiku-20240307",
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-2.1",
        "claude-2",
        "claude-instant-1.2",
        "claude-instant-1",
    ]
    default_model = "claude-3-sonnet-20240229"


class GeminiProvider(LLMProvider):
    name = "Gemini"
    models = ["gemini-pro", "gemini-1.5-pro-latest", "gemini-pro-vision"]
    default_model = "gemini-pro"


class GoogleVertexAIProvider(LLMProvider):
    name = "Google Vertex AI"
    models = [
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]
    default_model = "gemini-2.5-flash"
    requires_api_key = False

    @classmethod
    def supports_model(cls, model: str) -> bool:
        return (
            super().supports_model(model)
            or model.startswith("gemini-")
            or model.startswith("publishers/google/models/gemini-")
        )


SUPPORTED_PROVIDERS = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "vertex": GoogleVertexAIProvider,
    "vertexai": GoogleVertexAIProvider,
    "google-vertex": GoogleVertexAIProvider,
    "google_vertex": GoogleVertexAIProvider,
}


def is_vertex_provider(provider: str | None) -> bool:
    return (provider or "").lower() in {"vertex", "vertexai", "google-vertex", "google_vertex"}


def get_vertex_ai_config() -> Tuple[str | None, str | None]:
    """
    Helper to get Vertex AI configuration values, returns:
        - Google Cloud project, Google Cloud location
    """
    project, location = get_configuration_value(
        [
            {
                "key": "LLM_VERTEX_PROJECT",
                "default": os.environ.get("LLM_VERTEX_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT"),
            },
            {
                "key": "LLM_VERTEX_LOCATION",
                "default": os.environ.get("LLM_VERTEX_LOCATION")
                or os.environ.get("GOOGLE_CLOUD_LOCATION")
                or "us-central1",
            },
        ]
    )
    return project or None, location or None


def is_llm_configured(api_key: str | None, model: str | None, provider: str | None) -> bool:
    if not model or not provider:
        return False

    provider_config = SUPPORTED_PROVIDERS.get(provider.lower())
    if not provider_config:
        return False

    if is_vertex_provider(provider):
        project, location = get_vertex_ai_config()
        return bool(project and location)

    return bool(api_key)


def get_llm_config() -> Tuple[str | None, str | None, str | None]:
    """
    Helper to get LLM configuration values, returns:
        - api_key, model, provider
    """
    api_key, provider_key, model = get_configuration_value(
        [
            {
                "key": "LLM_API_KEY",
                "default": os.environ.get("LLM_API_KEY", None),
            },
            {
                "key": "LLM_PROVIDER",
                "default": os.environ.get("LLM_PROVIDER", "vertexai"),
            },
            {
                "key": "LLM_MODEL",
                "default": os.environ.get("LLM_MODEL", None),
            },
        ]
    )

    provider_key = (provider_key or "openai").lower()
    provider = SUPPORTED_PROVIDERS.get(provider_key)
    if not provider:
        log_exception(ValueError(f"Unsupported provider: {provider_key}"))
        return None, None, None

    if provider.requires_api_key and not api_key:
        log_exception(ValueError(f"Missing API key for provider: {provider.name}"))
        return None, None, None

    # If no model specified, use provider's default
    if not model:
        model = provider.default_model

    # Validate model is supported by provider
    if not provider.supports_model(model):
        log_exception(
            ValueError(
                f"Model {model} not supported by {provider.name}. Supported models: {', '.join(provider.models)}"
            )
        )
        return None, None, None

    return api_key, model, provider_key


def get_llm_response(task, prompt, api_key: str, model: str, provider: str) -> Tuple[str | None, str | None]:
    """Helper to get LLM completion response"""
    final_text = task + "\n" + prompt
    try:
        if is_vertex_provider(provider):
            return _get_vertex_llm_response(final_text, model)

        # For Gemini, prepend provider name to model
        if provider.lower() == "gemini":
            model = f"gemini/{model}"

        client = OpenAI(api_key=api_key)
        chat_completion = client.chat.completions.create(
            model=model, messages=[{"role": "user", "content": final_text}]
        )
        text = chat_completion.choices[0].message.content
        return text, None
    except Exception as e:
        log_exception(e)
        error_type = e.__class__.__name__
        if error_type == "AuthenticationError":
            return None, f"Invalid API key for {provider}"
        elif error_type == "RateLimitError":
            return None, f"Rate limit exceeded for {provider}"
        else:
            return None, f"Error occurred while generating response from {provider}"


def _get_vertex_llm_response(final_text: str, model: str) -> Tuple[str | None, str | None]:
    project, location = get_vertex_ai_config()
    if not project or not location:
        return None, "Missing Google Vertex AI project or location"

    try:
        from google import genai
        from google.genai.types import HttpOptions

        client = genai.Client(
            vertexai=True,
            project=project,
            location=location,
            http_options=HttpOptions(api_version="v1"),
        )
        response = client.models.generate_content(
            model=model,
            contents=final_text,
        )
        text = getattr(response, "text", None)
        if text:
            return text, None
        return None, "Google Vertex AI returned an empty response"
    except Exception as e:
        log_exception(e)
        return None, "Error occurred while generating response from Google Vertex AI"


class GPTIntegrationEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        api_key, model, provider = get_llm_config()

        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error = get_llm_response(task, request.data.get("prompt", False), api_key, model, provider)
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        workspace = Workspace.objects.get(slug=slug)
        project = Project.objects.get(pk=project_id)

        return Response(
            {
                "response": text,
                "response_html": text.replace("\n", "<br/>"),
                "project_detail": ProjectLiteSerializer(project).data,
                "workspace_detail": WorkspaceLiteSerializer(workspace).data,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceGPTIntegrationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        api_key, model, provider = get_llm_config()

        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task", False)
        if not task:
            return Response({"error": "Task is required"}, status=status.HTTP_400_BAD_REQUEST)

        text, error = get_llm_response(task, request.data.get("prompt", False), api_key, model, provider)
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "response": text,
                "response_html": text.replace("\n", "<br/>"),
            },
            status=status.HTTP_200_OK,
        )


class UnsplashEndpoint(BaseAPIView):
    def get(self, request):
        (UNSPLASH_ACCESS_KEY,) = get_configuration_value(
            [
                {
                    "key": "UNSPLASH_ACCESS_KEY",
                    "default": os.environ.get("UNSPLASH_ACCESS_KEY"),
                }
            ]
        )
        # Check unsplash access key
        if not UNSPLASH_ACCESS_KEY:
            return Response([], status=status.HTTP_200_OK)

        # Query parameters
        query = request.GET.get("query", False)
        page = request.GET.get("page", 1)
        per_page = request.GET.get("per_page", 20)

        url = (
            f"https://api.unsplash.com/search/photos/?client_id={UNSPLASH_ACCESS_KEY}&query={query}&page=${page}&per_page={per_page}"
            if query
            else f"https://api.unsplash.com/photos/?client_id={UNSPLASH_ACCESS_KEY}&page={page}&per_page={per_page}"
        )

        headers = {"Content-Type": "application/json"}

        resp = requests.get(url=url, headers=headers)
        return Response(resp.json(), status=resp.status_code)
