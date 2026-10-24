import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * 通过主机的 assetutil 检查一个已编译的 Apple 资产目录。
 *
 * 函数只读取元数据，不提取图像字节，也不修改资产目录或其所属 App Bundle。
 */
export async function inspectAssetCatalog(catalogPath, options = {}) {
  const path = resolve(catalogPath);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`Assets.car 必须是普通文件：${path}`);

  const tool = await locateAssetutil();
  const artifact = {
    path,
    bytes: info.size,
    sha256: await sha256File(path),
  };
  const base = {
    schema: "orb-inspector/assets-v0.1",
    operation: "inspect-assets-car",
    artifact,
    tool,
    observed: [],
    derived: [],
    unknowns: [],
    limitations: [
      "assetutil 元数据不包含资源字节，也不能证明资产在运行时的使用位置。",
      "除非生产方的资源契约明确规定，否则资产名称不等同于本地化键。",
    ],
  };

  if (!tool.available) {
    base.unknowns.push({
      kind: "assetutil-unavailable",
      detail: "主机没有提供 macOS assetutil 命令，因此没有解码 Assets.car 元数据。",
    });
    return base;
  }

  const command = await runAssetutil(tool.path, path, options);
  base.observed.push({ kind: "assetutil-command", command });
  if (!command.ok) {
    base.unknowns.push({
      kind: "assetutil-failed",
      detail: command.stderr || "assetutil 失败且没有返回诊断信息。",
    });
    return base;
  }

  let records;
  try {
    records = JSON.parse(command.stdout);
  } catch (error) {
    base.unknowns.push({
      kind: "assetutil-output-not-json",
      detail: error instanceof Error ? error.message : String(error),
    });
    return base;
  }
  if (!Array.isArray(records)) {
    base.unknowns.push({
      kind: "assetutil-output-not-array",
      detail: "assetutil 返回了 JSON，但顶层值不是数组。",
    });
    return base;
  }

  const summary = summarizeAssetutilRecords(records, options);
  base.catalog = summary;
  base.observed.push({
    kind: "asset-catalog-metadata",
    record_count: summary.record_count,
    asset_type_counts: summary.asset_type_counts,
    metadata_header: summary.metadata_header,
  });

  if (summary.localization_fields.length === 0) {
    base.unknowns.push({
      kind: "no-localization-field-observed",
      detail: "assetutil 元数据中没有识别到本地化字段；这不能证明目录在运行时没有本地化用途。",
    });
  }
  if (summary.record_count > summary.records.length) {
    base.limitations.push(
      `报告保留了 ${summary.record_count} 条记录中的 ${summary.records.length} 条；可以使用 max_records 调整保留样本。`,
    );
  }
  return base;
}

export function summarizeAssetutilRecords(records, options = {}) {
  const maxRecords = normalizeLimit(options.maxRecords, 200);
  const metadataHeader = records.find((record) => !record?.AssetType) ?? null;
  const assetRecords = records.filter((record) => record && typeof record.AssetType === "string");
  const counts = {};
  const names = [];
  const localizationFields = new Set();

  for (const record of assetRecords) {
    counts[record.AssetType] = (counts[record.AssetType] ?? 0) + 1;
    if (typeof record.Name === "string") names.push(record.Name);
    for (const key of Object.keys(record)) {
      if (/localiz|language|locale/i.test(key)) localizationFields.add(key);
    }
  }

  const retainedRecords = assetRecords.slice(0, maxRecords).map((record) => projectRecord(record));
  return {
    record_count: assetRecords.length,
    asset_type_counts: counts,
    names: [...new Set(names)].slice(0, maxRecords),
    localization_fields: [...localizationFields].sort(),
    metadata_header: metadataHeader,
    records: retainedRecords,
  };
}

export async function locateAssetutil() {
  try {
    const { stdout } = await execFileAsync("which", ["assetutil"]);
    const path = stdout.trim().split(/\r?\n/)[0];
    return { available: path.length > 0, path: path || null };
  } catch {
    return { available: false, path: null };
  }
}

async function runAssetutil(toolPath, catalogPath, options) {
  const maxBuffer = normalizeLimit(options.maxBufferBytes, 32 * 1024 * 1024);
  try {
    const { stdout, stderr } = await execFileAsync(toolPath, ["--info", catalogPath], { maxBuffer });
    return {
      command: toolPath,
      args: ["--info", catalogPath],
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    return {
      command: toolPath,
      args: ["--info", catalogPath],
      ok: false,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? error?.message ?? error).trim(),
    };
  }
}

function projectRecord(record) {
  const projected = {};
  for (const key of [
    "AssetType",
    "Name",
    "RenditionName",
    "NameIdentifier",
    "Scale",
    "Appearance",
    "PixelWidth",
    "PixelHeight",
    "CanvasWidth",
    "CanvasHeight",
    "SHA1Digest",
    "SizeOnDisk",
    "Compression",
  ]) {
    if (record[key] !== undefined) projected[key] = record[key];
  }
  return projected;
}

function normalizeLimit(value, fallback) {
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

async function sha256File(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
