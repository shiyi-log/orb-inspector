import { readFile } from "node:fs/promises";

const MH_MAGIC = 0xfeedface;
const MH_CIGAM = 0xcefaedfe;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;
const FAT_MAGIC_64 = 0xcafebabf;
const FAT_CIGAM_64 = 0xbfbafeca;
const LC_SEGMENT = 0x1;
const LC_SEGMENT_64 = 0x19;
const CPU_TYPE_ARM64 = 0x0100000c;

/**
 * 读取原生字符串并保留字节位置。
 *
 * 这是有边界的静态读取器，不负责反汇编、解码 Swift 元数据，也不宣称
 * 某条字符串被某个具体界面使用。
 */
export async function inspectMachOStrings(path, options = {}) {
  const bytes = await readFile(path);
  const parsed = parseMachO(bytes, options);
  const minLength = options.minLength ?? 8;
  const maxLength = options.maxLength ?? 240;
  const strings = [];

  for (const range of parsed.ranges) {
    const matches = extractAsciiStrings(bytes, range.fileOffset, range.fileSize, {
      minLength,
      maxLength,
    });
    for (const match of matches) {
      strings.push({
        value: match.value,
        file_offset: match.fileOffset,
        file_end_offset: match.fileEndOffset,
        byte_start: match.fileOffset,
        byte_end: match.fileEndOffset,
        byte_length: match.rawLength,
        raw_length: match.rawLength,
        encoding: "ascii",
        truncated: match.truncated,
        length: match.length,
        section: range.section,
        segment: range.segment,
        virtual_address:
          range.virtualAddress === null
            ? null
            : range.virtualAddress + (match.fileOffset - range.fileOffset),
        location_confidence: range.section === "__cstring" ? "section" : "segment",
      });
    }
  }

  const deduped = deduplicateStrings(strings);
  const referenceScan = scanStringReferences(
    bytes,
    deduped,
    parsed.reference_ranges ?? [],
    options,
  );
  const records = deduped.map((entry, index) => ({
    ...entry,
    references: referenceScan.references[index] ?? [],
    reference_count: referenceScan.reference_counts[index] ?? 0,
  }));
  return {
    format: parsed.format,
    architecture: parsed.architecture,
    byte_length: bytes.length,
    ranges: parsed.ranges,
    strings: records,
    reference_scan: referenceScan.summary,
    coverage: {
      status: parsed.ranges.length > 0 ? "complete-within-ranges" : "unknown",
      examined_bytes: parsed.ranges.reduce((total, range) => total + range.fileSize, 0),
      limitations: parsed.limitations,
    },
  };
}

export function parseMachO(bytes, options = {}) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const magic = bytes.length >= 4 ? bytes.readUInt32BE(0) : null;

  if (
    magic === FAT_MAGIC ||
    magic === FAT_CIGAM ||
    magic === FAT_MAGIC_64 ||
    magic === FAT_CIGAM_64
  ) {
    return parseFatMachO(bytes, options);
  }

  return parseThinMachO(bytes, 0, bytes.length, options);
}

function parseFatMachO(bytes, options) {
  const magic = bytes.readUInt32BE(0);
  const is64 = magic === FAT_MAGIC_64 || magic === FAT_CIGAM_64;
  const littleEndian = magic === FAT_CIGAM || magic === FAT_CIGAM_64;
  if (bytes.length < 8) {
    return {
      format: "fat-macho",
      architecture: null,
      ranges: [],
      reference_ranges: [],
      limitations: ["通用 Mach-O 头部已截断，无法读取架构数量。"],
    };
  }
  const read32 = (offset) => (littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset));
  const read64 = (offset) =>
    littleEndian ? bytes.readBigUInt64LE(offset) : bytes.readBigUInt64BE(offset);
  const count = read32(4);
  const entrySize = is64 ? 32 : 20;
  const limitations = [];
  const entries = [];
  const readableCount = Math.min(count, Math.floor((bytes.length - 8) / entrySize));
  if (readableCount < count) limitations.push("通用 Mach-O 架构表已截断或格式错误。");
  for (let index = 0; index < readableCount; index += 1) {
    const base = 8 + index * entrySize;
    const cpuType = read32(base);
    const rawOffset = is64 ? read64(base + 8) : BigInt(read32(base + 8));
    const rawSize = is64 ? read64(base + 16) : BigInt(read32(base + 12));
    const offset = rawOffset <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawOffset) : null;
    const size = rawSize <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rawSize) : null;
    entries.push({ cpuType, offset, size });
  }
  const selected = entries.find((entry) => entry.cpuType === CPU_TYPE_ARM64) ?? entries[0];
  if (!selected || selected.size < 4 || !isValidRange(selected.offset, selected.size, bytes.length)) {
    return {
      format: "fat-macho",
      architecture: null,
      ranges: [],
      reference_ranges: [],
      limitations: [...limitations, "通用 Mach-O 没有可读取的有限架构切片。"],
    };
  }
  const result = parseThinMachO(bytes, selected.offset, selected.size, options);
  return {
    ...result,
    format: "fat-macho",
    architecture: selected.cpuType === CPU_TYPE_ARM64 ? "arm64" : result.architecture,
    limitations: ["通用二进制分析只选择了其中一个架构切片。", ...limitations, ...result.limitations],
  };
}

