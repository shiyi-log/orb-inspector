import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const PATH_OR_PROTOCOL = /(?:^|\b)(?:https?:\/\/|[A-Za-z0-9+.-]+:\/\/|(?:com|io|org|dev)\.[A-Za-z0-9_.-]+|(?:\/|~\/|@rpath\/|@executable_path\/))/i;
const CODE_LOCATION = /(?:^|[\s/])(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:swift|m|mm|h|c|cpp|rs|go|ts|js)(?::|$)/i;
const SOURCE_FILENAME = /^(?:[A-Za-z0-9_-]+\.)+(?:c|cc|cpp|cxx|h|hh|hpp|m|mm|swift|rs|go|ts|js|inc|ipp)(?::\d+(?::\d+)?)?$/i;
const FORMAT_PLACEHOLDER = /%(?:\d+\$)?[-+#0 ']*\d*(?:\.\d+)?(?:hh|ll|h|l|j|z|t|L)?[A-Za-z@]|\{\{|\}\}|\\n|\\t|\$\d+/;
const METADATA = /^(?:com|io|org|dev)\.[A-Za-z0-9_.-]+$|^(?:docker|kubernetes|containerd)[._:-]/i;
const ERROR_PREFIX = /^(?:failed|error|invalid|unable|cannot|could not|unknown|warning|permission denied|no running|not found|missing)\b/i;
const THIRD_PARTY = /\b(?:sparkle|updater|sentry|swiftprotobuf|boringssl|openssl|crashpad)\b/i;
const CODE_SYMBOL = /^[_$][A-Za-z0-9_.$:<>(),?\-\s{}]*$/;
const RUNTIME_TOKEN = /^(?:-{1,2}\s?[A-Za-z]|-{3,}|[A-Z0-9_]{2,}(?:-[A-Z0-9_]+)+)/;
const TECHNICAL_LITERAL = /^[^A-Za-z0-9]|[{}[\]();=<>]/;
const NUMERIC_OR_TYPE_LITERAL = /^(?:0x[0-9a-f]+|[0-9a-f]{16,}|\d+(?:\.\d+){2,}|\d+-bit\b|\d+\s*$)/i;
const NETWORK_OR_UUID = /(?:\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)/i;
const ENCODED_TOKEN = /^(?=.{24,}$)(?=[A-Za-z0-9+/_=-]+$)(?=.*[0-9+/_=-])[A-Za-z0-9+/_=-]+$/;
const ENCODED_ALPHA_TOKEN = /^(?=.{32,}$)(?=[A-Za-z]+$)(?=.*[A-Z]{2})[A-Za-z]+$/;
const IDENTIFIER_TOKEN = /^(?:[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+|[a-z]+(?:[A-Z][A-Za-z0-9]*)+|[A-Z][a-z]+(?:[A-Z][A-Za-z0-9]*){2,}|[A-Z]{2,}[A-Za-z0-9]*)$/;
const TECHNICAL_WORD = /^(?:abnormal|accepted|architecture|array(?:ed)?|attribute|attachment|attachments|authority|acceptable|algorithm|anchor|attachable)$/i;
const IPV6_LITERAL = /^(?=(?:.*:){2,})[0-9a-f:]+$/i;
const SYSTEM_DIAGNOSTIC = /\b(?:Mach-O|kernel|profiler|descriptor|ledger|launchd|sandboxed? login item|login item|app bundle|macOS update|sealed resource|security compromise|compromise|certificate chain|root store|Sec(?:Key|Code|StaticCode)|OCSP|ASN\.?1|PEM|kqueue|kevent|signal stack|crash report|MessagePack|SwiftNIO|NIOSSL|event loop|property list|helper tool|XPC|Sentry|tracer|envelope|software interrupt|range error|cached session|resource shortage|system resource|signalled thread|channel that isn't active|service has finished unexpectedly|bug that prevents .* working|transaction with a profile|thread is attempting|thread state|algorithm mismatch|PKCS#8|ANR|App Hang|Environment's value|Actual value is exactly|jmp_buf|processor set|semaphore|encoded as data|AsyncSequence|access denied|sandboxed|verification failure|exception port|security privilege|entitlement|certificate|issuer serial number)\b/i;

/**
 * 根据提取出的字符串创建稳定的翻译候选清单。
 * 函数只分类文本，不宣称字符串一定可由 UI 访问，也不宣称它可以安全替换
 * 已签名应用中的内容。
 */
export function createTranslationManifest(candidates, options = {}) {
  const source = Array.isArray(candidates) ? candidates : [];
  const entries = source
    .map((candidate, sourceIndex) => normalizeCandidate(candidate, sourceIndex, options))
    .filter((candidate) => candidate.text.length > 0)
    .sort(compareEntries);

  const counts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.category))].sort().map((category) => [
      category,
      entries.filter((entry) => entry.category === category).length,
    ]),
  );
  const riskCounts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.risk))].sort().map((risk) => [
      risk,
      entries.filter((entry) => entry.risk === risk).length,
    ]),
  );

  return {
    schema: "orb-inspector/translation-candidates/v0.1",
    generated_by: "orb-inspector",
    source: options.source ?? null,
    target_language: options.targetLanguage ?? "zh-CN",
    entries,
    summary: {
      total: entries.length,
      categories: counts,
      risks: riskCounts,
      translated: entries.filter((entry) => entry.status === "translated").length,
      pending: entries.filter((entry) => entry.status === "untranslated").length,
    },
    limitations: [
      "候选只是静态字符串观察结果，应用可能不会显示它。",
      "风险分类是启发式结果，生成任何翻译补丁前都需要人工审查。",
      "格式解析器提供的二进制偏移会被保留；缺失偏移保持未知。",
    ],
  };
}

