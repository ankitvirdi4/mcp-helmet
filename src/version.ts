// Single source of truth for the package version. Re-exported from
// index.ts as `VERSION`. Lives in its own file so the CLI bundle can
// import it without dragging the entire library into the CLI build.

export const VERSION = "0.1.0-alpha.3";
