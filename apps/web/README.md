This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Notes have an optional **Occasion date** field, saved with title, body and pin by **Save Note** under the same unsaved-changes guard. The browser's Today or a past day is allowed; clearing removes it. A future date refuses the entire save. On mobile the input is 16px and at least 40px tall. Related uses the Journal day row's label for a dated Note's detail, preserving undated detail and newest-edge-first order. This does not add a Note to the Journal or give Tasks this field.

Migration `0022_note_occasion` adds only nullable `notes.occasion_date`. Coach `createNote(day?)` uses the same validation, only from a stated day, and returns the stored day on resend. It never attaches a Note to a person. After editing Coach knowledge, run `node scripts/generate-knowledge.ts` from `packages/coach`.

Run the Note editor browser acceptance test against a local app connected to `TEST_POSTGRES_URL`: `NOTE_TEST_BASE_URL=http://localhost:3017 node --test tests/note-occasion.browser.ts` from this directory.
