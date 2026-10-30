export function removalConfirmed(answer: string | null): boolean {
  return null !== answer && /^(y|yes)$/i.test(answer.trim());
}

export function setupConfirmed(answer: string | null): boolean {
  return null !== answer && /^(y|yes)?$/i.test(answer.trim());
}

export function selectedCommands(answer: string | null, defaults: string[]): string[] | null {
  if (null === answer || 'cancel' === answer.trim().toLowerCase()) {
    return null;
  }
  return answer.trim() ? answer.trim().split(/\s+/) : defaults;
}
