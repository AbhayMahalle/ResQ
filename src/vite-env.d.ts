/// <reference types="vite/client" />

declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?url' {
  const workerUrl: string;
  export default workerUrl;
}

