import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Datos auxiliares de pdf.js (fuentes estándar, perfiles de color y .wasm de imágenes JBIG2/JPEG2000) que
// el visor de PDF pide solo cuando un documento los necesita. Se sirven desde /pdfjs/ copiándolos de
// node_modules, así la versión siempre coincide con la de la librería y no se guardan en el repositorio.
const CARPETAS_PDFJS = ["wasm", "standard_fonts", "iccs"];
const TIPOS = { ".wasm": "application/wasm", ".js": "text/javascript", ".ttf": "font/ttf", ".icc": "application/octet-stream" };

const recursosPdfjs = () => {
  const raiz = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  return {
    name: "recursos-pdfjs",
    configureServer(server) {
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const relativa = decodeURIComponent((req.url || "").split("?")[0]).replace(/^\/+/, "");
        const [carpeta] = relativa.split("/");
        const archivo = path.join(raiz, relativa);
        if (!CARPETAS_PDFJS.includes(carpeta) || !archivo.startsWith(raiz + path.sep) || !existsSync(archivo)) return next();
        res.setHeader("Content-Type", TIPOS[path.extname(archivo)] || "application/octet-stream");
        res.end(readFileSync(archivo));
      });
    },
    generateBundle() {
      for (const carpeta of CARPETAS_PDFJS) {
        const dir = path.join(raiz, carpeta);
        if (!existsSync(dir)) continue;
        for (const nombre of readdirSync(dir)) {
          if (nombre.startsWith("LICENSE")) continue;
          this.emitFile({ type: "asset", fileName: `pdfjs/${carpeta}/${nombre}`, source: readFileSync(path.join(dir, nombre)) });
        }
      }
    },
  };
};

export default defineConfig({
  plugins: [react(), recursosPdfjs()],
  server: { port: 5173 },
});
