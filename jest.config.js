module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js', '**/__tests__/**/*.test.js'],
    collectCoverageFrom: ['src/**/*.js', '!src/**/__tests__/**'],
    coverageDirectory: 'coverage',
    verbose: true
};
