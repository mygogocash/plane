/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RANDOM_EMOJI_CODES } from "@plane/constants";
import type { IProject } from "@plane/types";
import { getDefaultCoverImage } from "@/helpers/cover-image.helper";

export const getProjectFormValues = (): Partial<IProject> => ({
  cover_image_url: getDefaultCoverImage(),
  description: "",
  logo_props: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[0],
    },
  },
  identifier: "",
  name: "",
  network: 2,
  project_lead: null,
});
