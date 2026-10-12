/**
 * Strip JSONC comments and trailing commas (respects strings).
 * @param {string} text
 * @returns {string}
 */
export function stripJsonc(text) {
  let out = "";
  let i = 0;
  const len = text.length;
  let inString = false;
  let stringQuote = "";
  let escape = false;

  while (i < len) {
    const c = text[i];

    if (inString) {
      out += c;
      if (escape) {
        escape = false;
      } else if (c === "\\") {
        escape = true;
      } else if (c === stringQuote) {
        inString = false;
      }
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i++;
      continue;
    }

    if (c === "/" && i + 1 < len) {
      const next = text[i + 1];
      if (next === "/") {
        i += 2;
        while (i < len && text[i] !== "\n") i++;
        continue;
      }
      if (next === "*") {
        i += 2;
        while (i + 1 < len && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
    }

    out += c;
    i++;
  }

  return removeTrailingCommas(out);
}

function removeTrailingCommas(json) {
  let out = "";
  let i = 0;
  let inString = false;
  let stringQuote = "";
  let escape = false;

  while (i < json.length) {
    const c = json[i];

    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === stringQuote) inString = false;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString = true;
      stringQuote = c;
      out += c;
      i++;
      continue;
    }

    if (c === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j++;
      if (json[j] === "}" || json[j] === "]") {
        i++;
        continue;
      }
    }

    out += c;
    i++;
  }

  return out;
}

/**
 * @param {string} text
 * @returns {unknown}
 */
export function parseJsonc(text) {
  return JSON.parse(stripJsonc(text));
}
