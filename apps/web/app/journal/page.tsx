import { requireUser } from "../../auth";
import { Header } from "../header";
import { OpenToday } from "./open-today";

export default async function JournalPage() {
  const user = await requireUser();
  return <><Header email={user.email} /><main className="font-sans"><h1>Journal</h1><OpenToday /></main></>;
}
