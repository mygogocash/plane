import { describe, expect, it } from "vitest";

import { SELF_HOSTED_FEATURE_FLAGS } from "../lib/self-host-entitlements";
import { useEditorFlagging } from "./use-editor-flagging";

describe("useEditorFlagging", () => {
  it("keeps AI disabled but enables collaboration cursors when the self-host flag is on", () => {
    expect(SELF_HOSTED_FEATURE_FLAGS.collaboration_cursor).toBe(true);

    const flagging = useEditorFlagging({} as Parameters<typeof useEditorFlagging>[0]);

    expect(flagging.document.disabled).toContain("ai");
    expect(flagging.document.disabled).not.toContain("collaboration-cursor");
    expect(flagging.liteText.disabled).not.toContain("collaboration-cursor");
    expect(flagging.richText.disabled).not.toContain("collaboration-cursor");
  });
});
