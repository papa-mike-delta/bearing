"use client";
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Textarea } from '@repo/ui/components/textarea';
import { useBrowserToday } from '../app/browser-today';
import { addPersonNote } from '../app/people/actions';
import { logDraftOnPerson } from '../app/inbox/actions';

export function LogPersonNote({personId,draftId}:{personId?:string;draftId?:string}) {
 const today=useBrowserToday();const router=useRouter();
 const [text,setText]=useState('');const [name,setName]=useState('');const [day,setDay]=useState('');const [error,setError]=useState('');const [saved,setSaved]=useState<string|null>(null);
 const [pending,start]=useTransition();const identity=useRef<string|null>(null);
 const prefix=draftId ?? personId;
 const form=<form className="person-note-form" onSubmit={event=>{
 event.preventDefault();if(!today) return;
 identity.current ??= crypto.randomUUID();setError('');setSaved(null);
 start(async()=>{
 try {
 const result=draftId?await logDraftOnPerson(draftId,name,day||null,today):await addPersonNote(personId!,text,day||null,today,identity.current!);
 if('error' in result) setError(result.error);
 else if(draftId) router.push(result.href);
 else {setText('');setDay('');identity.current=null;setSaved(result.href);router.refresh();}
 }catch{setError('Could not log. Your text is kept here; retry to return the saved Note without a duplicate.');}
 });
 }}>
 {draftId?<label htmlFor={`person-${prefix}`}>Person name<Input id={`person-${prefix}`} value={name} onChange={e=>setName(e.target.value)} disabled={pending} required /></label>:<label htmlFor={`text-${prefix}`}>Note text<Textarea id={`text-${prefix}`} value={text} onChange={e=>{setText(e.target.value);identity.current=null;}} rows={4} disabled={pending} required /></label>}
 <label htmlFor={`occasion-${prefix}`}>Occasion date (optional)<Input id={`occasion-${prefix}`} type="date" min="0001-01-01" max={today ?? undefined} value={day} onChange={e=>{setDay(e.target.value);identity.current=null;}} disabled={pending} /></label>
 {error&&<p role="alert">{error}</p>}
 {saved&&<p role="status">Note added. <a href={saved}>Open Note</a></p>}
 <Button variant="outline" type="submit" disabled={pending || !today}>{pending?'Logging…':draftId?'Log on person':'Add note'}</Button>
 </form>;
 return draftId?<details className="w-full"><summary>Log on person</summary>{form}</details>:<section aria-label="Add note">{form}</section>;
}
