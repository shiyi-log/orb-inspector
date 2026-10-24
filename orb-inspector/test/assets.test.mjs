import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAssetutilRecords } from "../src/assets.mjs";

test("汇总 assetutil 元数据并单独保留头部", () => {
  const summary = summarizeAssetutilRecords([
    {
      AssetStorageVersion: "fixture",
      Platform: "macosx",
      SchemaVersion: 2,
    },
    {
      AssetType: "Color",
      Name: "AccentColor",
      SHA1Digest: "abc",
      SizeOnDisk: 10,
    },
    {
      AssetType: "Image",
      Name: "MenuIcon",
      Scale: 2,
      PixelWidth: 32,
      PixelHeight: 32,
    },
    {
      AssetType: "Image",
      Name: "LocalizedIcon",
      Localization: "zh_CN",
    },
  ], { maxRecords: 2 });

  assert.equal(summary.record_count, 3);
  assert.deepEqual(summary.asset_type_counts, { Color: 1, Image: 2 });
  assert.deepEqual(summary.names, ["AccentColor", "MenuIcon"]);
  assert.deepEqual(summary.localization_fields, ["Localization"]);
  assert.equal(summary.records.length, 2);
  assert.equal(summary.metadata_header.Platform, "macosx");
});
