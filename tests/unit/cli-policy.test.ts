import { expect, it } from 'vitest';
import { help, parseManagement, UsageError } from '../../src/cli/parsing.js';
import { removalConfirmed, setupConfirmed, selectedCommands } from '../../src/wizard/decisions.js';

it.each([
  [['--help'], false, { operation: 'help' }],
  [['init', 'custom', 'other'], false, { operation: 'init', commands: ['custom', 'other'] }],
  [['configure'], true, { operation: 'configure', commands: [] }],
  [['init'], true, { operation: 'init', commands: [] }],
  [['configure', 'tool'], undefined, { operation: 'configure', commands: ['tool'] }],
  [['status'], false, { operation: 'status', json: false }],
  [['status', '--json'], false, { operation: 'status', json: true }],
  [['route', 'list'], false, { operation: 'route-list' }],
  [['route', 'add', 'a', 'b'], false, { operation: 'route-add', commands: ['a', 'b'] }],
  [['route', 'remove', 'a'], false, { operation: 'route-remove', commands: ['a'] }],
  [['deinit'], true, { operation: 'deinit', yes: false }],
  [['deinit', '--yes'], false, { operation: 'deinit', yes: true }],
  [['uninstall'], false, { operation: 'uninstall', yes: false }],
  [['uninstall', '--yes'], undefined, { operation: 'uninstall', yes: true }],
] as const)('parses %j without mutating its arguments', (args, interactive, expected) => {
  expect(parseManagement(Object.freeze(args), interactive)).toEqual(expected);
});

it.each([
  [[], 'Unknown command'],
  [['--help', 'extra'], 'Unknown command'],
  [['run', 'tool', '--'], 'Unknown command'],
  [['init'], 'Use init <commands...> outside an interactive terminal'],
  [['configure'], 'Use configure <commands...> outside an interactive terminal'],
  [['init', 'tool', '--yes'], 'Unknown option'],
  [['configure', '--tool'], 'Unknown option'],
  [['status', 'extra'], 'Expected status [--json]'],
  [['status', '--json', '--json'], 'Expected status [--json]'],
  [['route'], 'Expected route list | route add/remove <commands...>'],
  [['route', 'list', 'extra'], 'Unknown route operation'],
  [['route', 'other', 'tool'], 'Unknown route operation'],
  [['route', 'add'], 'Expected route list | route add/remove <commands...>'],
  [['route', 'remove', '--tool'], 'Expected route list | route add/remove <commands...>'],
  [['route', 'add', 'tool', '--flag'], 'Expected route list | route add/remove <commands...>'],
  [['deinit'], 'Removal requires deinit --yes outside an interactive terminal'],
  [['deinit', '--no'], 'Expected deinit/uninstall [--yes]'],
  [['uninstall', '--yes', '--yes'], 'Expected deinit/uninstall [--yes]'],
] as const)('rejects %j with its original management diagnostic', (args, message) => {
  expect(() => parseManagement(args, false)).toThrow(new UsageError(`${message}\n${help}`));
});

it.each([
  [null, false, false],
  ['', false, true],
  [' ', false, true],
  ['y', true, true],
  [' YES ', true, true],
  ['Y', true, true],
  ['n', false, false],
  ['yes please', false, false],
  ['maybe yes', false, false],
  ['cancel', false, false],
] as const)('keeps removal and setup defaults distinct for %j', (answer, removal, setup) => {
  expect(removalConfirmed(answer)).toBe(removal);
  expect(setupConfirmed(answer)).toBe(setup);
});

it('separates cancellation, defaults and explicit command input without validation side effects', () => {
  const defaults = ['claude'];
  expect(selectedCommands(null, defaults)).toBeNull();
  expect(selectedCommands(' CaNcEl ', defaults)).toBeNull();
  expect(selectedCommands('', defaults)).toBe(defaults);
  expect(selectedCommands('  ', defaults)).toBe(defaults);
  expect(selectedCommands(' custom\tother ', defaults)).toEqual(['custom', 'other']);
  expect(selectedCommands('custom   other', defaults)).toEqual(['custom', 'other']);
  // Domain validation still belongs to the authoritative setup validator.
  expect(selectedCommands('node node', defaults)).toEqual(['node', 'node']);
  expect(defaults).toEqual(['claude']);
});
