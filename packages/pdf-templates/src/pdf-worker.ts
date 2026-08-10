/**
 * PDF.js worker configuration for react-pdf viewer.
 * Import once before using Document/Page from react-pdf.
 */
// Ambient CSS-module declarations only enter a compilation via this
// reference: consumers type-check this source directly (types -> src).
/// <reference path="./react-pdf-css.d.ts" />
import { pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}
