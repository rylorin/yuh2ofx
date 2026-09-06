// typescript-eslint fait require("typescript") codé en dur (voir
// node_modules/@typescript-eslint/typescript-estree/dist/parseSettings/createParseSettings.js),
// mais il ne supporte pas encore TS 7 (issue typescript-eslint#10940).
// On redirige donc la résolution du module "typescript" vers l'API TS 6
// (@typescript/typescript6) pour tout le processus eslint.
// Le binaire `tsc` (TS 7) reste utilisé par build/type-check.
// Le jour où typescript-eslint supportera TS 7, on pourra supprimer ce hack.
//
// ATTENTION : ce module doit être importé AVANT "typescript-eslint" dans
// eslint.config.mjs, car en ESM les imports sont évalués dans l'ordre de déclaration.
import Module from "node:module";

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "typescript") {
    request = "@typescript/typescript6";
  }
  return originalResolveFilename.call(this, request, ...args);
};
