import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectAssetCatalog } from "./assets.mjs";
import { createTranslationManifest } from "./candidates.mjs";
import { inspectMachOStrings } from "./macho.mjs";

const execFileAsync = promisify(execFile);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".json",
  ".html",
  ".css",
  ".strings",
  ".stringsdict",
  ".plist",
  ".xml",
]);

const MAX_LOCALIZATION_FILE_BYTES = 4 * 1024 * 1024;

export async function analyzeInput(inputPath, options = {}) {
  const input = resolve(inputPath);
  const inputStat = await stat(input);
  const evidence = {
    schema: "orb-inspector/v0.1",
    operation: "analyze",
    input: {
      path: input,
      kind: inputStat.isDirectory() ? "directory" : "file",
      sha256: inputStat.isFile() ? await sha256File(input) : null,
    },
    observed: [],
    derived: [],
    unknowns: [],
    limitations: [
      "静态检查不能证明运行时行为，也不能证明某条 UI 路径可访问。",
      "从原生二进制提取的字符串只是候选清单，不是本地化目录。",
      "本地化资源解析只读取静态键值和结构摘要，不执行目标程序逻辑或格式化规则。",
    ],
  };

  let mount = null;
  let appPath = input;
  try {
    if (inputStat.isFile() && extname(input).toLowerCase() === ".dmg") {
      mount = await mountDmg(input);
      appPath = await findAppBundle(mount.mountPoint);
      evidence.observed.push({
        kind: "dmg-mounted",
        path: input,
        mount_point: mount.mountPoint,
        device: mount.device,
      });
    }

    if (!(await isAppBundle(appPath))) {
      throw new Error(`需要 .app Bundle，或包含 .app 的 .dmg：${appPath}`);
    }

    const app = await inspectAppBundle(appPath, options, {
      input_path: input,
      mounted: mount !== null,
      app_relative_path: mount ? relative(mount.mountPoint, appPath) : null,
    });
    evidence.target = app;
    evidence.derived.push(...deriveLocalizationFindings(app));
    return evidence;
  } finally {
    if (mount) await detachDmg(mount.mountPoint);
  }
}

async function mountDmg(dmgPath) {
  const mountPoint = await mkdtemp(join(tmpdir(), "orb-inspector-"));
  try {
    const { stdout } = await execFileAsync("hdiutil", [
      "attach",
      "-nobrowse",
      "-readonly",
      "-mountpoint",
      mountPoint,
      dmgPath,
    ]);
    const device = stdout
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .find((value) => /^\/dev\/disk\d/.test(value));
    return { mountPoint, device: device ?? null };
  } catch (error) {
    await detachDmg(mountPoint);
    throw error;
  }
}

async function detachDmg(mountPoint) {
  try {
    await execFileAsync("hdiutil", ["detach", "-force", mountPoint]);
  } catch {
    // 挂载失败后，挂载点可能已经被系统释放。
  }
}

