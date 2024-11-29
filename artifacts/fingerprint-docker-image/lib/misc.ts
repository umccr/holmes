export function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export function createFriendlyIds(inputArray: any[], startCharacter: string) {
  let index = 26;
  const results: string[] = [];

  for (const input of inputArray) {
    if (index > 999)
      throw new Error("Friendly ids currently only work up to 999");

    if (index >= 52)
      results.push(
        String.fromCharCode(
          index - 52 + startCharacter.charCodeAt(0),
          index - 52 + startCharacter.charCodeAt(0),
          index - 52 + startCharacter.charCodeAt(0)
        )
      );
    if (index >= 26)
      results.push(
        String.fromCharCode(
          index - 26 + startCharacter.charCodeAt(0),
          index - 26 + startCharacter.charCodeAt(0)
        )
      );
    else
      results.push(String.fromCharCode(index + startCharacter.charCodeAt(0)));

    index++;
  }

  return results;
}
