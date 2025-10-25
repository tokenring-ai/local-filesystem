import {AgentTeam, TokenRingPackage} from "@tokenring-ai/agent";
import {FileSystemConfigSchema} from "@tokenring-ai/filesystem";
import FileSystemService from "@tokenring-ai/filesystem/FileSystemService";
import LocalFileSystemProvider, {LocalFileSystemProviderOptionsSchema} from "./LocalFileSystemProvider.js";
import packageJSON from './package.json' with {type: 'json'};

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(agentTeam: AgentTeam) {
    const filesystemConfig = agentTeam.getConfigSlice("filesystem", FileSystemConfigSchema);

    if (filesystemConfig) {
      agentTeam.waitForService(FileSystemService, fileSystemService => {
        for (const name in filesystemConfig.providers) {
          const provider = filesystemConfig.providers[name];
          if (provider.type === "local") {
            fileSystemService.registerFileSystemProvider(name, new LocalFileSystemProvider(LocalFileSystemProviderOptionsSchema.parse(provider)));
          }
        }
      });
    }
  }
} as TokenRingPackage;

export {default as LocalFileSystemService} from "./LocalFileSystemProvider.ts";
