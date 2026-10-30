import { createInterface } from 'node:readline';

export interface Interaction {
  ask(message: string): Promise<string | null>;
  write(message: string): void;
}
export function terminalInteraction() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const lines = terminal[Symbol.asyncIterator]();
  terminal.on('SIGINT', () => {
    process.exitCode = 130;
    terminal.close();
  });
  return {
    ask: async (message: string) => {
      process.stdout.write(message);
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    write: (message: string) => {
      console.log(message);
    },
    close: () => {
      terminal.close();
    },
  };
}
