"use client";
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { defaultNextDateRule, maxNextDateEvery, nextDatePhrase, nextDateUnits, parseNextDateRule, peopleGroups, personNextReachOut, weekdays, type PersonFields } from '@repo/domain';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { useExplicitSave } from '../../lib/use-explicit-save';
import { useBrowserToday } from '../browser-today';
import { removePerson, updatePerson } from './actions';
type Person = PersonFields & {id:string};
export function PersonEditor({person}:{person:Person}) {
  const today = useBrowserToday();
  const session = useExplicitSave({
    initial:{saved:person,value:fields(person)},subject:'Person',
    equal:(a,b) => a.name === b.name && a.group === b.group && JSON.stringify(a.rule) === JSON.stringify(b.rule) && a.lastConnected === b.lastConnected && a.agreedDay === b.agreedDay,
    failureMessage:'Could not save. Your changes are kept here; please try again.',
    save:async ({value}) => {
      if (!today) return {error:'Wait for the browser’s Today before saving.'};
      const result = await updatePerson(person.id,value,today);
      if ('error' in result) return result;
      window.dispatchEvent(new Event('people-changed'));
      return {value:fields(result.person),saved:result.person};
    },
  });
  const {value,dirty,error} = session;
  const [deleting,start] = useTransition(); const router = useRouter();
  const pending = session.pending || deleting;
  const edit = (patch:Partial<PersonFields>) => session.edit({...value,...patch});
  useEffect(() => {
    const connected = (event:KeyboardEvent) => {
      if (pending || !today || event.key.toLowerCase() !== 'r' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,button,[contenteditable]'))) return;
      event.preventDefault();session.edit({...value,lastConnected:today});
    };
    window.addEventListener('keydown',connected);
    return () => window.removeEventListener('keydown',connected);
  },[pending,today,session,value]);
  const rule = value.rule === null ? null : parseNextDateRule(value.rule);
  const reachOut = personNextReachOut({...value,rule});
  return <form data-explicit-save-editor className="flex flex-col gap-5" onSubmit={event => {event.preventDefault();session.save();}}>
    <fieldset disabled={pending} className="flex flex-col gap-4">
      <label>Name<Input name="name" value={value.name} required maxLength={200} onChange={e => edit({name:e.target.value})}/></label>
      <label>Group<select aria-label="Group" name="group" className="border rounded p-2 block" value={value.group} required onChange={e => edit({group:e.target.value})}>{peopleGroups.map(g => <option key={g}>{g}</option>)}</select></label>
      <label><input type="checkbox" checked={value.rule !== null} onChange={e => edit({rule:e.target.checked ? {...defaultNextDateRule} : null})}/> Reach-out rule</label>
      {value.rule !== null && <div className="flex flex-wrap items-end gap-3">
        <label>Every<Input type="number" name="every" min={1} max={maxNextDateEvery} required value={value.rule.every || ''} onChange={e => edit({rule:{...value.rule!,every:Number(e.target.value)}})}/></label>
        <label>Unit<select aria-label="Unit" name="unit" className="border rounded p-2 block" value={value.rule.unit} onChange={e => edit({rule:{every:value.rule!.every,unit:e.target.value} as PersonFields['rule']})}>{nextDateUnits.map(u => <option key={u}>{u}</option>)}</select></label>
        {value.rule.unit !== 'days' && <label>On day (optional)<select aria-label="On day (optional)" name="on" className="border rounded p-2 block" value={value.rule.on ?? ''} onChange={e => {
          const {every,unit} = value.rule!;
          const on = e.target.value;
          edit({rule:(on === '' ? {every,unit} : {every,unit,on:unit === 'months' && on !== 'last' ? Number(on) : on}) as PersonFields['rule']});
        }}><option value="">Same day as last connected</option>{value.rule.unit === 'weeks' ? weekdays.map(d => <option key={d} value={d}>{d[0]!.toUpperCase()+d.slice(1)}</option>) : <>{Array.from({length:31},(_,i) => <option key={i+1} value={i+1}>{i+1}</option>)}<option value="last">Last day</option></>}</select></label>}
      </div>}
      <p aria-live="polite">{value.rule === null ? 'No reach-out rule' : rule ? nextDatePhrase(rule) : 'Use a valid next-date rule.'}</p>
      <label>Last connected<Input type="date" name="lastConnected" max={today ?? undefined} value={value.lastConnected ?? ''} onChange={e => edit({lastConnected:e.target.value || null})}/></label>
      <Button type="button" variant="outline" disabled={!today} onClick={() => edit({lastConnected:today})}>Connected today</Button>
      <label>Agreed day<Input type="date" name="agreedDay" min={today ?? undefined} value={value.agreedDay ?? ''} onChange={e => edit({agreedDay:e.target.value || null})}/></label>
      <p>Next reach-out: <output>{reachOut ?? 'No reach-out day'}</output></p>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <span role="status">{pending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
      <Button type="submit" disabled={pending || !dirty || !today}>Save person</Button>
      <Button type="button" variant="destructive" className="ml-auto" disabled={pending} onClick={() => {
        if (!window.confirm('Delete this person?')) return;
        start(async () => {try {
          const result = await removePerson(person.id);
          if ('error' in result) session.setError(result.error);
          else {window.dispatchEvent(new Event('people-changed'));session.leaveWithoutPrompt();router.push(result.href);}
        } catch {session.setError('Could not delete. Please try again.');}});
      }}>Delete person</Button>
    </div>
  </form>;
}
function fields({name,group,rule,lastConnected,agreedDay}:PersonFields):PersonFields {return {name,group,rule,lastConnected,agreedDay};}
