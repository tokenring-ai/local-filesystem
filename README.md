# @token-ring/local-filesystem

A concrete implementation of the FileSystemService abstraction that provides safe access to your local disk for Token
Ring apps and agents.

This package is typically used together with:

- @token-ring/registry
- @token-ring/filesystem (abstract base definitions and tools)
- @token-ring/chat (optional, for chat-driven workflows)

## What it does

LocalFileSystemService exposes a high-level, promise-based API for common file and directory operations restricted to a
configured root directory. It also provides utilities for watching files, running shell commands, searching for text,
and traversing directories.

Key characteristics:

- Root-scoped: all operations are confined to rootDirectory; attempts to access paths outside are rejected.
- Ignore-aware: most listing/searching methods accept an ignore filter; by default the service uses the
  FileSystemService.createIgnoreFilter implementation from @token-ring/filesystem (e.g., respecting typical VCS/IDE
  ignore rules where supported in your app).
- Watcher-backed: uses chokidar under the hood for robust file watching.
- Shell execution: uses execa with timeouts and environment overrides.

## Installation

This package is part of the Token Ring monorepo and is referenced as a workspace dependency.

package.json (excerpt):

```json
{
  "dependencies": {
    "@token-ring/local-filesystem": "0.1.0"
  }
}
```

## Basic usage

Programmatic usage with the registry:

```ts
import {ServiceRegistry} from "@token-ring/registry";
import {LocalFileSystemService} from "@token-ring/local-filesystem";

const registry = new ServiceRegistry();
await registry.start();

const fsService = new LocalFileSystemService({rootDirectory: process.cwd()});
await registry.services.addServices(fsService);

// Write
await fsService.writeFile("notes/todo.txt", "- [ ] Ship README\n");

// Read
const content = await fsService.getFile("notes/todo.txt");

// Stat
const info = await fsService.stat("notes/todo.txt");

// Rename
await fsService.rename("notes/todo.txt", "notes/TODO.md");

// Glob
const mdFiles = await fsService.glob("**/*.md");

// Execute a shell command within the root
const result = await fsService.executeCommand("echo hello", {workingDirectory: "."});
if (result.ok) {
  console.log(result.stdout); // "hello"
}
```

Using with tr-coder and code-watch:

```ts
import { LocalFileSystemService } from "@token-ring/local-filesystem";
// tr-coder will typically register this automatically, but you can add it manually
new LocalFileSystemService({ rootDirectory: process.cwd() });
```

## API summary

Class: LocalFileSystemService extends FileSystemService

Constructor

- new LocalFileSystemService({ rootDirectory: string, defaultSelectedFiles?: string[] })

Path utilities

- relativeOrAbsolutePathToAbsolutePath(p): string
- relativeOrAbsolutePathToRelativePath(p): string

File operations

- writeFile(filePath, content): Promise<boolean>
- getFile(filePath): Promise<string>
- readFile(filePath, encoding?): Promise<string>
- deleteFile(filePath): Promise<boolean>
- rename(oldPath, newPath): Promise<boolean>
- exists(filePath): Promise<boolean>
- stat(filePath): Promise<{ path, absolutePath, isFile, isDirectory, isSymbolicLink, size, created, modified,
  accessed }>
- chmod(filePath, mode): Promise<boolean>
- copy(source, destination, { overwrite = false }?): Promise<boolean>

Directories, listing, and search

- createDirectory(dirPath, { recursive = false }?): Promise<boolean>
- glob(pattern, { ig }?): Promise<string[]>
- grep(searchString, { ignoreFilter?, includeContent?: { linesBefore?, linesAfter? } }?): Promise<Array<{ file, line,
  match, content }>>
- getDirectoryTree(dir, { ig, recursive = true }?): AsyncGenerator<string>
- watch(dir, { ig, pollInterval = 1000, stabilityThreshold = 2000 }?): Promise<FSWatcher>

Process execution

- executeCommand(command: string | string[], options?: { timeoutSeconds?, env?, workingDirectory? }): Promise<{ ok,
  stdout, stderr, exitCode, error? }>

## Errors and edge cases

- Outside root: Any attempt to target a path outside rootDirectory throws an error.
- Nonexistent paths: Methods that require existing files/dirs (e.g., getFile, deleteFile, stat) throw when targets are
  missing.
- Overwrites: copy(...) without overwrite=true will throw if destination already exists.
- Commands: executeCommand returns { ok: false, ... } on failures, with stderr and exitCode set when available. A
  minimum timeout of 5s and max of 600s are enforced.

## Exports

```ts
import {name, version, description, LocalFileSystemService} from "@token-ring/local-filesystem";
```

- name/version/description are re-exported from this package’s package.json via index.ts.

## Dependencies

- chokidar: file watching
- execa: process execution
- fs-extra: file utilities
- glob: pattern-based file listing
- @token-ring/filesystem: abstract base and ignore filter helpers
- @token-ring/registry: service registration support

## License

MIT
