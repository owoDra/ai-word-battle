import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setEntryPoint("src/index.ts");
// 同梱の chrome-headless-shell は macOS 14 だと起動直後に固まるため、インストール済みの Chrome を使う
Config.setBrowserExecutable("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
