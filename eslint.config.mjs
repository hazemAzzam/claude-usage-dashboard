import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTs,
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      ".cache/**",
      "node_modules/**",
    ],
  },
];

export default eslintConfig;
