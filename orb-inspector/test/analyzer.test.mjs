import test from "node:test";
import assert from "node:assert/strict";
import { classifyResourcePaths } from "../src/analyzer.mjs";

test("分类标准 macOS 本地化和 UI 资源", () => {
  const result = classifyResourcePaths([
    "Contents/Resources/en.lproj/Localizable.strings",
    "Contents/Resources/Assets.car",
    "Contents/Resources/main.js",
    "Contents/Resources/app.asar",
    "Contents/Frameworks/Sparkle.framework/Resources/SUStatus.nib",
    "Contents/MacOS/App",
  ]);

  assert.deepEqual(result.localizationDirectories, ["Contents/Resources/en.lproj/Localizable.strings"]);
  assert.deepEqual(result.localizationFiles, ["Contents/Resources/en.lproj/Localizable.strings"]);
  assert.deepEqual(result.javascriptOrWebFiles, ["Contents/Resources/main.js", "Contents/Resources/app.asar"]);
  assert.deepEqual(result.interfaceBuilderFiles, ["Contents/Frameworks/Sparkle.framework/Resources/SUStatus.nib"]);
  assert.deepEqual(result.assetCatalogs, ["Contents/Resources/Assets.car"]);
});
