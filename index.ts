import packageJSON from './package.json' with {type: 'json'};

export const name = packageJSON.name;
export const version = packageJSON.version;
export const description = packageJSON.description;

export { default as LocalFileSystemService } from "./LocalFileSystemService.ts";
