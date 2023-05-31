/**
 * WIP code - considering using a different escape technique rather than hexencoding the names
 */

/**
 * Takes an arbitrary unicode string and escape into only ASCII A-Za-z0-9 and _ (the escape character).
 */
export function safeS3Escape(s: string): string {
  const byteArr = Array.from(new TextEncoder().encode(s));

  let newString = "";

  for (let i = 0; i < byteArr.length; i++) {
    const byte = byteArr[i];

    if (byte >= "A".charCodeAt(0) && byte <= "Z".charCodeAt(0)) {
      newString += String.fromCharCode(byte);
    } else if (byte >= "a".charCodeAt(0) && byte <= "z".charCodeAt(0)) {
      newString += String.fromCharCode(byte);
    } else if (byte >= "0".charCodeAt(0) && byte <= "9".charCodeAt(0)) {
      newString += String.fromCharCode(byte);
    } else if (byte === ".".charCodeAt(0) || byte === "-".charCodeAt(0)) {
      newString += String.fromCharCode(byte);
    } else {
      newString += `_${byte.toString(16)}`;
    }
  }

  return newString;
}

export function safeS3Unescape(s: string): string {
  if (!/^[A-Za-z0-9_.\-]*$/.test(s))
    throw new Error(
      `String ${s} was not escaped correctly as it had characters outside our escape range`
    );

  let escapedCount = 0;

  for (const c of s) {
    if (c === "_") escapedCount++;
  }

  const byteBuffer = new Buffer(100);

  return "";

  /*byteBuffer.

  for (let i = 0; i < s.length; i++) {
    if (s[i] === '_') {
      const fromHex = parseInt(s[i+1] + s[i+2], 16);

      byteArr.push(fromHex);

      i++;
      i++;
    }
    else
      byteArr.push(s[i].charCodeAt(0));
  }

  return new TextDecoder().decode(byteArr); */
}
