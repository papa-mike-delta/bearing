import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {Client} from 'pg';
const url = process.env.TEST_POSTGRES_URL;
if (!url && process.env.CI) test('people migration requires Postgres',() => assert.fail('TEST_POSTGRES_URL missing'));
test('people migration adds only the account-scoped people table, with dates and rule, and cascades account deletion', {skip:!url},async () => {
  const admin = new Client({connectionString:url});await admin.connect();
  const name = `bearing_people_${randomUUID().replaceAll('-','')}`;
  await admin.query(`create database "${name}"`);
  const parsed = new URL(url!);parsed.pathname=`/${name}`;
  const db = new Client({connectionString:parsed.toString()});
  try {
    await db.connect();
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8')) as {entries:{idx:number;tag:string}[]};
    const apply = async (tag:string) => {for(const statement of readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8').split('--> statement-breakpoint')) if(statement.trim()) await db.query(statement);};
    for(const entry of journal.entries.filter(e => e.idx < 19)) await apply(entry.tag);
    const columns = async () => (await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;
    const before = await columns();await apply('0019_people');const after = await columns();
    assert.deepEqual(after.filter(c => c.table_name !== 'people'),before);
    assert.deepEqual(after.filter(c => c.table_name === 'people').map(c => c.column_name),['id','user_id','name','group','rule','last_connected','agreed_day','created_at','updated_at']);
    const id = randomUUID();await db.query("insert into users(id,email,password_hash) values($1,$2,'-')",[id,`${id}@test.invalid`]);
    await db.query('insert into people(user_id,name,"group") values($1,\'Ada\',\'Family\')',[id]);
    await assert.rejects(db.query('insert into people(user_id,name,"group") values($1,\'Orphan\',\'Family\')',[randomUUID()]));
    await db.query('delete from users where id=$1',[id]);assert.equal((await db.query('select * from people')).rowCount,0);
  } finally {await db.end();await admin.query(`drop database "${name}"`);await admin.end();}
});
