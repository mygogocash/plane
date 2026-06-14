/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// store
import { CoreRootStore } from "@/store/root.store";
import type { IInitiativeStore } from "./initiative";
import { InitiativeStore } from "./initiative";
import type { ITimelineStore } from "./timeline";
import { TimeLineStore } from "./timeline";

export class RootStore extends CoreRootStore {
  initiative: IInitiativeStore;
  timelineStore: ITimelineStore;

  constructor() {
    super();

    this.initiative = new InitiativeStore(this);
    this.timelineStore = new TimeLineStore(this);
  }

  override resetOnSignOut() {
    super.resetOnSignOut();
    this.initiative = new InitiativeStore(this);
    this.timelineStore = new TimeLineStore(this);
  }
}
