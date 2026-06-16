/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IUser } from "@plane/types";

vi.mock("@plane/i18n", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Fixed instant so the rendered clock is deterministic.
const FIXED = new Date("2026-06-16T12:00:00Z");
vi.mock("@/hooks/use-current-time", () => ({
  useCurrentTime: () => ({ currentTime: FIXED }),
}));

import { UserGreetingsView } from "./user-greetings";

describe("UserGreetingsView > given a profile timezone different from the browser > then the clock shows the browser's local time", () => {
  it("formats the time in the browser's local timezone, not user_timezone", () => {
    // The clock should match the browser-local formatting (same options the component uses)...
    const expectedLocalTime = new Intl.DateTimeFormat("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(FIXED);
    // ...and must NOT fall back to the stored profile timezone.
    const profileTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(FIXED);

    const user = {
      first_name: "Kunanon",
      last_name: "Jarat",
      user_timezone: "Asia/Tokyo",
    } as unknown as IUser;

    const html = renderToStaticMarkup(<UserGreetingsView user={user} />);

    expect(html).toContain(expectedLocalTime);
    // Guard keeps the assertion meaningful only when the runner's zone differs from the profile zone.
    if (expectedLocalTime !== profileTime) {
      expect(html).not.toContain(profileTime);
    }
  });
});
