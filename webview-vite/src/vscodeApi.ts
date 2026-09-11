type VsCodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

let api: VsCodeApi | undefined;

export function getVsCodeApi(): VsCodeApi | undefined {
  if (typeof acquireVsCodeApi === 'undefined') {
    return undefined;
  }

  if (!api) {
    api = acquireVsCodeApi();
  }

  return api;
}
