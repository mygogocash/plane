import { existsSync } from "node:fs";
import path from "node:path";

const rootMarkers = ["pnpm-workspace.yaml", ".git"];

export function findRepoRoot(startPath = process.cwd()) {
  let currentPath = path.resolve(startPath);

  while (true) {
    if (rootMarkers.some((marker) => existsSync(path.join(currentPath, marker)))) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return path.resolve(startPath);
    }
    currentPath = parentPath;
  }
}

export function resolveRepoPath(rawPath, root = findRepoRoot()) {
  if (!rawPath || path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(root, rawPath);
}
