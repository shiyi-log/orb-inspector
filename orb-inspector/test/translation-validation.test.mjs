import test from "node:test";
import assert from "node:assert/strict";
import { extractPlaceholders, validateTranslationMap } from "../src/translation-validation.mjs";

const manifest = {
  schema: "orb-inspector/translation-candidates/v0.1",
  source: "fixture",
  target_language: "zh-CN",
  entries: [
    { id: "hello", text: "Hello %@", category: "formatted_message" },
    { id: "world", text: "Enable Kubernetes", category: "ui_candidate" },
  ],
};

test("保留并比较格式化占位符", () => {
  assert.deepEqual(extractPlaceholders("Hello %@\\n%d %016llx"), { "%@": 1, "\\n": 1, "%d": 1, "%016llx": 1 });
  const report = validateTranslationMap(manifest, {
    hello: { text: "Hello %@", translation: "你好 %d" },
    world: "启用 Kubernetes",
  });
  assert.equal(report.valid, false);
  assert.ok(report.diagnostics.some((item) => item.code === "placeholder_mismatch"));
});

test("拒绝未知 ID、源文本不匹配和空翻译", () => {
  const report = validateTranslationMap(manifest, [
    { id: "missing", translation: "不存在" },
    { id: "world", text: "Wrong source", translation: "启用" },
    { id: "hello", translation: "  " },
  ]);
  assert.equal(report.summary.invalid, 3);
  assert.ok(report.diagnostics.some((item) => item.code === "unknown_candidate"));
  assert.ok(report.diagnostics.some((item) => item.code === "source_text_mismatch"));
  assert.ok(report.diagnostics.some((item) => item.code === "empty_translation"));
});

test("仅在源文本唯一时解析该文本", () => {
  const report = validateTranslationMap(manifest, [{ text: "Enable Kubernetes", translation: "启用 Kubernetes" }]);
  assert.equal(report.valid, true);
  assert.equal(report.summary.valid, 1);
});
