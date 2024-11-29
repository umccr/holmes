/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest",
  },
  testTimeout: 15000,
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  setupFiles: ["./jest.setup.js"],
  reporters: ["<rootDir>/jest.reporter.js"],
};
