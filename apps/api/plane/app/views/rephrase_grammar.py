# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.external.base import get_llm_config, get_llm_response, is_llm_configured

from .base import BaseAPIView

TRANSLATE_TASK = "translate"
REPHRASE_TASK = "ASK_ANYTHING"


class RephraseGrammarSerializer(serializers.Serializer):
    task = serializers.CharField()
    text_input = serializers.CharField(required=False, allow_blank=True, default="")
    casual_score = serializers.IntegerField(required=False, min_value=0, max_value=10, default=5)
    formal_score = serializers.IntegerField(required=False, min_value=0, max_value=10, default=5)
    target_language = serializers.CharField(required=False, allow_blank=True, default="")


def build_rephrase_prompt(text_input: str, casual_score: int, formal_score: int) -> str:
    return (
        "Rewrite the following text.\n"
        f"Casual tone score: {casual_score}/10\n"
        f"Formal tone score: {formal_score}/10\n"
        f"Text:\n{text_input}\n"
        "Return only the rewritten text."
    )


def build_translate_prompt(text_input: str, target_language: str) -> str:
    return (
        f"Translate the following text to {target_language}.\n"
        f"Text:\n{text_input}\n"
        "Return only the translation."
    )


class RephraseGrammarEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        serializer = RephraseGrammarSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        task = serializer.validated_data["task"]
        text_input = (serializer.validated_data.get("text_input") or "").strip()

        if task == TRANSLATE_TASK:
            target_language = (serializer.validated_data.get("target_language") or "").strip()
            if not text_input:
                return Response({"error": "text_input is required"}, status=status.HTTP_400_BAD_REQUEST)
            if not target_language:
                return Response({"error": "target_language is required"}, status=status.HTTP_400_BAD_REQUEST)
            prompt = build_translate_prompt(text_input, target_language)
            llm_task = TRANSLATE_TASK
        elif task == REPHRASE_TASK:
            if not text_input:
                return Response({"error": "text_input is required"}, status=status.HTTP_400_BAD_REQUEST)
            prompt = build_rephrase_prompt(
                text_input,
                serializer.validated_data["casual_score"],
                serializer.validated_data["formal_score"],
            )
            llm_task = REPHRASE_TASK
        else:
            return Response({"error": "Unsupported task"}, status=status.HTTP_400_BAD_REQUEST)

        api_key, model, provider = get_llm_config()
        if not is_llm_configured(api_key, model, provider):
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        text, error = get_llm_response(llm_task, prompt, api_key, model, provider)
        if error or not text:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"response": text}, status=status.HTTP_200_OK)
