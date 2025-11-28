import '@testing-library/jest-dom';

// Mock indexedDB for testing
const indexedDB = require('fake-indexeddb');
global.indexedDB = indexedDB.indexedDB;
global.IDBKeyRange = indexedDB.IDBKeyRange;
global.IDBTransaction = indexedDB.IDBTransaction;

// Mock fetch for tests
global.fetch = jest.fn();

// Mock AbortController
global.AbortController = jest.fn().mockImplementation(() => ({
  signal: {},
  abort: jest.fn(),
}));

global.AbortSignal = {
  timeout: jest.fn().mockReturnValue({}),
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});