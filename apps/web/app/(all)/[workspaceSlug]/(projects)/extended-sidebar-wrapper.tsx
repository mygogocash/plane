/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { EXTENDED_SIDEBAR_WIDTH, SIDEBAR_WIDTH } from "@plane/constants";
import { useLocalStorage, useViewport } from "@plane/hooks";
import { cn } from "@plane/utils";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
// hooks
import useExtendedSidebarOutsideClickDetector from "@/hooks/use-extended-sidebar-overview-outside-click";

type Props = {
  className?: string;
  children: React.ReactNode;
  extendedSidebarRef: React.RefObject<HTMLDivElement>;
  isExtendedSidebarOpened: boolean;
  handleClose: () => void;
  excludedElementId: string;
};

export const ExtendedSidebarWrapper = observer(function ExtendedSidebarWrapper(props: Props) {
  const { className, children, extendedSidebarRef, isExtendedSidebarOpened, handleClose, excludedElementId } = props;
  // store hooks
  const { sidebarCollapsed } = useAppTheme();
  // local storage
  const { storedValue } = useLocalStorage("sidebarWidth", SIDEBAR_WIDTH);
  const { isMobile } = useViewport();

  useExtendedSidebarOutsideClickDetector(extendedSidebarRef, handleClose, excludedElementId);

  useEffect(() => {
    if (sidebarCollapsed) {
      handleClose();
    }
  }, [sidebarCollapsed, handleClose]);

  return (
    <>
      {isMobile && isExtendedSidebarOpened && (
        <button
          type="button"
          aria-label="Close extended sidebar"
          className="fixed inset-0 z-[20] bg-backdrop/40 md:hidden"
          onClick={handleClose}
        />
      )}
      <div
        id={excludedElementId}
        ref={extendedSidebarRef}
        className={cn(
          "shadow-sm absolute z-[21] flex h-full transform flex-col border-r border-subtle bg-surface-1 p-4 py-2 transition-all duration-300 ease-in-out",
          isMobile && "left-0! max-w-[calc(100vw-1rem)]",
          {
            "opacity-100": isExtendedSidebarOpened,
            "hidden opacity-0": !isExtendedSidebarOpened,
          },
          className
        )}
        style={{
          left: isMobile ? "0px" : `${storedValue ?? SIDEBAR_WIDTH}px`,
          width: isMobile ? `min(86vw, ${EXTENDED_SIDEBAR_WIDTH}px)` : `${EXTENDED_SIDEBAR_WIDTH}px`,
        }}
      >
        {children}
      </div>
    </>
  );
});
