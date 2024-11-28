/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  setupFiles: ["./jest.setup.js"],
  reporters: ["<rootDir>/jest.reporter.js"],
};
