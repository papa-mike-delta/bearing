import { isCalendarDay } from './areas.ts';
import { nextDate, parseNextDateRule, type NextDateRule } from './next-date.ts';

export const peopleGroups = ['Family', 'Extended family', 'Intimate friends', 'Close friends', 'Casual friends', 'Acquaintances', 'Business contacts', 'Almost strangers'] as const;
export type PeopleGroup = typeof peopleGroups[number];
export type PersonFields = { name: string; group: string; rule: NextDateRule | null; lastConnected: string | null; agreedDay: string | null };
export class PersonError extends Error {}
export function personIdentity(input: {name:unknown;group:unknown}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 200) throw new PersonError('Use a name between 1 and 200 characters.');
  if (!peopleGroups.includes(input.group as PeopleGroup)) throw new PersonError('Choose a group.');
  return {name,group:input.group as PeopleGroup};
}
export function validatePerson(input: { name: unknown; group: unknown; rule: unknown; lastConnected: unknown; agreedDay: unknown }, today: string): PersonFields {
  const {name,group} = personIdentity(input);
  if (!isCalendarDay(today)) throw new PersonError("Supply the browser's Today as a real YYYY-MM-DD calendar day.");
  const rule = input.rule === null ? null : parseNextDateRule(input.rule);
  if (input.rule !== null && !rule) throw new PersonError('Use a valid next-date rule.');
  const { lastConnected, agreedDay } = input;
  if (lastConnected !== null && (typeof lastConnected !== 'string' || !isCalendarDay(lastConnected) || lastConnected > today)) throw new PersonError('Last connected must be today or a past day.');
  if (agreedDay !== null && (typeof agreedDay !== 'string' || !isCalendarDay(agreedDay) || agreedDay < today || !rule)) throw new PersonError('An agreed day must be today or later and requires a rule.');
  return { name, group, rule, lastConnected: lastConnected as string | null, agreedDay: agreedDay as string | null };
}
export function personNextReachOut(person: Pick<PersonFields, 'rule' | 'lastConnected' | 'agreedDay'>): string | null {
  return person.rule ? person.agreedDay ?? (person.lastConnected ? nextDate(person.rule, person.lastConnected) : null) : null;
}
export function personIsDue(person: Pick<PersonFields, 'rule' | 'lastConnected' | 'agreedDay'>, today: string): boolean {
  const day = personNextReachOut(person);
  return isCalendarDay(today) && day !== null && day <= today;
}
export function groupPeople<T extends PersonFields>(people: readonly T[], today: string) {
  return peopleGroups.flatMap(group => {
    const rows = people.filter(p => p.group === group).sort((a,b) => {
      const ad = personNextReachOut(a), bd = personNextReachOut(b);
      const rank = (day: string | null) => day === null ? 2 : day <= today ? 0 : 1;
      return rank(ad) - rank(bd) || (rank(ad) === 1 ? ad!.localeCompare(bd!) : 0) || a.name.localeCompare(b.name);
    });
    return rows.length ? [{ group, people: rows, open: rows.some(p => personIsDue(p, today)) }] : [];
  });
}
