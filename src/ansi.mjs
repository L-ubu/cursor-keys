const esc = (n) => `\u001b[${n}m`;

export const reset = esc(0);
export const bold = esc(1);
export const dim = esc(2);
export const red = esc(31);
export const green = esc(32);
export const yellow = esc(33);
export const blue = esc(34);
export const magenta = esc(35);
export const cyan = esc(36);

export function colorize(text, code) {
  return `${code}${text}${reset}`;
}

export function ok(text) {
  return colorize(text, green);
}

export function warn(text) {
  return colorize(text, yellow);
}

export function err(text) {
  return colorize(text, red);
}

export function padEnd(str, len) {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

export function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)),
  );
  const line = widths.map((w) => "-".repeat(w)).join("-+-");
  console.log(widths.map((w, i) => padEnd(headers[i], w)).join(" | "));
  console.log(line);
  for (const row of rows) {
    console.log(
      widths.map((w, i) => padEnd(String(row[i] ?? ""), w)).join(" | "),
    );
  }
}

export function blockSwatch(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "  ";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${esc(48)};2;${r};${g};${b}m  ${reset}`;
}