function parseThinMachO(bytes, baseOffset, availableSize, options) {
  if (!isValidRange(baseOffset, availableSize, bytes.length) || availableSize < 4) {
    return {
      format: "unknown",
      architecture: null,
      ranges: isValidRange(baseOffset, availableSize, bytes.length) && availableSize > 0
        ? [{ fileOffset: baseOffset, fileSize: availableSize, section: null, segment: null, virtualAddress: null }]
        : [],
      reference_ranges: [],
      limitations: ["Mach-O 头部已截断，无法安全读取加载命令。"],
    };
  }
  const localMagic = bytes.readUInt32BE(baseOffset);
  const littleEndian = localMagic === MH_CIGAM || localMagic === MH_CIGAM_64;
  const is64 = localMagic === MH_MAGIC_64 || localMagic === MH_CIGAM_64;
  const headerSize = is64 ? 32 : 28;
  if (![MH_MAGIC, MH_CIGAM, MH_MAGIC_64, MH_CIGAM_64].includes(localMagic)) {
    return {
      format: "unknown",
      architecture: null,
      ranges: [{ fileOffset: baseOffset, fileSize: availableSize, section: null, segment: null, virtualAddress: null }],
      reference_ranges: [],
      limitations: ["输入没有可识别的 Mach-O 头部；字符串位置只能作为候选。"],
    };
  }

  const read32 = (offset) =>
    littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  const read64 = (offset) =>
    littleEndian ? Number(bytes.readBigUInt64LE(offset)) : Number(bytes.readBigUInt64BE(offset));
  if (availableSize < 8 || baseOffset + 8 > bytes.length) {
    return {
      format: is64 ? "mach-o-64" : "mach-o-32",
      architecture: null,
      ranges: [{ fileOffset: baseOffset, fileSize: availableSize, section: null, segment: null, virtualAddress: null }],
      reference_ranges: [],
      limitations: ["Mach-O 头部已截断，无法安全读取 CPU 类型。"],
    };
  }
  const cpuType = read32(baseOffset + 4);
  if (availableSize < headerSize || baseOffset + headerSize > bytes.length) {
    return {
      format: is64 ? "mach-o-64" : "mach-o-32",
      architecture: cpuType === CPU_TYPE_ARM64 ? "arm64" : cpuName(cpuType),
      ranges: [{ fileOffset: baseOffset, fileSize: availableSize, section: null, segment: null, virtualAddress: null }],
      reference_ranges: [],
      limitations: ["Mach-O 头部已截断，无法安全读取加载命令。"],
    };
  }
  const ncmds = read32(baseOffset + 16);
  const commandStart = baseOffset + headerSize;
  const declaredCommandBytes = read32(baseOffset + 20);
  const commandEnd = Math.min(baseOffset + availableSize, commandStart + declaredCommandBytes);
  const ranges = [];
  const limitations = [];
  if (commandStart + declaredCommandBytes > baseOffset + availableSize) {
    limitations.push("加载命令表已截断或超出 Mach-O 切片范围。");
  }

  let cursor = commandStart;
  let parsedCommands = 0;
  for (let index = 0; index < ncmds && cursor + 8 <= commandEnd; index += 1) {
    const command = read32(cursor);
    const commandSize = read32(cursor + 4);
    if (commandSize < 8 || cursor + commandSize > commandEnd) {
      limitations.push("加载命令表已截断或格式错误。");
      break;
    }
    if ((is64 && command === LC_SEGMENT_64) || (!is64 && command === LC_SEGMENT)) {
      const minimumSegmentSize = is64 ? 72 : 56;
      if (commandSize < minimumSegmentSize) {
        limitations.push("段加载命令长度不足，已跳过其字段读取。");
        cursor += commandSize;
        parsedCommands += 1;
        continue;
      }
      const segment = readFixedString(bytes, cursor + 8, 16);
      const vmAddress = is64 ? read64(cursor + 24) : read32(cursor + 24);
      const fileOffset = is64 ? read64(cursor + 40) : read32(cursor + 32);
      const fileSize = is64 ? read64(cursor + 48) : read32(cursor + 36);
      const sectionCount = is64 ? read32(cursor + 64) : read32(cursor + 48);
      const sectionStart = cursor + (is64 ? 72 : 56);
      const sectionSize = is64 ? 80 : 68;
      if (fileSize > 0 && isValidRange(fileOffset, fileSize, availableSize)) {
        ranges.push({
          fileOffset: baseOffset + fileOffset,
          fileSize,
          section: null,
          segment,
          virtualAddress: vmAddress,
        });
      }
      for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
        const sectionOffset = sectionStart + sectionIndex * sectionSize;
        if (sectionOffset + sectionSize > cursor + commandSize) break;
        const section = readFixedString(bytes, sectionOffset, 16);
        const sectionSegment = readFixedString(bytes, sectionOffset + 16, 16);
        const address = is64 ? read64(sectionOffset + 32) : read32(sectionOffset + 32);
        const size = is64 ? read64(sectionOffset + 40) : read32(sectionOffset + 36);
        const rawOffset = read32(sectionOffset + (is64 ? 48 : 40));
        const flags = read32(sectionOffset + (is64 ? 64 : 56));
        const sectionType = flags & 0xff;
        const isZeroFill = sectionType === 0x1 || sectionType === 0xc;
        if (!isZeroFill && size > 0 && isValidRange(rawOffset, size, availableSize)) {
          ranges.push({
            fileOffset: baseOffset + rawOffset,
            fileSize: size,
            section,
            segment: sectionSegment || segment,
            virtualAddress: address,
          });
        }
      }
    }
    cursor += commandSize;
    parsedCommands += 1;
  }
  if (parsedCommands < ncmds) {
    limitations.push("声明的加载命令数量超过了可读取范围。");
  }

  const stringSectionRanges = ranges.filter(
    (range) => range.section === "__cstring" || range.section === "__ustring",
  );
  const segmentRanges = ranges.filter((range) => range.section === null);
  // 优先使用编译器管理的字符串区段。扫描 __text 会把看起来像字符串的
  // 指令字节误认为 UI 文本。
  const selectedRanges =
    stringSectionRanges.length > 0
      ? stringSectionRanges
      : segmentRanges.length > 0
        ? segmentRanges
        : ranges.filter((range) => range.section !== "__text");
  if (selectedRanges.length === 0) {
    limitations.push("没有从 Mach-O 加载命令中恢复出可读取的区段或段范围。");
    selectedRanges.push({
      fileOffset: baseOffset,
      fileSize: availableSize,
      section: null,
      segment: null,
      virtualAddress: null,
    });
  }

  return {
    format: is64 ? "mach-o-64" : "mach-o-32",
    architecture: cpuType === CPU_TYPE_ARM64 ? "arm64" : cpuName(cpuType),
    ranges: mergeRanges(selectedRanges),
    reference_ranges: mergeRanges(
      ranges.filter(
        (range) =>
          range.section &&
          !["__cstring", "__ustring", "__text"].includes(range.section),
      ),
    ),
    limitations,
  };
}