async function findAppBundle(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const app = entries.find((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
  if (!app) throw new Error(`挂载镜像中没有找到 .app Bundle：${root}`);
  return join(root, app.name);
}

async function isAppBundle(path) {
  try {
    const info = await stat(path);
    return info.isDirectory() && path.endsWith(".app");
  } catch {
    return false;
  }
}

async function inspectAppBundle(appPath, options, source = {}) {
  const contents = join(appPath, "Contents");
  const infoPath = join(contents, "Info.plist");
  const info = await readPlist(infoPath);
  const executableName = info.CFBundleExecutable;
  const executablePath = executableName ? join(contents, "MacOS", executableName) : null;
  const files = await listFiles(appPath);
  const relativeFiles = files.map((file) => relative(appPath, file));

  const resources = classifyResources(relativeFiles);
  const signature = await commandObservation("codesign", ["-dv", "--verbose=4", appPath]);
  const executable = executablePath
    ? {
        path: executablePath,
        file: await commandObservation("file", [executablePath]),
        strings: options.strings === false ? null : await extractExecutableStrings(executablePath, options),
      }
    : null;

  const assetCatalogAnalysis = options.assets === false
    ? []
    : await Promise.all(
        resources.assetCatalogs.map((catalogPath) =>
          inspectAssetCatalog(join(appPath, catalogPath), {
            maxRecords: options.assetMaxRecords,
          }).then((report) => ({
            ...report,
            source_path: catalogPath,
          })).catch((error) => ({
            schema: "orb-inspector/assets-v0.1",
            operation: "inspect-assets-car",
            artifact: { path: join(appPath, catalogPath) },
            source_path: catalogPath,
            observed: [],
            derived: [],
            unknowns: [{ kind: "asset-analysis-error", detail: String(error?.message ?? error) }],
            limitations: ["资产目录在保留元数据前分析失败。"],
          })),
        ),
      );

  const localizationAnalysis = options.localization === false
    ? null
    : await inspectLocalizationResources(appPath, resources.localizationFiles);

  const stringRecords = executable?.strings?.records ?? [];
  const translationCandidates = options.candidates === false
    ? null
    : createTranslationManifest(
        stringRecords.map((record) => ({
          text: record.value,
          source_location: {
            file_offset: record.file_offset,
            virtual_address: record.virtual_address,
            section: record.section,
            segment: record.segment,
          },
          source_evidence: {
            byte_start: record.byte_start,
            byte_end: record.byte_end,
            byte_length: record.byte_length,
            raw_length: record.raw_length,
            encoding: record.encoding,
            truncated: record.truncated,
            file_end_offset: record.file_end_offset,
            reference_count: record.reference_count,
            references: record.references,
          },
        })),
        {
          source: `${info.CFBundleName ?? basename(appPath, ".app")} ${info.CFBundleShortVersionString ?? "unknown"}`,
          targetLanguage: options.targetLanguage ?? "zh-CN",
        },
      );
  if (translationCandidates && executable?.strings) {
    translationCandidates.source_coverage = {
      extracted_total: executable.strings.total,
      retained: stringRecords.length,
      complete: executable.strings.total === stringRecords.length,
    };
    if (!translationCandidates.source_coverage.complete) {
      translationCandidates.limitations.push(
        `有限候选清单只保留了 ${executable.strings.total} 条提取字符串中的 ${stringRecords.length} 条。`,
      );
    }
  }

  return {
    path: source.mounted ? source.input_path : appPath,
    observed_path: appPath,
    source,
    identity: {
      bundle_identifier: info.CFBundleIdentifier ?? null,
      name: info.CFBundleName ?? basename(appPath, ".app"),
      version: info.CFBundleShortVersionString ?? null,
      build: info.CFBundleVersion ?? null,
      development_region: info.CFBundleDevelopmentRegion ?? null,
      minimum_system_version: info.LSMinimumSystemVersion ?? null,
    },
    info_plist: info,
    signature,
    signature_details: parseCodeSignature(signature),
    executable,
    asset_catalog_analysis: assetCatalogAnalysis,
    localization_analysis: localizationAnalysis,
    translation_candidates: translationCandidates,
    inventory: {
      file_count: relativeFiles.length,
      localization_directories: resources.localizationDirectories,
      localization_files: resources.localizationFiles,
      application_localization_directories: resources.localizationDirectories.filter(
        (path) => path.startsWith("Contents/Resources/"),
      ),
      application_localization_files: resources.localizationFiles.filter(
        (path) => path.startsWith("Contents/Resources/"),
      ),
      framework_localization_files: resources.localizationFiles.filter(
        (path) => path.startsWith("Contents/Frameworks/"),
      ),
      javascript_or_web_files: resources.javascriptOrWebFiles,
      archives: resources.archives,
      interface_builder_files: resources.interfaceBuilderFiles,
      asset_catalogs: resources.assetCatalogs,
      other_files: resources.otherFiles,
    },
  };
}

function parseCodeSignature(observation) {
  const text = `${observation.stdout}\n${observation.stderr}`;
  const read = (label) => text.match(new RegExp(`^${label}=(.+)$`, "m"))?.[1] ?? null;
  return {
    ok: observation.ok,
    executable: read("Executable"),
    identifier: read("Identifier"),
    format: read("Format"),
    team_identifier: read("TeamIdentifier"),
    authorities: [...text.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1]),
    timestamp: read("Timestamp"),
    cdhash: read("CDHash"),
  };
}

async function readPlist(path) {
  try {
    const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", "--", path]);
    return JSON.parse(stdout);
  } catch (error) {
    return { _read_error: String(error?.stderr || error?.message || error) };
  }
}

async function commandObservation(command, args) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 2 * 1024 * 1024 });
    return { command, args, ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    return {
      command,
      args,
      ok: false,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? error?.message ?? error).trim(),
    };
  }
}

