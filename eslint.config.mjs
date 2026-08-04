import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // `any` est encore très présent dans les réponses des providers de
      // métadonnées (MusicBrainz, Discogs, Deezer, iTunes) et dans les lignes
      // SQLite. Le typage progressif est suivi comme dette technique : on
      // signale sans bloquer la CI, plutôt que de désactiver la règle.
      "@typescript-eslint/no-explicit-any": "warn",

      // Interface entièrement en français : apostrophes et guillemets sont
      // omniprésents dans le JSX et l'échappement HTML nuirait à la lisibilité.
      "react/no-unescaped-entities": "off",

      // Les catch de nettoyage best-effort (`catch (e) {}`) sont légitimes ici.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
