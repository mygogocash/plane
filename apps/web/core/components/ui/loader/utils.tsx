/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const getDeterministicIndex = (seed: number, length: number) => Math.abs(seed) % length;

export const getRandomInt = (min: number, max: number, seed = 0) => min + getDeterministicIndex(seed, max - min + 1);

export const getRandomLength = (lengthArray: string[], seed = 0) =>
  `${lengthArray[getDeterministicIndex(seed, lengthArray.length)]}`;
