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

      // Règle du React Compiler introduite par eslint-plugin-react-hooks 7.
      // Elle vise le motif « charger des données dans un effet » : le
      // `setLoading(true)` synchrone en tête de fonction de fetch déclenche un
      // rendu supplémentaire. Ce n'est pas un bug, mais une optimisation
      // manquée sur 6 composants. On la garde visible sans bloquer la CI ;
      // la migration se fera composant par composant.
      "react-hooks/set-state-in-effect": "warn",

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
