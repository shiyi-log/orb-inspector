import test from "node:test";
import assert from "node:assert/strict";
import { extractAsciiStrings, parseMachO, scanStringReferences } from "../src/macho.mjs";

test("提取带文件偏移的可打印字符串", () => {
  const bytes = Buffer.from("\0\0Hello from OrbStack\0\0internal-key\0", "ascii");
  const result = extractAsciiStrings(bytes, 0, bytes.length, { minLength: 8, maxLength: 240 });
  assert.deepEqual(result, [
    { value: "Hello from OrbStack", fileOffset: 2, length: 19, rawLength: 19, fileEndOffset: 21, truncated: false },
    { value: "internal-key", fileOffset: 23, length: 12, rawLength: 12, fileEndOffset: 35, truncated: false },
  ]);
});

test("字符串受长度限制时保留原始字节范围", () => {
  const bytes = Buffer.from("helloWorld123456\0", "ascii");
  const result = extractAsciiStrings(bytes, 0, bytes.length, { minLength: 8, maxLength: 8 });
  assert.deepEqual(result, [
    { value: "helloWor", fileOffset: 0, length: 8, rawLength: 16, fileEndOffset: 16, truncated: true },
  ]);
});

test("查找受限的小端序指针引用但不宣称是完整交叉引用", () => {
  const bytes = Buffer.alloc(16);
  bytes.writeBigUInt64LE(0x1000n, 0);
  const result = scanStringReferences(
    bytes,
    [{ value: "Hello", virtual_address: 0x1000 }],
    [{ fileOffset: 0, fileSize: bytes.length, section: "__const", segment: "__DATA_CONST", virtualAddress: 0x2000 }],
  );
  assert.equal(result.summary.status, "bounded-pointer-scan");
  assert.equal(result.summary.matches, 1);
  assert.equal(result.reference_counts[0], 1);
  assert.deepEqual(result.references[0][0], {
    file_offset: 0,
    virtual_address: 0x2000,
    section: "__const",
    segment: "__DATA_CONST",
    width: 8,
    byte_order: "little-endian",
  });
});

test("识别薄型 64 位小端序 Mach-O 头部", () => {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(0, 16);
  bytes.writeUInt32LE(0, 20);
  const result = parseMachO(bytes);
  assert.equal(result.format, "mach-o-64");
  assert.equal(result.architecture, "arm64");
  assert.equal(result.ranges.length, 1);
  assert.equal(result.ranges[0].fileSize, bytes.length);
  assert.deepEqual(result.reference_ranges, []);
});
