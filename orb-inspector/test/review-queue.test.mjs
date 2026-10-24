import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewQueue } from "../src/review-queue.mjs";

test("构建仅含 UI 候选的队列并排除受保护候选", () => {
  const queue = buildReviewQueue({
    source: "fixture",
    target_language: "zh-CN",
    entries: [
      { id: "ui", text: "Enable Kubernetes", category: "ui_candidate", risk: "translate", review: true },
      { id: "path", text: "docker/container-logs/", category: "path_or_protocol", risk: "do-not-translate", review: false },
      { id: "id", text: "com.docker.compose.project", category: "metadata_or_identifier", risk: "do-not-translate", review: false },
      { id: "format", text: "Open %d containers", category: "formatted_message", risk: "review", review: true },
      { id: "translated", text: "Already translated", category: "ui_candidate", risk: "translate", translation: "已经翻译", review: true },
    ]
  }, { includeUiOnly: false, excludeProtected: true, limit: 20 });

  assert.deepEqual(queue.entries.map((entry) => entry.id), ["ui", "format"]);
  assert.equal(queue.entries[0].priority, "high");
  assert.equal(queue.entries[1].has_placeholder, true);
  assert.deepEqual(queue.summary.categories, { formatted_message: 1, ui_candidate: 1 });
});

test("支持分类和长度筛选", () => {
  const queue = buildReviewQueue({
    entries: [
      { id: "short", text: "OK", category: "ui_candidate", risk: "translate", review: true },
      { id: "long", text: "A very long text that should remain outside a compact review queue", category: "ui_candidate", risk: "translate", review: true },
      { id: "diag", text: "Failed to load", category: "diagnostic_or_status", risk: "review", review: true },
    ]
  }, { includeCategories: ["ui_candidate"], minLength: 3, maxLength: 20 });

  assert.deepEqual(queue.entries.map((entry) => entry.id), []);
  assert.equal(queue.filter.include_categories[0], "ui_candidate");
});
