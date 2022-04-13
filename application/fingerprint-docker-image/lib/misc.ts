export function chunk(arr: any[], size: number) {
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_: any, i: number) => arr.slice(i * size, i * size + size)
  );
}

export function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
