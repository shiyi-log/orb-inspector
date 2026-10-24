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

test("截断或损坏的 Mach-O 头部不应抛出异常", () => {
  const samples = [
    Buffer.alloc(0),
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
    Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0x00, 0x00, 0x01]),
  ];
  for (const bytes of samples) {
    assert.doesNotThrow(() => parseMachO(bytes));
    assert.ok(parseMachO(bytes).limitations.length > 0);
  }
});

test("损坏的段加载命令只记录限制而不越界读取", () => {
  const bytes = Buffer.alloc(40);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(0x0100000c, 4);
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(8, 20);
  bytes.writeUInt32LE(0x19, 32);
  bytes.writeUInt32LE(8, 36);

  const result = parseMachO(bytes);
  assert.equal(result.format, "mach-o-64");
  assert.equal(result.ranges[0].fileSize, bytes.length);
  assert.ok(result.limitations.some((item) => item.includes("段加载命令长度不足")));
});

test("通用 Mach-O 切片使用文件内绝对偏移", () => {
  const sliceOffset = 0x100;
  const sliceSize = 64;
  const bytes = Buffer.alloc(sliceOffset + sliceSize, 0xaa);
  bytes.writeUInt32BE(0xcafebabe, 0);
  bytes.writeUInt32BE(1, 4);
  bytes.writeUInt32BE(0x0100000c, 8);
  bytes.writeUInt32BE(sliceOffset, 16);
  bytes.writeUInt32BE(sliceSize, 20);
  bytes.writeUInt32LE(0xfeedfacf, sliceOffset);
  bytes.writeUInt32LE(0x0100000c, sliceOffset + 4);

  const result = parseMachO(bytes);
  assert.equal(result.format, "fat-macho");
  assert.equal(result.architecture, "arm64");
  assert.equal(result.ranges[0].fileOffset, sliceOffset);
  assert.equal(result.ranges[0].fileSize, sliceSize);
});

test("重复引用范围不会重复计数", () => {
  const bytes = Buffer.alloc(16);
  bytes.writeBigUInt64LE(0x1000n, 0);
  const result = scanStringReferences(
    bytes,
    [{ value: "Hello", virtual_address: 0x1000 }],
    [
      { fileOffset: 0, fileSize: 8, section: "__const", segment: "__DATA_CONST", virtualAddress: 0x2000 },
      { fileOffset: 0, fileSize: 8, section: "__const", segment: "__DATA_CONST", virtualAddress: 0x2000 },
    ],
  );
  assert.equal(result.summary.scanned_ranges, 1);
  assert.equal(result.summary.scanned_bytes, 8);
  assert.equal(result.summary.matches, 1);
  assert.equal(result.reference_counts[0], 1);
});
