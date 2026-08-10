// react-pdf's stylesheet side-effect imports have no type declarations.
// Referenced via triple-slash from pdf-worker.ts so the declaration travels
// with the source for consumers that type-check it directly (types -> src).
declare module "react-pdf/dist/Page/AnnotationLayer.css";
declare module "react-pdf/dist/Page/TextLayer.css";
