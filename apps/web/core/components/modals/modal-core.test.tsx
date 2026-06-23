/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@headlessui/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@headlessui/react")>();
  const React = await vi.importActual<typeof import("react")>("react");

  type DialogProps = React.PropsWithChildren<{
    as?: React.ElementType;
    className?: string;
    onClose?: () => void;
  }>;
  type TransitionProps = React.PropsWithChildren<{
    as?: React.ElementType;
    show?: boolean;
  }>;

  const Dialog = Object.assign(({ children }: DialogProps) => <div>{children}</div>, {
    Panel: ({ children, className }: DialogProps) => <div className={className}>{children}</div>,
  });

  const Transition = {
    Root: ({ children, show }: TransitionProps) => (show ? <>{children}</> : null),
    Child: ({ as: Component = "div", children }: TransitionProps) => {
      if (Component === React.Fragment) {
        throw new Error('Passing props on "Fragment"!');
      }

      return <Component>{children}</Component>;
    },
  };

  return { ...actual, Dialog, Transition };
});

import { ModalCore } from "@plane/ui";

describe("ModalCore", () => {
  it("renders transition children as elements so Headless UI can forward refs", () => {
    expect(() =>
      renderToStaticMarkup(
        <ModalCore isOpen>
          <div>Modal body</div>
        </ModalCore>
      )
    ).not.toThrow('Passing props on "Fragment"!');
  });
});
