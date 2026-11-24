export function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  const safe = /^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function csv(rows: unknown[][]) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