function normalizeCandidate(candidate, sourceIndex, options) {
  const text = typeof candidate === "string" ? candidate.trim() : String(candidate?.text ?? candidate?.value ?? "").trim();
  const sourceLocation = typeof candidate === "object" && candidate !== null
    ? candidate.source_location ?? candidate.location ?? null
    : null;
  const sourceEvidence = typeof candidate === "object" && candidate !== null
    ? candidate.source_evidence ?? null
    : null;
  const classification = classifyCandidate(text, sourceLocation);
  const translated = typeof candidate === "object" && candidate !== null && typeof candidate.translation === "string"
    ? candidate.translation
    : null;
  return {
    id: candidateId(text, sourceLocation),
    text,
    translation: translated,
    category: classification.category,
    risk: classification.risk,
    reason: classification.reason,
    status: translated ? "translated" : "untranslated",
    source_index: sourceIndex,
    source_location: sourceLocation,
    source_evidence: sourceEvidence,
    review: classification.review,
    target_language: options.targetLanguage ?? "zh-CN",
  };
}

function classifyCandidate(text, sourceLocation) {
  if (text.length < 2) {
    return { category: "too_short", risk: "do-not-translate", reason: "过短字符串含义不明确。", review: true };
  }
  if (METADATA.test(text)) {
    return { category: "metadata_or_identifier", risk: "do-not-translate", reason: "看起来像 Docker、Kubernetes 或 Bundle 标识符。", review: false };
  }
  if (PATH_OR_PROTOCOL.test(text) || CODE_LOCATION.test(text) || SOURCE_FILENAME.test(text)) {
    return { category: "path_or_protocol", risk: "do-not-translate", reason: "包含路径、URL、协议方案或源文件位置。", review: false };
  }
  if (CODE_SYMBOL.test(text) || /^[_$].*[():{}]/.test(text)) {
    return { category: "code_symbol", risk: "do-not-translate", reason: "看起来像原生符号、方法签名或编译器生成名称。", review: false };
  }
  if (
    RUNTIME_TOKEN.test(text) ||
    /^[_$]/.test(text) ||
    TECHNICAL_LITERAL.test(text) ||
    NUMERIC_OR_TYPE_LITERAL.test(text) ||
    NETWORK_OR_UUID.test(text) ||
    ENCODED_TOKEN.test(text) ||
    ENCODED_ALPHA_TOKEN.test(text) ||
    (text.length >= 8 && IDENTIFIER_TOKEN.test(text)) ||
    TECHNICAL_WORD.test(text) ||
    IPV6_LITERAL.test(text)
  ) {
    return { category: "runtime_token", risk: "do-not-translate", reason: "看起来像命令行参数、分隔符、运行时令牌或私有符号。", review: false };
  }
  if (THIRD_PARTY.test(text)) {
    return { category: "third_party_component", risk: "review", reason: "可能属于内置 Framework 或更新器。", review: true };
  }
  if (FORMAT_PLACEHOLDER.test(text)) {
    return { category: "formatted_message", risk: "review", reason: "包含格式化占位符或转义序列。", review: true };
  }
  if (SYSTEM_DIAGNOSTIC.test(text)) {
    return { category: "diagnostic_or_status", risk: "review", reason: "更像系统、Framework、安全组件或运行时诊断，而不是主界面文案。", review: true };
  }
  if (ERROR_PREFIX.test(text)) {
    return { category: "diagnostic_or_status", risk: "review", reason: "看起来像错误、警告、状态或诊断消息。", review: true };
  }
  if (sourceLocation?.framework || sourceLocation?.owner === "framework") {
    return { category: "third_party_component", risk: "review", reason: "源元数据将该候选标记为 Framework 所有。", review: true };
  }
  return { category: "ui_candidate", risk: "translate", reason: "可读短语，未发现标识符或格式化标记。", review: true };
}

function candidateId(text, sourceLocation) {
  return createHash("sha256")
    .update(JSON.stringify({ text, sourceLocation }))
    .digest("hex")
    .slice(0, 16);
}

function compareEntries(left, right) {
  return left.category.localeCompare(right.category) ||
    left.text.localeCompare(right.text) ||
    left.id.localeCompare(right.id);
}

export async function writeTranslationManifest(manifest, outputPath) {
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function classifyTranslationCandidate(text, sourceLocation = null) {
  return classifyCandidate(String(text ?? "").trim(), sourceLocation);
}
