import fs from "fs-extra";
import path from "path";
import { execa } from "execa";
import { glob } from "glob";
import chokidar from "chokidar";
import { FileSystemService } from "@token-ring/filesystem";

/**
 * LocalFileSystem implements the FileSystem interface using the local filesystem.
 */
export default class LocalFileSystemService extends FileSystemService {
	name = "LocalFilesystemService";
	description = "Provides access to the local filesystem";

	/**
	 * Properties required for constructing the context.
	 */
	static constructorProperties = {
		rootDirectory: {
			type: "string",
			required: true,
			description: "Root directory for file operations",
		},
	};

	/**
	 * Creates an instance of LocalFileSystem.
	 * @param {Object} options
	 * @param {string} options.rootDirectory - The root directory path.
	 * @param {string[]} [options.defaultSelectedFiles=[]] - Files manually selected by default.
	 * @throws Will throw an error if the root directory does not exist.
	 */
	constructor(options) {
		const { rootDirectory } = options;
		super(options);
		if (!fs.existsSync(rootDirectory)) {
			throw new Error(`Root directory ${rootDirectory} does not exist`);
		}
		this.rootDirectory = rootDirectory;
	}

	/**
	 * Converts a relative or absolute path to an absolute path within the base directory.
	 * @param {string} p - The path to convert.
	 * @returns {string} The absolute path.
	 */
	relativeOrAbsolutePathToAbsolutePath(p) {
		if (!path.isAbsolute(p)) return path.resolve(this.rootDirectory, p);

		// Might not be an absolute path, might be a path in the base directory with a / on the front
		let resolved = path.resolve(this.rootDirectory, p);
		if (fs.existsSync(resolved)) return resolved;

		// Might be a new file in the base directory
		const withoutFile = p.replace(/\/[^\/]+\.[a-zA-Z0-9]+/);
		resolved = path.resolve(this.rootDirectory, withoutFile);
		if (fs.existsSync(resolved)) return path.resolve(this.rootDirectory, p);

		// Check if the path is within the root directory
		const relativePath = path.relative(this.rootDirectory, p);
		if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
			throw new Error(`Path ${p} is outside the root directory`);
		}

