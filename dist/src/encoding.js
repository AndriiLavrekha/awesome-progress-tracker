// Characters whose UTF-8 bytes, misread as Windows-1252, produce the garbled
// text that Windows tools write when they save UTF-8 with the wrong encoding.
// shortcut: rare false positives (a capital Ã or Â right before one of these bytes, e.g. Portuguese "IRMÃ" + NBSP) get "repaired", also inside code fences; narrow the list if that ever bites.
const REPAIRABLE = "—–‘’“”…•·×→ÄÖÜäöüßéèàç";
// Windows-1252 differs from Latin-1 only in 0x80-0x9F. Spelled out because
// Node builds without full ICU decode "windows-1252" as Latin-1. Unassigned
// bytes (0x81, 0x8D, 0x8F, 0x90, 0x9D) map to the same code point, as WHATWG does.
const CP1252_HIGH = {
    0x80: "\u20ac", 0x82: "\u201a", 0x83: "\u0192", 0x84: "\u201e", 0x85: "\u2026", 0x86: "\u2020",
    0x87: "\u2021", 0x88: "\u02c6", 0x89: "\u2030", 0x8a: "\u0160", 0x8b: "\u2039", 0x8c: "\u0152",
    0x8e: "\u017d", 0x91: "\u2018", 0x92: "\u2019", 0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022",
    0x96: "\u2013", 0x97: "\u2014", 0x98: "\u02dc", 0x99: "\u2122", 0x9a: "\u0161", 0x9b: "\u203a",
    0x9c: "\u0153", 0x9e: "\u017e", 0x9f: "\u0178"
};
function asWindows1252(bytes) {
    return [...bytes].map((byte) => CP1252_HIGH[byte] ?? String.fromCharCode(byte)).join("");
}
const utf8 = new TextEncoder();
const GARBLED = [
    [asWindows1252(new Uint8Array([0xef, 0xbb, 0xbf])), ""],
    ...[...REPAIRABLE].map((char) => [asWindows1252(utf8.encode(char)), char])
];
export function repairEncoding(text) {
    let repaired = text;
    for (const [garbled, char] of GARBLED)
        repaired = repaired.split(garbled).join(char);
    return repaired.replace(/^\uFEFF/, "");
}
export function hasMojibake(text) {
    return text.startsWith("\uFEFF") || GARBLED.some(([garbled]) => text.includes(garbled));
}
