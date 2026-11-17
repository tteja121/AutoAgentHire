declare module 'mammoth' {
  export interface ConvertResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string },
    options?: any
  ): Promise<ConvertResult>;

  export function extractRawText(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any } | { path: string },
    options?: any
  ): Promise<ConvertResult>;
}

