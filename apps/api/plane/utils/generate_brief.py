# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from plane.app.views.external.base import get_llm_response
from plane.db.models import Page, PageLog, ProjectPage
from plane.utils.content_validator import validate_html_content

BRIEF_SECTIONS = ("Problem", "Solution", "Acceptance Criteria", "Notes")


def build_brief_prompt(issue) -> str:
    description = issue.description_stripped or ""
    sections = ", ".join(BRIEF_SECTIONS)
    return (
        "Generate an AI brief for this work item as HTML.\n"
        f"Use exactly these section headings as h2 tags in order: {sections}.\n"
        f"Work item title: {issue.name}\n"
        f"Work item description: {description}\n"
        "Return only HTML body content without markdown fences."
    )


def sanitize_brief_html(content: str) -> str:
    if not content:
        return content

    is_valid, _error, clean_html = validate_html_content(content)
    return clean_html if clean_html is not None else content


def generate_brief_html(issue, api_key, model, provider):
    prompt = build_brief_prompt(issue)
    raw_html, error = get_llm_response("generate_brief", prompt, api_key, model, provider)
    if error or not raw_html:
        return None, error or "Failed to generate brief"

    return sanitize_brief_html(raw_html), None


def create_brief_page(*, workspace, project, issue, user, description_html, regenerate=False):
    suffix = uuid.uuid4().hex if regenerate else None
    external_id = f"ai-brief:{issue.id}:{suffix}" if suffix else f"ai-brief:{issue.id}"

    page = Page.objects.create(
        workspace=workspace,
        owned_by=user,
        name=f"Brief: {issue.name}",
        description_html=description_html,
        access=Page.PRIVATE_ACCESS,
        external_source="ai_brief",
        external_id=external_id,
        is_global=True,
    )
    ProjectPage.objects.create(project=project, page=page, workspace=workspace)
    PageLog.objects.create(
        page=page,
        workspace=workspace,
        entity_identifier=issue.id,
        entity_name="issue",
        entity_type="issue",
    )
    return page
