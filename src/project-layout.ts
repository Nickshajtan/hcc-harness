import { lstat, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { configurationDirectories, type ConfigurationDirectory } from './config.js';

/** Project-relative managed paths. Recorded manifests continue to use these paths verbatim. */
export function projectLayout(root: string, directory: ConfigurationDirectory = '.arch') {
  if (!configurationDirectories.includes(directory)) {
    throw new Error('Invalid trusted configuration directory');
  }
  return Object.freeze({
    projectRoot: resolve(root),
    directory,
    configurationDirectory: resolve(root, directory),
    configurationPath: `${directory}/harness.toml`,
    binDirectory: `${directory}/bin`,
    internalDirectory: `${directory}/.internal`,
    markerPath: `${directory}/bin/.arch-router`,
    statePath: `${directory}/bootstrap.json`,
    uninstallPath: `${directory}/uninstall.json`,
    routingPath: `${directory}/routing.json`,
    journalStage: `${directory}/routing.stage`,
    setupClaimPath: `${directory}/setup-claim`,
  });
}

export type ProjectLayout = ReturnType<typeof projectLayout>;

async function present(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return false;
    }
    throw error;
  }
}

// Configuration selects a home; lifecycle evidence also keeps a damaged or
// interrupted installation discoverable without parsing or adopting its contents.
async function hasProjectEvidence(layout: ProjectLayout): Promise<boolean> {
  for (const path of [
    layout.configurationPath,
    layout.statePath,
    layout.uninstallPath,
    layout.routingPath,
    layout.journalStage,
    layout.setupClaimPath,
  ]) {
    if (await present(join(layout.projectRoot, path))) {
      return true;
    }
  }
  try {
    return (await readdir(layout.configurationDirectory)).some(
      (name) => name.startsWith('.setup-') || name.startsWith('.routing-'),
    );
  } catch (error) {
    if ('ENOENT' === (error as NodeJS.ErrnoException).code) {
      return false;
    }
    throw error;
  }
}

async function existingLayoutAt(
  root: string,
  selected?: ConfigurationDirectory,
): Promise<ProjectLayout | undefined> {
  const found: ProjectLayout[] = [];
  for (const directory of configurationDirectories) {
    const layout = projectLayout(root, directory);
    if (await hasProjectEvidence(layout)) {
      found.push(layout);
    }
  }
  if (1 < found.length) {
    throw new Error(
      `Conflicting HCC project directories: ${found.map((layout) => layout.configurationDirectory).join(', ')}`,
    );
  }
  const layout = found[0];
  if (layout && undefined !== selected && selected !== layout.directory) {
    throw new Error(
      `Selected HCC directory differs from existing project: ${layout.directory}; no implicit migration`,
    );
  }
  return layout;
}

/** Explicit-root service APIs retain their historical target-root contract. */
export async function resolveProjectLayoutAt(
  root: string,
  selected?: ConfigurationDirectory,
): Promise<ProjectLayout> {
  const fallback = projectLayout(root, selected);
  return (await existingLayoutAt(fallback.projectRoot, selected)) ?? fallback;
}

/** CLI/wizard boundary: select the nearest project, never merge or migrate homes. */
export async function resolveProjectLayout(
  cwd: string,
  selected?: ConfigurationDirectory,
): Promise<ProjectLayout> {
  const initial = projectLayout(cwd, selected);
  let root = initial.projectRoot;
  for (;;) {
    const layout = await existingLayoutAt(root, selected);
    if (layout) {
      return layout;
    }
    const parent = dirname(root);
    if (parent === root) {
      return initial;
    }
    root = parent;
  }
}