async function extractExecutableStrings(path, options = {}) {
  const maxStrings = Number.isInteger(options.maxStrings) && options.maxStrings > 0
    ? options.maxStrings
    : 2000;
  try {
    const result = await inspectMachOStrings(path, { minLength: 8, maxLength: 240 });
    const records = result.strings.slice(0, maxStrings).map((record) => ({
      value: record.value,
      file_offset: record.file_offset,
      file_end_offset: record.file_end_offset,
      byte_start: record.byte_start,
      byte_end: record.byte_end,
      byte_length: record.byte_length,
      raw_length: record.raw_length,
      encoding: record.encoding,
      truncated: record.truncated,
      length: record.length,
      section: record.section,
      segment: record.segment,
      virtual_address: record.virtual_address,
      location_confidence: record.location_confidence,
      references: record.references,
      reference_count: record.reference_count,
    }));
    return {
      total: result.strings.length,
      candidates: records.map((record) => record.value),
      records,
      format: result.format,
      architecture: result.architecture,
      ranges: result.ranges,
      reference_scan: result.reference_scan,
      coverage: result.coverage,
      retained_limit: maxStrings,
    };
  } catch (error) {
    const result = await commandObservation("strings", ["-n", "8", path]);
    const lines = [...new Set(result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
    const candidates = lines
      .filter((line) => line.length >= 8 && line.length <= 240)
      .filter((line) => /[A-Za-z]/.test(line))
      .filter((line) => !/^[A-Z0-9_./:+-]+$/.test(line))
      .slice(0, maxStrings);
    return {
      total: lines.length,
      candidates,
      records: candidates.map((value) => ({ value, file_offset: null, length: value.length })),
      retained_limit: maxStrings,
      fallback: { error: String(error?.message ?? error), command: result },
    };
  }
}

export async function inspectLocalizationResources(appPath, paths = []) {
  const files = [];
  for (const path of paths) {
    const format = extname(path).toLowerCase() === ".stringsdict" ? "stringsdict" : "strings";
    const record = {
      path,
      language: localizationLanguage(path),
      format,
      encoding: null,
      entry_count: 0,
      entries: [],
      syntax_errors: [],
      read_error: null,
    };
    try {
      const rootPath = await realpath(resolve(appPath));
      const absolutePath = resolve(rootPath, path);
      const relativePath = relative(rootPath, absolutePath);
      if (isOutsideBundle(relativePath)) {
        throw new Error("资源路径超出应用 Bundle 范围");
      }
      const resolvedPath = await realpath(absolutePath);
      if (isOutsideBundle(relative(rootPath, resolvedPath))) {
        throw new Error("资源符号链接超出应用 Bundle 范围");
      }
      const info = await stat(resolvedPath);
      if (!info.isFile()) throw new Error("资源路径不是普通文件");
      if (info.size > MAX_LOCALIZATION_FILE_BYTES) {
        throw new Error(`文件超过 ${MAX_LOCALIZATION_FILE_BYTES} 字节的只读分析上限`);
      }
      const raw = await readFile(resolvedPath);
      const parsed = format === "strings"
        ? await parseStringsResource(raw, resolvedPath)
        : await parseStringsDictResource(raw, resolvedPath);
      record.encoding = parsed.encoding ?? null;
      record.entry_count = parsed.entry_count;
      record.entries = parsed.entries;
      record.syntax_errors = parsed.syntax_errors;
      if (parsed.read_error) record.read_error = parsed.read_error;
    } catch (error) {
      record.read_error = {
        code: "read-failed",
        detail: String(error?.message ?? error),
      };
    }
    files.push(record);
  }

  const languageCounts = {};
  const formatCounts = {};
  let parsedFileCount = 0;
  let entryCount = 0;
  let syntaxErrorCount = 0;
  let readErrorCount = 0;
  for (const file of files) {
    const language = file.language ?? "unknown";
    languageCounts[language] = (languageCounts[language] ?? 0) + 1;
    formatCounts[file.format] = (formatCounts[file.format] ?? 0) + 1;
    if (file.read_error) {
      readErrorCount += 1;
      continue;
    }
    parsedFileCount += 1;
    entryCount += file.entry_count;
    syntaxErrorCount += file.syntax_errors.length;
  }
  return {
    schema: "orb-inspector/localization-v0.1",
    files,
    summary: {
      file_count: files.length,
      parsed_file_count: parsedFileCount,
      entry_count: entryCount,
      language_counts: languageCounts,
      languages: Object.keys(languageCounts).sort(),
      format_counts: formatCounts,
      syntax_error_count: syntaxErrorCount,
      read_error_count: readErrorCount,
    },
    limits: {
      max_file_bytes: MAX_LOCALIZATION_FILE_BYTES,
    },
  };
}

function isOutsideBundle(relativePath) {
  return isAbsolute(relativePath) || relativePath === ".." || relativePath.startsWith(`..${relativePath.includes("\\") ? "\\" : "/"}`);
}

export function parseStringsContent(content) {
  const source = String(content ?? "").replace(/^\uFEFF/, "");
  const entries = [];
  const syntaxErrors = [];
  let index = 0;

  while (index < source.length) {
    index = skipStringsWhitespaceAndComments(source, index, syntaxErrors);
    if (index >= source.length) break;
    const line = lineColumnAt(source, index);
    const key = readQuotedString(source, index);
    if (!key.ok) {
      syntaxErrors.push({ code: "expected-key", line: line.line, column: line.column, message: "期望以双引号开始键" });
      index = synchronizeStringsParser(source, index);
      continue;
    }
    index = key.next;
    index = skipStringsWhitespaceAndComments(source, index, syntaxErrors);
    if (source[index] !== "=") {
      syntaxErrors.push({ code: "expected-equals", ...lineColumnAt(source, index), message: "键后缺少等号" });
      index = synchronizeStringsParser(source, index);
      continue;
    }
    index += 1;
    index = skipStringsWhitespaceAndComments(source, index, syntaxErrors);
    const value = readQuotedString(source, index);
    if (!value.ok) {
      syntaxErrors.push({ code: "expected-value", ...lineColumnAt(source, index), message: "等号后缺少双引号包裹的值" });
      index = synchronizeStringsParser(source, index);
      continue;
    }
    index = value.next;
    index = skipStringsWhitespaceAndComments(source, index, syntaxErrors, { stopAtNewline: true });
    if (source[index] !== ";") {
      syntaxErrors.push({ code: "expected-semicolon", ...lineColumnAt(source, index), message: "本地化条目后缺少分号" });
      index = synchronizeStringsParser(source, index);
      continue;
    }
    index += 1;
    entries.push({ key: key.value, value: value.value });
  }

  return {
    format: "strings",
    entry_count: entries.length,
    entries,
    syntax_errors: syntaxErrors,
  };
}

async function parseStringsResource(raw, absolutePath) {
  if (raw.subarray(0, 8).toString("ascii") === "bplist00") {
    const plist = await readPlist(absolutePath);
    if (plist && typeof plist === "object" && !plist._read_error) {
      const entries = Object.entries(plist)
        .filter(([key, value]) => typeof value === "string")
        .map(([key, value]) => ({ key, value }));
      return { format: "strings", encoding: "binary-plist", entry_count: entries.length, entries, syntax_errors: [] };
    }
    return {
      format: "strings",
      encoding: "binary-plist",
      entry_count: 0,
      entries: [],
      syntax_errors: [],
      read_error: { code: "plist-read-failed", detail: String(plist?._read_error ?? "无法读取二进制 plist") },
    };
  }
  const decoded = decodeLocalizationText(raw);
  return {
    ...parseStringsContent(decoded.text),
    encoding: decoded.encoding,
  };
}

async function parseStringsDictResource(raw, absolutePath) {
  if (raw.subarray(0, 8).toString("ascii") === "bplist00") {
    const plist = await readPlist(absolutePath);
    if (plist && typeof plist === "object" && !plist._read_error) {
      const entries = Object.entries(plist)
        .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
        .map(([key]) => ({ key, value: null }));
      return { format: "stringsdict", encoding: "binary-plist", entry_count: entries.length, entries, syntax_errors: [] };
    }
    return {
      format: "stringsdict",
      encoding: "binary-plist",
      entry_count: 0,
      entries: [],
      syntax_errors: [],
      read_error: { code: "plist-read-failed", detail: String(plist?._read_error ?? "无法读取二进制 plist") },
    };
  }
  const decoded = decodeLocalizationText(raw);
  return {
    ...parseStringsDictContent(decoded.text),
    encoding: decoded.encoding,
  };
}

function decodeLocalizationText(raw) {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return { text: raw.subarray(2).toString("utf16le"), encoding: "utf-16le" };
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const swapped = Buffer.alloc(raw.length - 2);
    for (let index = 2; index + 1 < raw.length; index += 2) {
      swapped[index - 2] = raw[index + 1];
      swapped[index - 1] = raw[index];
    }
    return { text: swapped.toString("utf16le"), encoding: "utf-16be" };
  }
  return { text: raw.toString("utf8"), encoding: "utf-8" };
}

export function parseStringsDictContent(content) {
  const source = String(content ?? "").replace(/^\uFEFF/, "");
  const withoutComments = source.replace(/<!--[\s\S]*?-->/g, "");
  const syntaxErrors = [];
  if (!/<plist\b[^>]*>/i.test(withoutComments)) {
    syntaxErrors.push({ code: "missing-plist", line: 1, column: 1, message: "缺少 plist 根元素" });
  }
  if (!/<dict\b[^>]*>/i.test(withoutComments)) {
    syntaxErrors.push({ code: "missing-dict", line: 1, column: 1, message: "缺少 dict 元素" });
  }
  const openingKeys = (withoutComments.match(/<key\b[^>]*>/gi) ?? []).length;
  const closingKeys = (withoutComments.match(/<\/key\s*>/gi) ?? []).length;
  if (openingKeys !== closingKeys) {
    syntaxErrors.push({ code: "unclosed-key", line: 1, column: 1, message: "key 元素未闭合" });
  }

  const entries = [];
  const keyPattern = /<key\b[^>]*>\s*([\s\S]*?)\s*<\/key\s*>/gi;
  const dictTags = [...withoutComments.matchAll(/<\/?dict\b[^>]*>/gi)];
  for (const match of withoutComments.matchAll(keyPattern)) {
    const depth = dictTags.reduce((current, tag) => {
      if (tag.index >= match.index) return current;
      if (/^<\/dict/i.test(tag[0])) return current - 1;
      return /\/\s*>$/.test(tag[0]) ? current : current + 1;
    }, 0);
    const afterKey = withoutComments.slice(match.index + match[0].length);
    if (depth === 1 && /^\s*<dict\b[^>]*>/i.test(afterKey)) {
      entries.push({ key: decodeXmlText(match[1]), value: null });
    }
  }
  return {
    format: "stringsdict",
    entry_count: entries.length,
    entries,
    syntax_errors: syntaxErrors,
  };
}

function localizationLanguage(path) {
  const component = String(path).split(/[\\/]/).find((part) => /\.lproj$/i.test(part));
  return component ? component.replace(/\.lproj$/i, "") : null;
}

function skipStringsWhitespaceAndComments(source, start, syntaxErrors, options = {}) {
  let index = start;
  while (index < source.length) {
    if (options.stopAtNewline && (source[index] === "\n" || source[index] === "\r")) break;
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) {
        syntaxErrors.push({ code: "unclosed-comment", ...lineColumnAt(source, index), message: "块注释未闭合" });
        return source.length;
      }
      index = end + 2;
      continue;
    }
    break;
  }
  return index;
}

