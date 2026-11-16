/**
 * Minimal CSS.escape for jsdom, which lacks it. Follows the CSSOM serialize-an-identifier algorithm
 * (https://drafts.csswg.org/cssom/#serialize-an-identifier).
 */
export const cssEscape = (value: string): string => {
  const str = String(value);
  const length = str.length;
  let result = '';
  const first = str.charCodeAt(0);
  for (let index = 0; index < length; index++) {
    const code = str.charCodeAt(index);
    const ch = str.charAt(index);
    if (code === 0x0000) {
      result += '\uFFFD';
    } else if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (index === 0 && code >= 0x0030 && code <= 0x0039) ||
      (index === 1 && code >= 0x0030 && code <= 0x0039 && first === 0x002d)
    ) {
      result += `\\${code.toString(16)} `;
    } else if (index === 0 && length === 1 && code === 0x002d) {
      result += `\\${ch}`;
    } else if (
      code >= 0x0080 ||
      code === 0x002d ||
      code === 0x005f ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += ch;
    } else {
      result += `\\${ch}`;
    }
  }
  return result;
};
