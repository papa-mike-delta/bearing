import { peopleArticle } from "@repo/coach/knowledge";
import Link from "next/link";
import { requireUser } from "../../../../auth";
import { renderMarkdownPreview } from "../../../../lib/markdown";
import { Header } from "../../../header";

export default async function PeopleKnowledge() {
  const user = await requireUser();
  const article = await peopleArticle();
  return (
    <>
      <Header email={user.email} />
      <main className="font-sans">
        <Link href="/coach">Coach</Link>
        <article className="markdown-preview">
          {renderMarkdownPreview(article.body).content}
        </article>
      </main>
    </>
  );
}
