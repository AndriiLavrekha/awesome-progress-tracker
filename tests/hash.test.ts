import { describe, expect, it } from "vitest";
import { bodyHash, bodyOf, sha256 } from "../src/hash.js";

describe("sha256", () => {
  it("is stable and differs for different inputs", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
    expect(sha256("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("bodyOf", () => {
  it("strips a leading frontmatter block", () => {
    const markdown = "---\nproject: Demo\nstatus: active\n---\n\n## Next Action\n\nDo the thing.\n";
    expect(bodyOf(markdown)).toBe("\n## Next Action\n\nDo the thing.\n");
  });

  it("returns the whole document when there is no frontmatter", () => {
    const markdown = "## Next Action\n\nDo the thing.\n";
    expect(bodyOf(markdown)).toBe(markdown);
  });

  it("returns the whole document when the frontmatter is unterminated", () => {
    const markdown = "---\nproject: Demo\n\n## Next Action\n";
    expect(bodyOf(markdown)).toBe(markdown);
  });

  it("strips a leading byte order mark", () => {
    expect(bodyOf("\uFEFF---\na: 1\n---\nbody\n")).toBe("body\n");
  });
});

describe("bodyHash", () => {
  it("ignores frontmatter-only changes", () => {
    const before = "---\nhandoff: clean\n---\n\n## Next Action\n\nDo the thing.\n";
    const after = "---\nhandoff: interrupted\nsession_id: abc\n---\n\n## Next Action\n\nDo the thing.\n";
    expect(bodyHash(after)).toBe(bodyHash(before));
  });

  it("changes when the body changes", () => {
    const before = "---\na: 1\n---\n\n## Next Action\n\nDo the thing.\n";
    const after = "---\na: 1\n---\n\n## Next Action\n\nDo a different thing.\n";
    expect(bodyHash(after)).not.toBe(bodyHash(before));
  });

  it("treats CRLF and LF bodies as identical", () => {
    const lf = "---\na: 1\n---\n\n## Next Action\n\nDo the thing.\n";
    const crlf = "---\r\na: 1\r\n---\r\n\r\n## Next Action\r\n\r\nDo the thing.\r\n";
    expect(bodyHash(crlf)).toBe(bodyHash(lf));
  });
});
