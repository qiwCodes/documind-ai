declare module "pdf-parse/lib/pdf-parse.js" {
  function parsePdf(
    dataBuffer: Buffer,
    options?: unknown,
  ): Promise<{ text: string; numpages?: number }>;
  export = parsePdf;
}
