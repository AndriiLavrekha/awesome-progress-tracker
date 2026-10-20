import { describe, expect, it } from "vitest";
import { hasMojibake, repairEncoding } from "../src/encoding.js";

describe("repairEncoding", () => {
  it("restores UTF-8 text that was misread as Windows-1252", () => {
    expect(repairEncoding("closure \u00e2\u20ac\u201d done")).toBe("closure — done");
    expect(repairEncoding("\u00e2\u20ac\u0153quoted\u00e2\u20ac\u009d")).toBe("“quoted”");
    expect(repairEncoding("Gr\u00c3\u00bc\u00c3\u0178e")).toBe("Grüße");
    expect(repairEncoding("\uFEFF# Title")).toBe("# Title");
    expect(repairEncoding("\u00ef\u00bb\u00bf# Title")).toBe("# Title");
  });

  it("leaves clean text unchanged", () => {
    const text = "Plain — text with ü, “quotes” and SÃO PAULO.";
    expect(repairEncoding(text)).toBe(text);
  });
});

describe("hasMojibake", () => {
  it("detects only exact garbled sequences", () => {
    expect(hasMojibake("a \u00e2\u20ac\u201d b")).toBe(true);
    expect(hasMojibake("a — b, SÃO PAULO")).toBe(false);
  });
});
