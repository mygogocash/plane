/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
// plane imports
import { cn } from "@plane/utils";

type TPageWrapperProps = {
  children: ReactNode;
  header?: {
    title: string;
    description: string | ReactNode;
    actions?: ReactNode;
  };
  customHeader?: ReactNode;
  size?: "lg" | "md";
};

export const PageWrapper = (props: TPageWrapperProps) => {
  const { children, header, customHeader, size = "md" } = props;

  return (
    <div
      className={cn("mx-auto flex h-full w-full min-w-0 flex-col space-y-4 py-3 md:space-y-6 md:py-4", {
        "max-w-[1000px] md:px-4 2xl:max-w-[1200px]": size === "md",
        "px-3 md:px-4 lg:px-12": size === "lg",
      })}
    >
      {customHeader ? (
        <div className="mx-3 shrink-0 space-y-1 border-b border-subtle py-3 md:mx-4 md:py-4">{customHeader}</div>
      ) : (
        header && (
          <div className="mx-3 flex shrink-0 flex-col gap-3 border-b border-subtle py-3 md:mx-4 md:flex-row md:items-center md:justify-between md:gap-4 md:py-4">
            <div className={cn("min-w-0", header.actions ? "flex flex-col gap-1" : "space-y-1")}>
              <div className="text-h5-semibold text-primary">{header.title}</div>
              <div className="text-body-sm-regular text-secondary">{header.description}</div>
            </div>
            {header.actions && <div className="flex shrink-0 flex-wrap gap-2">{header.actions}</div>}
          </div>
        )
      )}
      <div className="vertical-scrollbar scrollbar-sm min-w-0 flex-grow overflow-hidden overflow-y-scroll px-3 pb-4 md:px-4">
        {children}
      </div>
    </div>
  );
};