		return path.resolve(this.rootDirectory, p);
	}

	/**
	 * Converts a relative or absolute path to a relative path from the base directory.
	 * @param {string} p - The path to convert.
	 * @returns {string} The relative path.
	 */
	relativeOrAbsolutePathToRelativePath(p) {
		return path.relative(
			this.rootDirectory,
			this.relativeOrAbsolutePathToAbsolutePath(p),
		);
	}

	/**
	 * Creates a new file with the specified content.
	 * @param {string} filePath - Path to the file to create.
	 * @param {string} content - Content to write to the file.
	 * @returns {Promise<boolean>} - Whether the write succeeded
	 * @throws Will throw an error if the file cannot be created.
	 */
	async writeFile(filePath, content) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

		// Ensure the directory exists
		await fs.ensureDir(path.dirname(absolutePath));

		await fs.writeFile(absolutePath, content);

		return true;
	}

	/**
	 * Deletes the specified file.
	 * @param {string} filePath - Path to the file to delete.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file was deleted successfully.
	 * @throws Will throw an error if the file cannot be deleted.
	 */
	async deleteFile(filePath) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

		// Check if the file exists
		if (!(await fs.pathExists(absolutePath))) {
			throw new Error(`File ${filePath} does not exist`);
		}

		// Make sure it's a file, not a directory
		const stats = await fs.stat(absolutePath);
		if (!stats.isFile()) {
			throw new Error(`Path ${filePath} is not a file`);
		}

		await fs.remove(absolutePath);
		return true;
	}

	/**
	 * Gets the content of the specified file.
	 * @param {string} filePath - Path to the file to read.
	 * @returns {Promise<string>} A promise that resolves to the content of the file as a string.
	 * @throws Will throw an error if the file cannot be read.
	 */
	async getFile(filePath) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

		// Check if the file exists
		if (!(await fs.pathExists(absolutePath))) {
			throw new Error(`File ${filePath} does not exist`);
		}

		// Make sure it's a file, not a directory
		const stats = await fs.stat(absolutePath);
		if (!stats.isFile()) {
			throw new Error(`Path ${filePath} is not a file`);
		}

		// noinspection JSValidateTypes,JSCheckFunctionSignatures
		return fs.readFile(absolutePath, "utf8");
	}

	/**
	 * Renames a file or directory.
	 * @param {string} oldPath - Current path of the file or directory.
	 * @param {string} newPath - New path for the file or directory.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file was renamed successfully.
	 * @throws Will throw an error if the file or directory cannot be renamed.
	 */
	async rename(oldPath, newPath) {
		const absoluteOldPath = this.relativeOrAbsolutePathToAbsolutePath(oldPath);
		const absoluteNewPath = this.relativeOrAbsolutePathToAbsolutePath(newPath);

		// Check if the source exists
		if (!(await fs.pathExists(absoluteOldPath))) {
			throw new Error(`Path ${oldPath} does not exist`);
		}

		// Check if the destination already exists
		if (await fs.pathExists(absoluteNewPath)) {
			throw new Error(`Path ${newPath} already exists`);
		}

		// Ensure the destination directory exists
		await fs.ensureDir(path.dirname(absoluteNewPath));

		await fs.rename(absoluteOldPath, absoluteNewPath);
		return true;
	}

	/**
	 * Checks if a file or directory exists.
	 * @param {string} filePath - Path to check.
	 * @returns {Promise<boolean>} A promise that resolves to true if the file or directory exists.
	 */
	async exists(filePath) {
		try {
			const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
			return fs.pathExists(absolutePath);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Gets information about a file or directory.
	 * @param {string} filePath - Path to the file or directory.
	 * @returns {Promise<Object>} A promise that resolves to an object containing file or directory information.
	 * @throws Will throw an error if the file or directory information cannot be retrieved.
	 */
	async stat(filePath) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

		// Check if the path exists
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

	/**
	 * Creates a directory at the specified path.
	 * @param {string} dirPath - Path where the directory should be created.
	 * @param {Object} [options] - Options for creating the directory.
	 * @param {boolean} [options.recursive=false] - Whether to create parent directories if they don't exist.
	 * @returns {Promise<boolean>} A promise that resolves to true if the directory was created successfully.
	 * @throws Will throw an error if the directory cannot be created.
	 */
	async createDirectory(dirPath, options = {}) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(dirPath);
		const { recursive = false } = options;

		// Check if the path already exists
		if (await fs.pathExists(absolutePath)) {
			const stats = await fs.stat(absolutePath);
			if (stats.isDirectory()) {
				return true; // Directory already exists
			} else {
				throw new Error(`Path ${dirPath} exists but is not a directory`);
			}
		}

		if (recursive) {
			await fs.ensureDir(absolutePath);
		} else {
			try {
				await fs.mkdir(absolutePath);
			} catch (error) {
				if (error.code === "ENOENT") {
					throw new Error(`Parent directory for ${dirPath} does not exist`);
				}
				throw error;
			}
		}

		return true;
	}

	/**
	 * Copies a file or directory.
	 * @param {string} source - Source path.
	 * @param {string} destination - Destination path.
	 * @param {Object} [options] - Options for copying.
	 * @param {boolean} [options.overwrite=false] - Whether to overwrite the destination if it exists.
	 * @returns {Promise<boolean>} A promise that resolves to true if the copy was successful.
	 * @throws Will throw an error if the copy operation fails.
	 */
	async copy(source, destination, options = {}) {
		const absoluteSource = this.relativeOrAbsolutePathToAbsolutePath(source);
		const absoluteDestination =
			this.relativeOrAbsolutePathToAbsolutePath(destination);
		const { overwrite = false } = options;

		// Check if the source exists
		if (!(await fs.pathExists(absoluteSource))) {
			throw new Error(`Source path ${source} does not exist`);
		}

		// Check if the destination exists and overwrite is not allowed
		if (!overwrite && (await fs.pathExists(absoluteDestination))) {
			throw new Error(`Destination path ${destination} already exists`);
		}

		await fs.copy(absoluteSource, absoluteDestination, { overwrite });
		return true;
	}
	/**
	 * Finds files matching a glob pattern.
	 * @param {string} pattern - The glob pattern to match.
	 * @param {Object} [options] - Options for glob matching.
	 * @param {(path: string) => boolean} [options.ig] - An ignore function to filter the results.
	 * @returns {Promise<Array<string>>} A promise that resolves to an array of matched file paths.
	 * @throws Will throw an error if the glob operation fails.
	 */
	async glob(pattern, { ig } = {}) {
		ig ??= await super.createIgnoreFilter();

		try {
			return glob
				.sync(pattern, {
					cwd: this.rootDirectory,
					dot: true,
					nodir: true,
					absolute: false,
				})
				.filter((file) => {
					return !ig(file);
				});
		} catch (error) {
			throw new Error(`Glob operation failed: ${error.message}`);
		}
	}

	/**
	 * Watches a directory for file changes using chokidar.
	 * @param {string} dir - The directory to watch.
	 * @param {Object} [options] - Watch options.
	 * @param {(path: string) => boolean} [ig] - An ignore function to filter the tree on
	 * @param {number} [options.pollInterval=1000] - Polling interval in milliseconds.
	 * @param {number} [options.stabilityThreshold=2000] - Stability threshold in milliseconds.
	 * @returns {Promise<import('chokidar').FSWatcher>} A promise that resolves to a chokidar FSWatcher instance
	 *   with methods like on('add', callback), on('change', callback), on('unlink', callback),
	 *   on('error', callback), on('ready', callback), and close().
	 * @throws Will throw an error if the directory cannot be watched.
	 */
	async watch(dir, { ig, pollInterval = 1000, stabilityThreshold = 2000 }) {
		ig ??= await super.createIgnoreFilter();
		const absolutePath = path.resolve(this.rootDirectory, dir);

		// Check if the directory exists
		if (!(await fs.pathExists(absolutePath))) {
			throw new Error(`Directory ${dir} does not exist`);
		}

		const cwd = path.relative(process.cwd(), this.rootDirectory);
		return chokidar.watch("./", {
			ignored: (file) => {
				if (file === "." || file === "./") return false;

				if (file.startsWith("./")) {
					file = file.substring(2);
				}

				/*if (file.startsWith(cwd)) {
       file = file.substring(cwd.length + 1);
      }*/
				return ig(file);
			},
			cwd: cwd,
			awaitWriteFinish: {
				stabilityThreshold,
				pollInterval,
			},
		});
	}
	/**
	 * Executes a shell command in the local filesystem.
	 * @param {string|string[]} command - The shell command to execute. Can be a string or array of [command, ...args].
	 * @param {Object} [options] - Options for executing the command.
	 * @param {number} [options.timeoutSeconds=60] - Timeout for the command in seconds.
	 * @param {Object} [options.env={}] - Environment variables for the command.
	 * @param {string} [options.workingDirectory=./] - Working directory for the command.
	 * @returns {Promise<{
	 *   ok: boolean,
	 *   stdout: string,
	 *   stderr: string,
	 *   exitCode: number
	 * }>} A promise that resolves to an object containing command execution results.
	 * @throws Will throw an error if the command cannot be executed.
	 */
	async executeCommand(command, options = {}) {
		const { timeoutSeconds = 60, env = {}, workingDirectory = "./" } = options;

		if (!command) {
			throw new Error("Command is required");
		}

		const cwd = this.relativeOrAbsolutePathToAbsolutePath(workingDirectory);

		// Validate the timeout value
		const timeout = Math.max(5, Math.min(timeoutSeconds || 60, 600));

		const execOpts = {
			cwd,
			env: { ...process.env, ...env },
			timeout: timeout * 1000,
			maxBuffer: 1024 * 1024,
		};

		try {
			let result;

			if (Array.isArray(command)) {
				// Command is an array [command, ...args] - arguments are already shell-escaped
				if (command.length === 0) {
					throw new Error("Command array cannot be empty");
				}
				const [cmd, ...args] = command;
				result = await execa(cmd, args, execOpts);
			} else {
				// Command is a string - use shell execution
				execOpts.shell = true;
				result = await execa(command, execOpts);
			}

			const { stdout, stderr, exitCode } = result;
			return {
				ok: true,
				exitCode: exitCode,
				stdout: stdout?.trim() || "",
				stderr: stderr?.trim() || "",
				error: null,
			};
		} catch (err) {
			return {
				ok: false,
				exitCode: typeof err.exitCode === "number" ? err.exitCode : 1,
				stdout: err.stdout?.trim() || "",
				stderr: err.stderr?.trim() || "",
				error: err.shortMessage || err.message, // Prefer shortMessage if available
			};
		}
	}
	/**
	 * Searches for a string pattern in files within the filesystem.
	 * @param {string} searchString - The string pattern to search for.
	 * @param {Object} [options] - Options for the grep operation.
	 * @param {Function} [options.ignoreFilter] - Function to filter ignored files.
	 * @param {Object} [options.includeContent] - Options for including content context.
	 * @param {number} [options.includeContent.linesBefore=0] - Number of lines to include before each match.
	 * @param {number} [options.includeContent.linesAfter=0] - Number of lines to include after each match.
	 * @returns {Promise<Array<{
	 *   file: string,
	 *   line: number,
	 *   match: string,
	 *   content: string | null
	 * }>>} A promise that resolves to an array of match objects.
	 * @throws Will throw an error if the search operation fails.
	 */
	async grep(searchString, options = {}) {
		const { ignoreFilter, includeContent = {} } = options;
		const { linesBefore = 0, linesAfter = 0 } = includeContent;

		if (!searchString) {
			throw new Error("Search string is required");
		}

		// Get all files recursively
		const allFiles = [];
		for await (const file of this.getDirectoryTree("", { ig: ignoreFilter })) {
			allFiles.push(path.join(this.rootDirectory, file));
		}

		// Filter files if ignoreFilter is provided
		const filesToSearch = ignoreFilter
			? allFiles.filter((file) => !ignoreFilter(file))
			: allFiles;

		const results = [];

		for (const file of filesToSearch) {
			try {
				const content = await this.getFile(
					path.relative(this.rootDirectory, file),
				);
				const lines = content.split("\n");

				for (let lineNum = 0; lineNum < lines.length; lineNum++) {
					const line = lines[lineNum];

					if (line.includes(searchString)) {
						const startLine = Math.max(0, lineNum - linesBefore);
						const endLine = Math.min(lines.length - 1, lineNum + linesAfter);

						let contextContent = null;
						if (linesBefore > 0 || linesAfter > 0) {
							contextContent = lines.slice(startLine, endLine + 1).join("\n");
						}

						results.push({
							file: path.relative(this.rootDirectory, file),
							line: lineNum + 1, // 1-based line numbers
							match: line,
							content: contextContent,
						});
					}
				}
			} catch (error) {}
		}

		return results;
	}

	/**
	 * Gets a directory tree, yielding files one by one.
	 * @abstract
	 * @async
	 * @generator
	 * @param {string} dir - Relative path to get the directory tree for
	 * @param {(path: string) => boolean} [ig] - An ignore function to filter the tree on
	 * @param {boolean = false} [recursive]- Whether to recursively fetch the directory tree. Default: true
	 * @yields {string} Each file in the directory tree
	 * @throws Will throw an error if the directory cannot be read.
	 */
	async *getDirectoryTree(dir, { ig, recursive = true } = {}) {
		ig ??= await super.createIgnoreFilter();

		const absoluteDir = path.resolve(this.rootDirectory, dir);
		// noinspection JSVoidFunctionReturnValueUsed
		const items = await fs.readdir(absoluteDir, { withFileTypes: true });

		for (const item of items) {
			const itemPath = path.join(absoluteDir, item.name);
			const relPath = path.relative(this.rootDirectory, itemPath);

			if (ig(relPath)) continue; // skip ignored files/dirs

			if (item.isDirectory()) {
				yield `${relPath}/`;
				if (recursive) {
					yield* this.getDirectoryTree(relPath, { ig });
				}
			} else {
				yield relPath;
			}
		}
	}

	/**
	 * Changes the permissions of a file.
	 * @param {string} filePath - Path to the file to change permissions for.
	 * @param {number} mode - The file mode (permissions) to set.
	 * @returns {Promise<boolean>} A promise that resolves to true if the permissions were changed successfully.
	 * @throws Will throw an error if the permissions cannot be changed.
	 */
	async chmod(filePath, mode) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);

		// Check if the path exists
		if (!(await fs.pathExists(absolutePath))) {
			throw new Error(`Path ${filePath} does not exist`);
		}

		try {
			await fs.chmod(absolutePath, mode);
			return true;
		} catch (error) {
			throw new Error(
				`Failed to change permissions for ${filePath}: ${error.message}`,
			);
		}
	}

	/**
	 * Changes the owner and group of a file.
	 * @param {string} filePath - Path to the file to change ownership for.
	 * @param {number} uid - User ID to set as the owner.
	 * @param {number} gid - Group ID to set as the group.
	 * @returns {Promise<boolean>} A promise that resolves to true if the ownership was changed successfully.
	 * @throws Will throw an error if the ownership cannot be changed.
	 */
	async chown(filePath, uid, gid) {
		const absolutePath = this.relativeOrAbsolutePathToAbsolutePath(filePath);
		// Check if the path exists
		if (!(await fs.pathExists(absolutePath))) {
			throw new Error(`Path ${filePath} does not exist`);
		}
		try {
			await fs.chown(absolutePath, uid, gid);
			return true;
		} catch (error) {
			throw new Error(
				`Failed to change ownership for ${filePath}: ${error.message}`,
			);
		}
	}
}
