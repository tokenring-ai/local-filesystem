import {TokenRingPlugin} from "@tokenring-ai/app";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import {FileSystemConfigSchema} from "@tokenring-ai/filesystem/schema";
import {z} from "zod";
import LocalFileSystemProvider, {LocalFileSystemProviderOptionsSchema} from "./LocalFileSystemProvider.js";
import packageJSON from './package.json' with {type: 'json'};

const packageConfigSchema = z.object({
  filesystem: FileSystemConfigSchema.optional()
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    if (config.filesystem) {
      app.waitForService(FileSystemService, fileSystemService => {
        for (const name in config.filesystem!.providers) {
          const provider = config.filesystem!.providers[name];
          if (provider.type === "local") {
            fileSystemService.registerFileSystemProvider(name, new LocalFileSystemProvider(LocalFileSystemProviderOptionsSchema.parse(provider)));
          }
        }
      });
    }
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