function extractAsciiStrings(bytes, fileOffset, fileSize, { minLength, maxLength }) {
  const end = Math.min(bytes.length, fileOffset + fileSize);
  const output = [];
  let cursor = fileOffset;
  while (cursor < end) {
    while (cursor < end && !isPrintableAscii(bytes[cursor])) cursor += 1;
    const start = cursor;
    while (cursor < end && isPrintableAscii(bytes[cursor])) cursor += 1;
    const length = cursor - start;
    if (length >= minLength) {
      const bounded = Math.min(length, maxLength);
      const value = bytes.subarray(start, start + bounded).toString("utf8");
      if (/[A-Za-z]/.test(value) && !/^[A-Z0-9_./:+-]+$/.test(value)) {
        output.push({
          value,
          fileOffset: start,
          length: bounded,
          rawLength: length,
          fileEndOffset: start + length,
          truncated: length > bounded,
        });
      }
    }
  }
  return output;
}

/**
 * 查找指向已提取字符串虚拟地址的有限指针引用线索。
 *
 * 这是地址值启发式，不是反汇编器，也不是完整的交叉引用引擎。它会扫描
 * __const、__data 等区段，在对齐位置寻找等于字符串虚拟地址的小端序
 * 64 位数值。
 */
export function scanStringReferences(bytes, strings, ranges, options = {}) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  const records = Array.isArray(strings) ? strings : [];
  const scanRanges = Array.isArray(ranges) ? ranges : [];
  const maxPerString = Number.isInteger(options.maxReferencesPerString) && options.maxReferencesPerString > 0
    ? options.maxReferencesPerString
    : 8;
  const references = records.map(() => []);
  const referenceCounts = records.map(() => 0);
  const targets = new Map();
  records.forEach((entry, index) => {
    if (Number.isInteger(entry?.virtual_address)) targets.set(entry.virtual_address, index);
  });

  let scannedBytes = 0;
  let matches = 0;
  const normalizedRanges = normalizeReferenceRanges(bytes.length, scanRanges);
  for (const range of normalizedRanges) {
    const start = range.fileOffset;
    const end = start + range.fileSize;
    scannedBytes += end - start;
    for (let offset = start; offset + 8 <= end; offset += 8) {
      const value = Number(bytes.readBigUInt64LE(offset));
      const targetIndex = targets.get(value);
      if (targetIndex === undefined) continue;
      matches += 1;
      referenceCounts[targetIndex] += 1;
      if (references[targetIndex].length >= maxPerString) continue;
      references[targetIndex].push({
        file_offset: offset,
        virtual_address:
          Number.isInteger(range?.virtualAddress)
            ? range.virtualAddress + (offset - start)
            : null,
        section: range?.section ?? null,
        segment: range?.segment ?? null,
        width: 8,
        byte_order: "little-endian",
      });
    }
  }

  return {
    references,
    reference_counts: referenceCounts,
    summary: {
      status: targets.size > 0 && normalizedRanges.length > 0 ? "bounded-pointer-scan" : "not-run",
      target_count: targets.size,
      scanned_ranges: normalizedRanges.length,
      scanned_bytes: scannedBytes,
      matches,
      limitations: [
        "指针匹配只是地址值启发式，不能证明代码调用点或 UI 调用点。",
        "只扫描恢复出的非字符串区段中的对齐小端序 64 位值。",
        "不会解析 Swift 元数据、重定位、间接引用、字符串拼接或非指针引用。",
      ],
    },
  };
}

