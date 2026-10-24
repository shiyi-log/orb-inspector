import { writeFile } from "node:fs/promises";

const PLACEHOLDER_PATTERN = /%(?:\d+\$)?[-+#0 ']*\d*(?:\.\d+)?(?:hh|ll|h|l|j|z|t|L)?[A-Za-z@]|\{\{[^{}]*\}\}|\\[nt]|\$\d+/g;

/**
 * 根据一份候选清单校验翻译映射。
 *
 * 支持的映射形式：
 *   { "candidate-id": "翻译文本" }
 *   { "candidate-id": { "translation": "翻译文本", "text": "源文本" } }
 *   [{ "id": "candidate-id", "translation": "翻译文本" }]
 *   [{ "text": "源文本", "translation": "翻译文本" }]
 *
 * 校验只检查结构，不写入应用 Bundle，也不证明目标应用会显示候选文本。
 */
export function validateTranslationMap(manifest, translationMap, options = {}) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const byId = new Map(entries.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  const byText = new Map();
  for (const entry of entries) {
    if (typeof entry?.text !== "string") continue;
    const list = byText.get(entry.text) ?? [];
    list.push(entry);
    byText.set(entry.text, list);
  }

  const mappings = normalizeMappings(translationMap);
  const seenReferences = new Map();
  const diagnostics = [];
  const results = [];

  for (const mapping of mappings) {
    const candidate = resolveCandidate(mapping, byId, byText);
    const itemDiagnostics = [];
    if (!candidate) {
      itemDiagnostics.push(diagnostic(
        mapping.id || mapping.text ? "unknown_candidate" : "missing_candidate_reference",
        "error",
        "翻译映射无法唯一解析到候选条目。",
        mapping,
      ));
    } else {
      const referenceKey = candidate.id;
      seenReferences.set(referenceKey, (seenReferences.get(referenceKey) ?? 0) + 1);

      if (mapping.text !== undefined && mapping.text !== candidate.text) {
        itemDiagnostics.push(diagnostic(
          "source_text_mismatch",
          "error",
          "映射中的源文本与 ID 对应的候选文本不一致。",
          { expected: candidate.text, actual: mapping.text },
        ));
      }

      if (typeof mapping.translation !== "string") {
        itemDiagnostics.push(diagnostic("missing_translation", "error", "没有提供翻译文本。"));
      } else if (mapping.translation.trim().length === 0) {
        itemDiagnostics.push(diagnostic("empty_translation", "error", "翻译为空或只包含空白字符。"));
      } else {
        const sourcePlaceholders = placeholderCounts(candidate.text);
        const translationPlaceholders = placeholderCounts(mapping.translation);
        if (!sameCounts(sourcePlaceholders, translationPlaceholders)) {
          itemDiagnostics.push(diagnostic(
            "placeholder_mismatch",
            "error",
            "格式化占位符和转义序列必须完全保留。",
            { expected: sourcePlaceholders, actual: translationPlaceholders },
          ));
        }
        if (mapping.translation === candidate.text) {
          itemDiagnostics.push(diagnostic(
            "translation_same_as_source",
            "warning",
            "翻译与源文本完全相同。",
          ));
        }
      }
    }

    const item = {
      id: mapping.id ?? candidate?.id ?? null,
      source_text: mapping.text ?? candidate?.text ?? null,
      candidate_text: candidate?.text ?? null,
      translation: mapping.translation ?? null,
      valid: !itemDiagnostics.some((entry) => entry.severity === "error"),
      diagnostics: itemDiagnostics,
    };
    results.push(item);
    diagnostics.push(...itemDiagnostics);
  }

  for (const [id, count] of seenReferences) {
    if (count > 1) {
      const item = diagnostic(
        "duplicate_candidate_reference",
        "warning",
        `候选 ${id} 在翻译映射中被引用了 ${count} 次。`,
        { id, count },
      );
      diagnostics.push(item);
      const result = results.filter((entry) => entry.id === id);
      for (const entry of result) entry.diagnostics.push(item);
    }
  }

  const errorCount = diagnostics.filter((entry) => entry.severity === "error").length;
  const warningCount = diagnostics.filter((entry) => entry.severity === "warning").length;
  return {
    schema: "orb-inspector/translation-validation/v0.1",
    source: manifest?.source ?? options.source ?? null,
    target_language: manifest?.target_language ?? options.targetLanguage ?? "zh-CN",
    valid: errorCount === 0,
    entries: results,
    diagnostics,
    summary: {
      mappings: mappings.length,
      valid: results.filter((entry) => entry.valid).length,
      invalid: results.filter((entry) => !entry.valid).length,
      errors: errorCount,
      warnings: warningCount,
    },
    limitations: [
      "校验只根据保留的候选证据检查翻译映射。",
      "有效映射不能证明字符串可由运行时 UI 访问。",
      "此操作不会修改二进制或应用文件。",
    ],
  };
}

export function normalizeMappings(translationMap) {
  if (Array.isArray(translationMap)) {
    return translationMap.map((mapping) => normalizeMapping(mapping));
  }
  if (!translationMap || typeof translationMap !== "object") return [];
  return Object.entries(translationMap).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return normalizeMapping({ ...value, id: value.id ?? key });
    }
    return normalizeMapping({ id: key, translation: value });
  });
}

export function extractPlaceholders(text) {
  return placeholderCounts(String(text ?? ""));
}

export async function writeValidationReport(report, outputPath) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function normalizeMapping(mapping) {
  if (typeof mapping === "string") return { text: mapping, translation: null };
  if (!mapping || typeof mapping !== "object") return { translation: mapping };
  return {
    id: typeof mapping.id === "string" ? mapping.id : undefined,
    text: typeof mapping.text === "string"
      ? mapping.text
      : typeof mapping.source === "string"
        ? mapping.source
        : undefined,
    translation: typeof mapping.translation === "string"
      ? mapping.translation
      : typeof mapping.target === "string"
        ? mapping.target
        : mapping.translation,
  };
}

function resolveCandidate(mapping, byId, byText) {
  if (mapping.id) {
    const candidate = byId.get(mapping.id);
    return candidate ?? null;
  }
  if (mapping.text) {
    const matches = byText.get(mapping.text) ?? [];
    return matches.length === 1 ? matches[0] : null;
  }
  return null;
}

function placeholderCounts(text) {
  const counts = {};
  for (const token of String(text ?? "").match(PLACEHOLDER_PATTERN) ?? []) {
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}

function sameCounts(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function diagnostic(code, severity, message, details = undefined) {
  return {
    code,
    severity,
    message,
    ...(details === undefined ? {} : { details }),
  };
}