function readQuotedString(source, start) {
  if (source[start] !== '"') return { ok: false };
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const character = source[index];
    if (character === '"') return { ok: true, value, next: index + 1 };
    if (character === "\n" || character === "\r") return { ok: false };
    if (character !== "\\") {
      value += character;
      index += 1;
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) return { ok: false };
    const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "\\": "\\", '"': '"' };
    if (Object.hasOwn(escapes, escaped)) {
      value += escapes[escaped];
      index += 2;
      continue;
    }
    if (escaped === "u" && /^[0-9a-f]{4}$/i.test(source.slice(index + 2, index + 6))) {
      value += String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 6), 16));
      index += 6;
      continue;
    }
    value += escaped;
    index += 2;
  }
  return { ok: false };
}

function synchronizeStringsParser(source, start) {
  let index = start;
  while (index < source.length && source[index] !== ";" && source[index] !== "\n") index += 1;
  return index < source.length && source[index] === ";" ? index + 1 : index;
}

function lineColumnAt(source, index) {
  const prefix = source.slice(0, Math.max(0, index));
  const lines = prefix.split("\n");
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function decodeXmlText(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

async function listFiles(root) {
  const output = [];
  async function visit(path) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else output.push(child);
    }
  }
  await visit(root);
  return output.sort();
}

