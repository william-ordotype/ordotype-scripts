// Parse-floor gate. Every .js here is served RAW from jsDelivr to the Webflow
// site, including old hospital browsers (Chrome 78 / Safari 13 fleet). With
// ecmaVersion 2019, any ES2020+ SYNTAX (?., ??, ??=, class fields...) is a
// PARSE error in this lint run - the bug class of Sentry ORDOTYPE-FRONTEND-1FB
// /1F7/19K, where one token kills an entire file on those browsers.
// No style rules on purpose: this gate checks parseability only.
// Run: npx --yes eslint@9 .   (also run by .github/workflows/parse-floor.yml)
module.exports = [
  {
    ignores: [
      "**/*.min.js",
      "**/node_modules/**",
      // Not served to the site (tooling / data / experiments)
      "qr_code_switch/**",
      "generation-pdf-ordos/**",
      "winback/**",
      "ordonnances/**",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2019,
      sourceType: "script",
    },
    rules: {},
  },
];
