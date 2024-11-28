const { DefaultReporter } = require("@jest/reporters");

// From https://github.com/jestjs/jest/issues/4156

class Reporter extends DefaultReporter {
  constructor() {
    super(...arguments);
  }

  printTestFileHeader(_testPath, config, result) {
    const console = result.console;

    if (result.numFailingTests === 0 && !result.testExecError) {
      result.console = null;
    }

    super.printTestFileHeader(...arguments);

    result.console = console;
  }
}

module.exports = Reporter;