function classifyResources(paths) {
  const result = {
    localizationDirectories: [],
    localizationFiles: [],
    javascriptOrWebFiles: [],
    archives: [],
    interfaceBuilderFiles: [],
    assetCatalogs: [],
    otherFiles: [],
  };
  for (const path of paths) {
    const lower = path.toLowerCase();
    const ext = extname(lower);
    if (/\.lproj\//.test(`${lower}/`)) result.localizationDirectories.push(path);
    if (ext === ".strings" || ext === ".stringsdict" || lower.endsWith("/localizable.strings"))
      result.localizationFiles.push(path);
    else if (ext === ".js" || ext === ".json" || ext === ".html" || ext === ".css" || ext === ".asar")
      result.javascriptOrWebFiles.push(path);
    else if (ext === ".zip" || ext === ".dmg" || ext === ".tar" || ext === ".gz" || ext === ".img")
      result.archives.push(path);
    else if (ext === ".nib" || ext === ".storyboardc") result.interfaceBuilderFiles.push(path);
    else if (ext === ".car" || lower.endsWith(".xcassets")) result.assetCatalogs.push(path);
    else if (!TEXT_EXTENSIONS.has(ext)) result.otherFiles.push(path);
  }
  return result;
}

function deriveLocalizationFindings(app) {
  const findings = [];
  const inventory = app.inventory;
  if (
    inventory.application_localization_directories.length === 0 &&
    inventory.application_localization_files.length === 0
  ) {
    findings.push({
      kind: "no-application-localization-resources-observed",
      confidence: "observed",
      detail: "主应用 Contents/Resources 下没有找到 .lproj、.strings 或 .stringsdict 文件。",
    });
  }
  if (inventory.framework_localization_files.length > 0) {
    findings.push({
      kind: "framework-localization-resources-observed",
      confidence: "observed",
      detail: `嵌套 Framework 中找到 ${inventory.framework_localization_files.length} 个本地化文件；这不能证明主应用界面支持这些语言。`,
    });
  }
  if ((app.executable?.strings?.candidates?.length ?? 0) > 0) {
    findings.push({
      kind: "native-string-candidates-present",
      confidence: "observed",
      detail: `从主程序提取了 ${app.executable.strings.candidates.length} 条有限候选字符串。`,
    });
  }
  if ((app.translation_candidates?.summary?.total ?? 0) > 0) {
    const summary = app.translation_candidates.summary;
    findings.push({
      kind: "translation-candidate-manifest",
      confidence: "derived",
      detail: `创建了 ${summary.total} 条稳定翻译候选：${summary.categories.ui_candidate ?? 0} 条 UI 候选，${summary.risks.review ?? 0} 条审查项。`,
    });
  }
  if ((app.localization_analysis?.summary?.entry_count ?? 0) > 0) {
    const summary = app.localization_analysis.summary;
    findings.push({
      kind: "localization-key-values-observed",
      confidence: "observed",
      detail: `解析了 ${summary.entry_count} 个本地化键，覆盖 ${summary.languages.length} 种语言目录。`,
    });
  }
  if ((app.localization_analysis?.summary?.syntax_error_count ?? 0) > 0) {
    findings.push({
      kind: "localization-syntax-errors-observed",
      confidence: "observed",
      detail: `本地化资源中发现 ${app.localization_analysis.summary.syntax_error_count} 个语法错误摘要。`,
    });
  }
  if (inventory.javascript_or_web_files.length === 0) {
    findings.push({
      kind: "no-obvious-web-bundle-observed",
      confidence: "derived",
      detail: "没有找到 .js/.json/.html/.css/.asar 资源文件；这不能排除生成式或嵌入式 UI 资源。",
    });
  }
  findings.push({
    kind: "localization-editability",
    confidence: "unknown",
    detail: "静态清单不能证明替换字符串后仍能保持运行时行为、代码签名或更新兼容性。",
  });
  return findings;
}

export async function writeReport(report, outputPath) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function classifyResourcePaths(paths) {
  return classifyResources(paths);
}

export async function sha256File(path) {
  const digest = createHash("sha256");
  digest.update(await readFile(path));
  return digest.digest("hex");
}
