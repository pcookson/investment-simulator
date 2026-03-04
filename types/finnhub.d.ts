// Minimal type declaration for the `finnhub` npm package.
// The package ships without TypeScript definitions; we declare only what we use.

declare module "finnhub" {
  class DefaultApi {
    constructor(apiKey: string);

    quote(
      symbol: string,
      callback: (
        error: Error | null,
        data: { c: number; pc: number }
      ) => void
    ): void;

    symbolSearch(
      q: string,
      opts: { exchange?: string },
      callback: (
        error: Error | null,
        data: {
          result?: Array<{
            description: string;
            displaySymbol: string;
            symbol: string;
            type: string;
          }>;
        }
      ) => void
    ): void;
  }

  const _exports: { DefaultApi: typeof DefaultApi };
  export default _exports;
}
