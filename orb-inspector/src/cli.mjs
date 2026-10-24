#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { analyzeInput, writeReport } from "./analyzer.mjs";
import { writeTranslationManifest } from "./candidates.mjs";
import { buildReviewQueue, writeReviewQueue } from "./review-queue.mjs";
import { validateTranslationMap, writeValidationReport } from "./translation-validation.mjs";

const args = process.argv.slice(2);
const command = args.shift();

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(command ? 0 : 1);
}

try {
  if (command === "analyze") await runAnalyze(args);
  else if (command === "review") await runReview(args);
  else if (command === "validate") await runValidate(args);
  else {
    console.error(`未知命令：${command}`);
    printHelp();
    process.exit(1);
  }
} catch (error) {
  console.error(`执行失败：${error?.message ?? error}`);
  process.exit(1);
}

async function runAnalyze(args) {
  const input = args.shift();
  if (!input) throw new Error("缺少 .app 或 .dmg 路径");

  let outputPath;
  let candidatesOutputPath;
  let strings = true;
  let assets = true;
  let candidates = true;
  let targetLanguage = "zh-CN";
  let maxStrings = 2000;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out") outputPath = requiredValue(args, ++index, "--out");
    else if (args[index] === "--candidates-out") candidatesOutputPath = requiredValue(args, ++index, "--candidates-out");
    else if (args[index] === "--max-strings") maxStrings = Number(requiredValue(args, ++index, "--max-strings"));
    else if (args[index] === "--no-strings") strings = false;
    else if (args[index] === "--no-assets") assets = false;
    else if (args[index] === "--no-candidates") candidates = false;
    else if (args[index] === "--target-language") targetLanguage = requiredValue(args, ++index, "--target-language");
    else throw new Error(`未知选项：${args[index]}`);
  }

  const report = await analyzeInput(input, { strings, assets, candidates, targetLanguage, maxStrings });
  if (outputPath) {
    await writeReport(report, outputPath);
    console.error(`已写入 ${outputPath}`);
  }
  if (candidatesOutputPath && report.target?.translation_candidates) {
    await writeTranslationManifest(report.target.translation_candidates, candidatesOutputPath);
    console.error(`已写入 ${candidatesOutputPath}`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function runReview(args) {
  const manifestPath = args.shift();
  if (!manifestPath) throw new Error("缺少翻译候选清单路径");

  let outputPath;
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out") outputPath = requiredValue(args, ++index, "--out");
    else if (args[index] === "--ui-only") options.includeUiOnly = true;
    else if (args[index] === "--include-protected") options.excludeProtected = false;
    else if (args[index] === "--limit") options.limit = Number(requiredValue(args, ++index, "--limit"));
    else if (args[index] === "--min-length") options.minLength = Number(requiredValue(args, ++index, "--min-length"));
    else if (args[index] === "--max-length") options.maxLength = Number(requiredValue(args, ++index, "--max-length"));
    else throw new Error(`未知选项：${args[index]}`);
  }

  const manifest = await readJson(manifestPath);
  const queue = buildReviewQueue(manifest, options);
  if (outputPath) {
    await writeReviewQueue(queue, outputPath);
    console.error(`已写入 ${outputPath}`);
  }
  process.stdout.write(`${JSON.stringify(queue, null, 2)}\n`);
}

async function runValidate(args) {
  const manifestPath = args.shift();
  const translationPath = args.shift();
  if (!manifestPath || !translationPath) throw new Error("用法：orb-inspector validate <manifest.json> <translations.json> [--out report.json]");

  let outputPath;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--out") outputPath = requiredValue(args, ++index, "--out");
    else throw new Error(`未知选项：${args[index]}`);
  }

  const manifest = await readJson(manifestPath);
  const translations = await readJson(translationPath);
  const report = validateTranslationMap(manifest, translations);
  if (outputPath) {
    await writeValidationReport(report, outputPath);
    console.error(`已写入 ${outputPath}`);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function requiredValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} 缺少参数值`);
  return value;
}

function printHelp() {
  process.stdout.write(`用法：\n  orb-inspector analyze <app-or-dmg> [选项]\n  orb-inspector review <translation-manifest.json> [选项]\n  orb-inspector validate <translation-manifest.json> <translations.json> [选项]\n\n分析选项：\n  --out <file>             写入 JSON 分析报告\n  --candidates-out <file>  写入翻译候选清单\n  --max-strings <n>        最多保留 n 条 Mach-O 字符串候选（默认：2000）\n  --no-strings             跳过 Mach-O 字符串提取\n  --no-assets              跳过 Assets.car 元数据\n  --no-candidates          跳过翻译候选清单\n  --target-language <tag>  候选目标语言（默认：zh-CN）\n\n审查选项：\n  --out <file>             写入人工审查队列\n  --ui-only                只保留 ui_candidate 条目\n  --include-protected      包含路径、标识符和 Framework 条目\n  --limit <n>              最大队列条数（默认：500）\n  --min-length <n>         最小文本长度\n  --max-length <n>         最大文本长度\n\n校验选项：\n  --out <file>             写入翻译校验报告\n`);
}
