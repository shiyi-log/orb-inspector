import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyResourcePaths,
  inspectLocalizationResources,
  parseStringsContent,
  parseStringsDictContent,
} from "../src/analyzer.mjs";

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

test("解析 strings 键值、转义文本并保留语法错误摘要", () => {
  const result = parseStringsContent(`/* 注释 */\n"hello" = "你好 \\%@";\n"broken" = "缺少分号"\n"after" = "仍可解析";`);

  assert.equal(result.format, "strings");
  assert.equal(result.entry_count, 2);
  assert.deepEqual(result.entries, [
    { key: "hello", value: "你好 %@" },
    { key: "after", value: "仍可解析" },
  ]);
  assert.equal(result.syntax_errors.length, 1);
  assert.equal(result.syntax_errors[0].code, "expected-semicolon");
});

test("解析 stringsdict 顶层键并报告 plist 结构错误", () => {
  const result = parseStringsDictContent(`<?xml version="1.0"?><plist><dict><key>items</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@items@</string></dict></dict></plist>`);

  assert.equal(result.format, "stringsdict");
  assert.equal(result.entry_count, 1);
  assert.deepEqual(result.entries, [{ key: "items", value: null }]);
  assert.deepEqual(result.syntax_errors, []);

  const malformed = parseStringsDictContent("<plist><dict><key>items</dict></plist>");
  assert.ok(malformed.syntax_errors.some((error) => error.code === "unclosed-key"));
});

test("将本地化解析结果接入稳定的语言和格式汇总", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-inspector-localization-"));
  const english = join(root, "Contents/Resources/en.lproj");
  const chinese = join(root, "Contents/Resources/zh-Hans.lproj");
  await mkdir(english, { recursive: true });
  await mkdir(chinese, { recursive: true });
  await writeFile(join(english, "Localizable.strings"), '"hello" = "Hello";\n', "utf8");
  await writeFile(join(chinese, "Localizable.stringsdict"), '<plist><dict><key>items</key><dict/></dict></plist>', "utf8");

  const report = await inspectLocalizationResources(root, [
    "Contents/Resources/en.lproj/Localizable.strings",
    "Contents/Resources/zh-Hans.lproj/Localizable.stringsdict",
  ]);

  assert.equal(report.schema, "orb-inspector/localization-v0.1");
  assert.equal(report.summary.file_count, 2);
  assert.equal(report.summary.parsed_file_count, 2);
  assert.equal(report.summary.entry_count, 2);
  assert.deepEqual(report.summary.languages, ["en", "zh-Hans"]);
  assert.deepEqual(report.summary.language_counts, { en: 1, "zh-Hans": 1 });
  assert.deepEqual(report.summary.format_counts, { strings: 1, stringsdict: 1 });
  assert.equal(report.summary.syntax_error_count, 0);
  assert.equal(report.files[0].read_error, null);
});

test("拒绝越出 Bundle 的本地化路径并保留读取错误", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-inspector-localization-boundary-"));
  await mkdir(join(root, "Contents/Resources/zh-Hans.lproj"), { recursive: true });
  await writeFile(join(root, "Contents/Resources/zh-Hans.lproj/Localizable.strings"), '"hello" = "你好";\n', "utf8");

  const report = await inspectLocalizationResources(root, [
    "Contents/Resources/zh-Hans.lproj/Localizable.strings",
    "../outside.lproj/Localizable.strings",
    "Contents/Resources/zh-Hans.lproj/missing.strings",
  ]);

  assert.equal(report.summary.parsed_file_count, 1);
  assert.equal(report.summary.read_error_count, 2);
  assert.match(report.files[1].read_error.detail, /Bundle/);
  assert.equal(report.files[2].read_error.code, "read-failed");
});

test("按 BOM 解析 UTF-16 本地化资源并保留编码", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-inspector-localization-utf16-"));
  const languageDirectory = join(root, "Contents/Resources/zh-Hans.lproj");
  await mkdir(languageDirectory, { recursive: true });
  const content = Buffer.from('"hello" = "你好";\n', "utf16le");
  await writeFile(join(languageDirectory, "Localizable.strings"), Buffer.concat([Buffer.from([0xff, 0xfe]), content]));

  const report = await inspectLocalizationResources(root, [
    "Contents/Resources/zh-Hans.lproj/Localizable.strings",
  ]);

  assert.equal(report.files[0].encoding, "utf-16le");
  assert.deepEqual(report.files[0].entries, [{ key: "hello", value: "你好" }]);
  assert.equal(report.files[0].read_error, null);
});
