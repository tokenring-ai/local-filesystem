import TokenRingApp from "@tokenring-ai/app";
import {FileSystemConfigSchema} from "@tokenring-ai/filesystem";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import {TokenRingPlugin} from "@tokenring-ai/app";
import LocalFileSystemProvider, {LocalFileSystemProviderOptionsSchema} from "./LocalFileSystemProvider.js";
import packageJSON from './package.json' with {type: 'json'};


export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    const filesystemConfig = app.getConfigSlice("filesystem", FileSystemConfigSchema);

    if (filesystemConfig) {
      app.waitForService(FileSystemService, fileSystemService => {
        for (const name in filesystemConfig.providers) {
          const provider = filesystemConfig.providers[name];
          if (provider.type === "local") {
            fileSystemService.registerFileSystemProvider(name, new LocalFileSystemProvider(LocalFileSystemProviderOptionsSchema.parse(provider)));
          }
        }
      });
    }
  }
} satisfies TokenRingPlugin;
