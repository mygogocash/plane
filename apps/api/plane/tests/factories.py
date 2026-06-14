# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import factory
from uuid import uuid4
from django.utils import timezone

from plane.db.models import (
    Issue,
    IssueProperty,
    IssuePropertyValue,
    IssueType,
    Project,
    ProjectMember,
    State,
    User,
    Workspace,
    WorkspaceMember,
)


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating User instances"""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    id = factory.LazyFunction(uuid4)
    email = factory.Sequence(lambda n: f"user{n}@plane.so")
    password = factory.PostGenerationMethodCall("set_password", "password")
    first_name = factory.Sequence(lambda n: f"First{n}")
    last_name = factory.Sequence(lambda n: f"Last{n}")
    is_active = True
    is_superuser = False
    is_staff = False


class WorkspaceFactory(factory.django.DjangoModelFactory):
    """Factory for creating Workspace instances"""

    class Meta:
        model = Workspace
        django_get_or_create = ("slug",)

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Workspace {n}")
    slug = factory.Sequence(lambda n: f"workspace-{n}")
    owner = factory.SubFactory(UserFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class WorkspaceMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating WorkspaceMember instances"""

    class Meta:
        model = WorkspaceMember

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectFactory(factory.django.DjangoModelFactory):
    """Factory for creating Project instances"""

    class Meta:
        model = Project
        django_get_or_create = ("name", "workspace")

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Project {n}")
    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.SelfAttribute("workspace.owner")
    updated_by = factory.SelfAttribute("workspace.owner")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating ProjectMember instances"""

    class Meta:
        model = ProjectMember

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssueTypeFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssueType instances"""

    class Meta:
        model = IssueType

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    name = factory.Sequence(lambda n: f"Issue Type {n}")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class StateFactory(factory.django.DjangoModelFactory):
    """Factory for creating State instances"""

    class Meta:
        model = State

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    name = factory.Sequence(lambda n: f"State {n}")
    color = "#60646C"
    group = "unstarted"
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssueFactory(factory.django.DjangoModelFactory):
    """Factory for creating Issue instances"""

    class Meta:
        model = Issue

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    workspace = factory.SelfAttribute("project.workspace")
    state = factory.SubFactory(StateFactory, project=factory.SelfAttribute("..project"))
    type = factory.SubFactory(IssueTypeFactory, workspace=factory.SelfAttribute("..workspace"))
    name = factory.Sequence(lambda n: f"Issue {n}")
    created_by = factory.SelfAttribute("project.created_by")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssuePropertyFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssueProperty instances"""

    class Meta:
        model = IssueProperty

    id = factory.LazyFunction(uuid4)
    issue_type = factory.SubFactory(IssueTypeFactory)
    workspace = factory.SelfAttribute("issue_type.workspace")
    name = factory.Sequence(lambda n: f"property-{n}")
    display_name = factory.Sequence(lambda n: f"Property {n}")
    property_type = IssueProperty.PropertyType.TEXT
    settings = factory.LazyFunction(dict)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class IssuePropertyValueFactory(factory.django.DjangoModelFactory):
    """Factory for creating IssuePropertyValue instances"""

    class Meta:
        model = IssuePropertyValue

    id = factory.LazyFunction(uuid4)
    issue = factory.SubFactory(IssueFactory)
    project = factory.SelfAttribute("issue.project")
    workspace = factory.SelfAttribute("issue.workspace")
    property = factory.SubFactory(IssuePropertyFactory)
    value = factory.LazyFunction(lambda: {"text": "value"})
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)
