/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

type TDeDupeIssueButtonLabelProps = {
  isOpen: boolean;
  buttonLabel: string;
};

export function DeDupeIssueButtonLabel(_props: TDeDupeIssueButtonLabelProps) {
  const { buttonLabel, isOpen } = _props;

  return (
    <span className="text-xs inline-flex items-center gap-1 font-medium text-secondary">
      {buttonLabel}
      <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
    </span>
  );
}
