// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

"use client";

// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
// services
import { ProjectPageService, type TPageBacklink } from "@/services/page";

type TPageBacklinksProps = {
  page: {
    id?: string;
    project_ids?: string[];
  };
};

type TPageBacklinksListProps = {
  backlinks: TPageBacklink[];
};

const projectPageService = new ProjectPageService();

const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const backlinkHref = (backlink: TPageBacklink) => {
  const projectId = backlink.project_ids?.[0];
  return projectId
    ? `/${backlink.workspace__slug}/projects/${projectId}/pages/${backlink.id}`
    : `/${backlink.workspace__slug}/wiki/${backlink.id}`;
};

export const PageNavigationPaneInfoTabBacklinksList = (props: TPageBacklinksListProps) => {
  const { backlinks } = props;

  if (backlinks.length === 0) return <p className="mt-2 text-12 text-tertiary">No pages link here yet.</p>;

  return (
    <ul className="mt-2 space-y-1">
      {backlinks.map((backlink) => (
        <li key={backlink.id}>
          <Link
            href={backlinkHref(backlink)}
            className="hover:bg-custom-background-80 block rounded px-2 py-1 text-12 text-secondary hover:text-primary"
          >
            <span className="line-clamp-1">{backlink.name || "Untitled"}</span>
            {backlink.project_identifiers?.[0] && (
              <span className="text-11 text-tertiary">{backlink.project_identifiers[0]}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
};

export const PageNavigationPaneInfoTabBacklinks = (props: TPageBacklinksProps) => {
  const { page } = props;
  const params = useParams();
  const workspaceSlug = firstParam(params.workspaceSlug);
  const projectId = firstParam(params.projectId) ?? page.project_ids?.[0];
  const pageId = page.id;
  const [backlinks, setBacklinks] = useState<TPageBacklink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !pageId) return;

    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    projectPageService
      .fetchBacklinks(workspaceSlug, projectId, pageId)
      .then((response) => {
        if (!isMounted) return undefined;
        setBacklinks(response.backlinks ?? []);
        return undefined;
      })
      .catch(() => {
        if (!isMounted) return;
        setHasError(true);
        setBacklinks([]);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [workspaceSlug, projectId, pageId]);

  return (
    <section className="mt-5" aria-labelledby="page-backlinks-heading">
      <h4 id="page-backlinks-heading" className="text-sm font-medium text-primary">
        Backlinks
      </h4>
      {isLoading ? (
        <p className="mt-2 text-12 text-tertiary">Loading backlinks...</p>
      ) : hasError ? (
        <p className="mt-2 text-12 text-tertiary">Unable to load backlinks.</p>
      ) : (
        <PageNavigationPaneInfoTabBacklinksList backlinks={backlinks} />
      )}
    </section>
  );
};
