import FileSystemProvider, {
  DirectoryTreeOptions,
  ExecuteCommandOptions,
  ExecuteCommandResult,
  GlobOptions,
  GrepOptions,
  GrepResult,
  StatLike,
  WatchOptions
} from "@tokenring-ai/filesystem/FileSystemProvider";
import chokidar, {FSWatcher} from "chokidar";
import {execa} from "execa";
import fs from "fs-extra";
import {glob} from "glob";
import path from "node:path";

export interface LocalFileSystemProviderOptions {
  baseDirectory: string;
  defaultSelectedFiles?: string[];
}


export default class LocalFileSystemProvider extends FileSystemProvider {
  name = "LocalFilesystemService";
  description = "Provides access to the local filesystem";
  private readonly rootDirectory!: string;

  constructor(options: LocalFileSystemProviderOptions) {
    super();
    const {baseDirectory} = options;


    if (!fs.existsSync(baseDirectory)) {
      throw new Error(`Root directory ${baseDirectory} does not exist`);
    }
    this.rootDirectory = baseDirectory;
  }

  getBaseDirectory(): string {
    return this.rootDirectory;
  }

  relativeOrAbsolutePathToAbsolutePath(p: string): string {
    if (path.isAbsolute(p)) {
      const relativePath = path.relative(this.rootDirectory, p);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error(`Path ${p} is outside the root directory`);
      }
      return p;
    } else {
      return path.resolve(this.rootDirectory, p);
    }
  }

  relativeOrAbsolutePathToRelativePath(p: string): string {
    return path.relative(this.rootDirectory, this.relativeOrAbsolutePathToAbsolutePath(p));
  }

  async writeFile(filePath: string, content: string | Buffer): Promise<boolean> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
    await fs.ensureDir(path.dirname(absolutePath));
    await fs.writeFile(absolutePath, content);
    return true;
  }

  async appendFile(filePath: string, finalContent: string | Buffer): Promise<boolean> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
    await fs.ensureDir(path.dirname(absolutePath));
    await fs.appendFile(absolutePath, finalContent);
    return true;
  }

  async deleteFile(filePath: string): Promise<boolean> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
    if (!(await fs.pathExists(absolutePath))) {
      throw new Error(`File ${filePath} does not exist`);
    }
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Path ${filePath} is not a file`);
    }
    await fs.remove(absolutePath);
    return true;
  }


  async readFile(filePath: string, encoding: BufferEncoding | undefined): Promise<string> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
    if (!(await fs.pathExists(absolutePath))) {
      throw new Error(`File ${filePath} does not exist`);
    }
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Path ${filePath} is not a file`);
    }
    const result = fs.readFileSync(absolutePath, {encoding});
    return result.toString();
  }

  async rename(oldPath: string, newPath: string): Promise<boolean> {
    const absoluteOldPath = this.relativeOrAbsolutePathToAbsolutePath(oldPath);
    const absoluteNewPath = this.relativeOrAbsolutePathToAbsolutePath(newPath);

    if (!(await fs.pathExists(absoluteOldPath))) {
      throw new Error(`Path ${oldPath} does not exist`);
    }
    if (await fs.pathExists(absoluteNewPath)) {
      throw new Error(`Path ${newPath} already exists`);
    }
    await fs.ensureDir(path.dirname(absoluteNewPath));
    await fs.rename(absoluteOldPath, absoluteNewPath);
    return true;
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
      return fs.pathExists(absolutePath);
    } catch (_error) {
      return false;
    }
  }

  async stat(filePath: string): Promise<StatLike> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
    if (!(await fs.pathExists(absolutePath))) {
      throw new Error(`Path ${filePath} does not exist`);
    }

    const stats = await fs.stat(absolutePath);
    return {
      path: filePath,
      absolutePath: absolutePath,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
    };
  }

  async createDirectory(dirPath: string, options: { recursive?: boolean } = {}): Promise<boolean> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(dirPath);
    const {recursive = false} = options;

    if (await fs.pathExists(absolutePath)) {
      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        return true;
      } else {
        throw new Error(`Path ${dirPath} exists but is not a directory`);
      }
    }

    if (recursive) {
      await fs.ensureDir(absolutePath);
    } else {
      try {
        await fs.mkdir(absolutePath);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          throw new Error(`Parent directory for ${dirPath} does not exist`);
        }
        throw error;
      }
    }

    return true;
  }

  async copy(source: string, destination: string, options: { overwrite?: boolean } = {}): Promise<boolean> {
    const absoluteSource = this.relativeOrAbsolutePathToAbsolutePath(source);
    const absoluteDestination = this.relativeOrAbsolutePathToAbsolutePath(destination);
    const {overwrite = false} = options;

    if (!(await fs.pathExists(absoluteSource))) {
      throw new Error(`Source path ${source} does not exist`);
    }

    if (!overwrite && (await fs.pathExists(absoluteDestination))) {
      throw new Error(`Destination path ${destination} already exists`);
    }

    await fs.copy(absoluteSource, absoluteDestination, {overwrite});
    return true;
  }

  async glob(pattern: string, {ignoreFilter}: GlobOptions): Promise<string[]> {
    try {

      return glob
        .sync(pattern, {
          cwd: this.rootDirectory,
          dot: true,
          nodir: true,
          absolute: false,
        })
        .filter((file) => {
          return !ignoreFilter(file);
        });
    } catch (error: any) {
      throw new Error(`Glob operation failed: ${error.message}`);
    }
  }

  async watch(
    dir: string,
    {ignoreFilter, pollInterval = 1000, stabilityThreshold = 2000}: WatchOptions
  ): Promise<FSWatcher> {
    const absolutePath = path.resolve(this.rootDirectory, dir);

    if (!(await fs.pathExists(absolutePath))) {
      throw new Error(`Directory ${dir} does not exist`);
    }

    const cwd = path.relative(process.cwd(), this.rootDirectory);
    return chokidar.watch("./", {
      ignored: (file: string) => {
        if (file === "." || file === "./") return false;

        if (file.startsWith("./")) {
          file = file.substring(2);
        }

        try {
          return ignoreFilter!(file);
        } catch (_error) {
          return true;
        }
      },
      cwd: cwd,
      awaitWriteFinish: {
        stabilityThreshold,
        pollInterval,
      },
    });
  }

  async executeCommand(command: string | string[], options: ExecuteCommandOptions = {}): Promise<ExecuteCommandResult> {
    const {timeoutSeconds = 60, env = {}, workingDirectory = "./"} = options;

    if (!command) {
      throw new Error("Command is required");
    }

    const cwd = this.relativeOrAbsolutePathToAbsolutePath(workingDirectory);

    const timeout = Math.max(5, Math.min(timeoutSeconds || 60, 600));

    const execOpts: any = {
      cwd,
      env: {...process.env, ...env},
      timeout: timeout * 1000,
      maxBuffer: 1024 * 1024,
    };

    try {
      let result: any;

      if (Array.isArray(command)) {
        if (command.length === 0) {
          throw new Error("Command array cannot be empty");
        }
        const [cmd, ...args] = command;
        result = await execa(cmd, args, execOpts);
      } else {
        execOpts.shell = true;
        result = await execa(command, execOpts);
      }

      const {stdout, stderr, exitCode} = result;
      return {
        ok: true,
        exitCode: exitCode,
        stdout: (stdout?.trim?.() ?? ""),
        stderr: (stderr?.trim?.() ?? ""),
      };
    } catch (err: any) {
      return {
        ok: false,
        exitCode: typeof err.exitCode === "number" ? err.exitCode : 1,
        stdout: (err.stdout?.trim?.() ?? ""),
        stderr: (err.stderr?.trim?.() ?? ""),
        error: err.shortMessage || err.message || "Unknown error",
      };
    }
  }

  async grep(
    searchString: string,
    options: GrepOptions
  ): Promise<GrepResult[]> {
    const {ignoreFilter, includeContent = {}} = options;
    const {linesBefore = 0, linesAfter = 0} = includeContent;

    if (!searchString) {
      throw new Error("Search string is required");
    }

    const allFiles: string[] = [];
    for await (const file of this.getDirectoryTree("", {ignoreFilter})) {
      allFiles.push(path.join(this.rootDirectory, file));
    }

    const filesToSearch = ignoreFilter ? allFiles.filter((file) => !ignoreFilter(file)) : allFiles;

    const results: Array<{ file: string; line: number; match: string; content: string | null }> = [];

    for (const file of filesToSearch) {
      try {
        const content = await this.getFile(path.relative(this.rootDirectory, file));
        if (!content) continue;
        const lines = content.split("\n");

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          if (line.includes(searchString)) {
            const startLine = Math.max(0, lineNum - linesBefore);
            const endLine = Math.min(lines.length - 1, lineNum + linesAfter);

            let contextContent: string | null = null;
            if (linesBefore > 0 || linesAfter > 0) {
              contextContent = lines.slice(startLine, endLine + 1).join("\n");
            }

            results.push({
              file: path.relative(this.rootDirectory, file),
              line: lineNum + 1,
              match: line,
              content: contextContent,
            });
          }
        }
      } catch (_error) {
        // Ignore files that cannot be read due to permissions or transient errors
      }
    }

    return results;
  }

  async* getDirectoryTree(
    dir: string,
    {ignoreFilter, recursive = true}: DirectoryTreeOptions
  ): AsyncGenerator<string> {

    const absoluteDir = path.resolve(this.rootDirectory, dir);
    const items = await fs.readdir(absoluteDir, {withFileTypes: true});

    for (const item of items) {
      const itemPath = path.join(absoluteDir, item.name);
      const relPath = path.relative(this.rootDirectory, itemPath);

      if (ignoreFilter(relPath)) continue;

      if (item.isDirectory()) {
        yield `${relPath}/`;
        if (recursive) {
          yield* this.getDirectoryTree(relPath, {ignoreFilter});
        }
      } else {
        yield relPath;
      }
    }
  }

  async chmod(filePath: string, mode: number): Promise<boolean> {
    const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

    if (!(await fs.pathExists(absolutePath))) {
      throw new Error(`Path ${filePath} does not exist`);
    }

    try {
      await fs.chmod(absolutePath, mode);
      return true;
    } catch (error: any) {
      throw new Error(`Failed to change permissions for ${filePath}: ${error.message}`);
    }
  }
}
