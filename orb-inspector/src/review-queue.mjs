import { writeFile } from "node:fs/promises";

const PROTECTED_CATEGORIES = new Set([
  "path_or_protocol",
  "metadata_or_identifier",
  "third_party_component",
  "code_symbol",
  "runtime_token",
]);

const PLACEHOLDER_PATTERN = /%(?:\d+\$)?[-+#0 ']*\d*(?:\.\d+)?(?:hh|ll|h|l|j|z|t|L)?[A-Za-z@]|\{\{|\}\}|\\n|\\t|\$\d+/;

/**
 * 从翻译候选清单创建稳定的人工审查队列。
 *
 * 队列只筛选并标记候选，不翻译文本、不改写二进制，也不证明候选可由 UI 访问。
 */
export function buildReviewQueue(manifest, options = {}) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const includeUiOnly = options.includeUiOnly === true;
  const excludeProtected = options.excludeProtected !== false;
  const minLength = integerOption(options.minLength, 2);
  const maxLength = integerOption(options.maxLength, 240);
  const limit = integerOption(options.limit, 500);
  const includeCategories = normalizeSet(options.includeCategories);
  const excludeCategories = normalizeSet(options.excludeCategories);
  const includeRisks = normalizeSet(options.includeRisks);
  const excludeRisks = normalizeSet(options.excludeRisks);

  const selected = entries
    .map((entry) => normalizeEntry(entry, { minLength, maxLength }))
    .filter((entry) => entry.text_length >= minLength && entry.text_length <= maxLength)
    .filter((entry) => !includeUiOnly || entry.category === "ui_candidate")
    .filter((entry) => !excludeProtected || !entry.protected)
    .filter((entry) => includeCategories.size === 0 || includeCategories.has(entry.category))
    .filter((entry) => !excludeCategories.has(entry.category))
    .filter((entry) => includeRisks.size === 0 || includeRisks.has(entry.risk))
    .filter((entry) => !excludeRisks.has(entry.risk))
    .filter((entry) => entry.reviewable)
    .sort(compareQueueEntries)
    .slice(0, limit);

  const categoryCounts = countBy(selected, "category");
  const riskCounts = countBy(selected, "risk");
  const priorityCounts = countBy(selected, "priority");

  return {
    schema: "orb-inspector/review-queue/v0.1",
    generated_by: "orb-inspector",
    source: manifest?.source ?? null,
    target_language: manifest?.target_language ?? options.targetLanguage ?? "zh-CN",
    filter: {
      include_ui_only: includeUiOnly,
      exclude_protected: excludeProtected,
      min_length: minLength,
      max_length: maxLength,
      include_categories: [...includeCategories].sort(),
      exclude_categories: [...excludeCategories].sort(),
      include_risks: [...includeRisks].sort(),
      exclude_risks: [...excludeRisks].sort(),
      limit,
    },
    entries: selected,
    summary: {
      total: selected.length,
      categories: categoryCounts,
      risks: riskCounts,
      priorities: priorityCounts,
      truncated: selected.length < entries.length && selected.length === limit,
    },
    limitations: [
      "进入队列是启发式结果，不能证明候选会在应用中显示。",
      "默认排除受保护分类，因为标识符、路径和 Framework 字符串可能属于运行时契约。",
      "队列构建器没有应用或校验翻译。",
    ],
  };
}

function normalizeEntry(entry, bounds) {
  const text = String(entry?.text ?? entry?.value ?? "").trim();
  const category = String(entry?.category ?? "unknown");
  const risk = String(entry?.risk ?? "unknown");
  const hasPlaceholder = PLACEHOLDER_PATTERN.test(text);
  const protectedEntry = PROTECTED_CATEGORIES.has(category);
  const reviewable = entry?.review !== false && !entry?.translation;
  const priority = calculatePriority({
    category,
    risk,
    textLength: text.length,
    hasPlaceholder,
    protectedEntry,
    minLength: bounds.minLength,
    maxLength: bounds.maxLength,
  });

  return {
    id: entry?.id ?? null,
    text,
    translation: entry?.translation ?? null,
    category,
    risk,
    reason: entry?.reason ?? null,
    status: entry?.status ?? (entry?.translation ? "translated" : "untranslated"),
    source_index: entry?.source_index ?? null,
    source_location: entry?.source_location ?? null,
    text_length: text.length,
    has_placeholder: hasPlaceholder,
    protected: protectedEntry,
    reviewable,
    priority,
  };
}

function calculatePriority({ category, risk, textLength, hasPlaceholder, protectedEntry }) {
  if (protectedEntry) return "exclude";
  if (category === "ui_candidate" && risk === "translate" && !hasPlaceholder && textLength <= 80) {
    return "high";
  }
  if (hasPlaceholder || category === "formatted_message" || risk === "review") return "medium";
  return "low";
}

function compareQueueEntries(left, right) {
  const rank = { high: 0, medium: 1, low: 2, exclude: 3 };
  return (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9) ||
    left.category.localeCompare(right.category) ||
    left.text.localeCompare(right.text) ||
    String(left.id).localeCompare(String(right.id));
}

function countBy(entries, field) {
  const counts = {};
  for (const entry of entries) counts[entry[field]] = (counts[entry[field]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function normalizeSet(value) {
  if (value === undefined || value === null) return new Set();
  const values = Array.isArray(value) ? value : [value];
  return new Set(values.map((item) => String(item).trim()).filter(Boolean));
}

function integerOption(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export async function writeReviewQueue(queue, outputPath) {
  await writeFile(outputPath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}