function isPrintableAscii(value) {
  return value >= 0x20 && value <= 0x7e;
}

function isValidRange(offset, size, limit) {
  return (
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(size) &&
    Number.isSafeInteger(limit) &&
    offset >= 0 &&
    size >= 0 &&
    limit >= 0 &&
    offset <= limit &&
    size <= limit - offset
  );
}

function normalizeReferenceRanges(byteLength, ranges) {
  const bounded = [];
  const seen = new Set();
  for (const range of ranges) {
    const start = Number(range?.fileOffset);
    const size = Number(range?.fileSize);
    if (!isValidRange(start, size, byteLength) || size < 8) continue;
    const key = `${start}:${size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bounded.push({ ...range, fileOffset: start, fileSize: size });
  }
  bounded.sort((left, right) => left.fileOffset - right.fileOffset);
  const normalized = [];
  for (const range of bounded) {
    const previous = normalized[normalized.length - 1];
    const previousEnd = previous ? previous.fileOffset + previous.fileSize : 0;
    const sameAlignment = previous && (range.fileOffset - previous.fileOffset) % 8 === 0;
    if (sameAlignment && range.fileOffset <= previousEnd) {
      previous.fileSize = Math.max(previousEnd, range.fileOffset + range.fileSize) - previous.fileOffset;
      continue;
    }
    normalized.push(range);
  }
  return normalized;
}

function deduplicateStrings(values) {
  const seen = new Set();
  return values.filter((entry) => {
    const key = `${entry.value}\0${entry.file_offset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeRanges(ranges) {
  const seen = new Set();
  return ranges.filter((range) => {
    const key = `${range.fileOffset}:${range.fileSize}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readFixedString(bytes, offset, length) {
  return bytes.subarray(offset, offset + length).toString("ascii").replace(/\0.*$/, "");
}

function cpuName(value) {
  if (value === 0x01000007) return "x86_64";
  if (value === 7) return "x86";
  return `cpu-${value}`;
}

export { extractAsciiStrings };
