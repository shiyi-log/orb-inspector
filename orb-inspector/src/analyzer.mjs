import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";
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
