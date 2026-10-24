import test from "node:test";
import assert from "node:assert/strict";
import { classifyTranslationCandidate, createTranslationManifest } from "../src/candidates.mjs";

test("按替换风险分类翻译候选", () => {
  assert.equal(classifyTranslationCandidate("Enable Kubernetes").category, "ui_candidate");
  assert.equal(classifyTranslationCandidate("docker/container-logs/").risk, "do-not-translate");
  assert.equal(classifyTranslationCandidate("Failed to load USB devices").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("Open %d containers").risk, "review");
  assert.equal(classifyTranslationCandidate("Sparkle update").category, "third_party_component");
  assert.equal(classifyTranslationCandidate("_execute(request:delegate:eventLoop:)").category, "code_symbol");
  assert.equal(classifyTranslationCandidate("--all-containers=true").category, "runtime_token");
  assert.equal(classifyTranslationCandidate(", bufferedYieldIDs:").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("0x%016llx").category, "formatted_message");
  assert.equal(classifyTranslationCandidate("16-bit integer literal").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("0wAA1AAA1gAA1wAA2gAA2wAA3QAA3gAA4gAA5AAA6AAA6wAA8AAA8wAA9wAA+gAA").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("AANcAAPDAAPQZAAAZwAAaAAAagAAawAAcQAAdAAAeAAAfgAAhwAAjgAAmgAAqQAA").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("aes-128-gcm").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("activityMonitorUpdateFrequency").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("a_int.cc").category, "path_or_protocol");
  assert.equal(classifyTranslationCandidate("A blessed helper tool must be a Mach-O executable file").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("A resource shortage prevented the kernel from allocating a message buffer.").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("A login item must be an app bundle.").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("A sealed resource is missing or invalid").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("AACompromise").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("AcceptBackOffHandler").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("acceptableResponses").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("abnormal").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("access denied").category, "diagnostic_or_status");
  assert.equal(classifyTranslationCandidate("2001:db8:0:0:0:0:0:1").category, "runtime_token");
  assert.equal(classifyTranslationCandidate("Welcome to OrbStack").category, "ui_candidate");
});

test("创建稳定清单并保留已有翻译的条目", () => {
  const manifest = createTranslationManifest([
    "No running machines",
    { text: "Enable Kubernetes", translation: "启用 Kubernetes" },
    "com.docker.compose.project",
  ], { source: "OrbStack 2.2.5", targetLanguage: "zh-CN" });

  assert.equal(manifest.schema, "orb-inspector/translation-candidates/v0.1");
  assert.equal(manifest.summary.total, 3);
  assert.equal(manifest.summary.translated, 1);
  assert.equal(manifest.summary.pending, 2);
  assert.deepEqual(manifest.entries.map((entry) => entry.text), [
    "No running machines",
    "com.docker.compose.project",
    "Enable Kubernetes",
  ]);
  assert.equal(manifest.entries[2].translation, "启用 Kubernetes");
});

test("保留独立的源证据而不改变候选 ID", () => {
  const input = {
    text: "Enable Kubernetes",
    source_location: { file_offset: 100, virtual_address: 0x1000, section: "__cstring" },
    source_evidence: {
      byte_start: 100,
      byte_end: 117,
      byte_length: 17,
      raw_length: 17,
      encoding: "ascii",
      truncated: false,
      references: [],
      reference_count: 0,
    },
  };
  const first = createTranslationManifest([input], { source: "fixture" });
  const second = createTranslationManifest([{ ...input, source_evidence: { ...input.source_evidence, reference_count: 2 } }], { source: "fixture" });

  assert.deepEqual(first.entries[0].source_evidence, input.source_evidence);
  assert.equal(first.entries[0].id, second.entries[0].id);
});
