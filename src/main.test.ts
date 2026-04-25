import { describe, it, expect } from 'vitest';
import { hello } from './main';

describe('hello', () => {
  it('should return the correct greeting', () => {
    expect(hello()).toBe('Hello from Land framework!');
  });
});
