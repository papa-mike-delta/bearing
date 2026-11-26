# Source inventory

> Historical snapshot from before the 2026-10-26 legacy sunset. Do not treat the
> pre-V1 routes or shells listed below as live. See
> [ADR 0005](../docs/adr/0005-sunset-legacy-domain-and-coach.md).

Generated with `node e2e/scripts/inventory.mjs`. Every JSX button/link/form (including reusable primitives and dynamic templates) is listed with source location and attributes. Dynamic maps represent all rendered variants. Inputs/selects and custom action components are included.

## Routes

| File | URL | Methods |
| --- | --- | --- |
| src/app/api/ai/smart-inbox/route.ts | /api/ai/smart-inbox | POST |
| src/app/api/auth/2fa-status/route.ts | /api/auth/2fa-status | GET |
| src/app/api/auth/disable-2fa/route.ts | /api/auth/disable-2fa | POST |
| src/app/api/auth/login/route.ts | /api/auth/login | POST |
| src/app/api/auth/logout/route.ts | /api/auth/logout | POST |
| src/app/api/auth/profile/route.ts | /api/auth/profile | PATCH |
| src/app/api/auth/qr-login/route.ts | /api/auth/qr-login | POST, GET |
| src/app/api/auth/register/route.ts | /api/auth/register | POST |
| src/app/api/auth/session/route.ts | /api/auth/session | GET |
| src/app/api/auth/setup-2fa/route.ts | /api/auth/setup-2fa | POST |
| src/app/api/auth/verify/route.ts | /api/auth/verify | POST |
| src/app/api/backup/route.ts | /api/backup | GET, POST |
| src/app/api/calendar/route.ts | /api/calendar | GET |
| src/app/api/domains/route.ts | /api/domains | GET |
| src/app/api/export/route.ts | /api/export | GET |
| src/app/api/graph/route.ts | /api/graph | GET |
| src/app/api/inbox/route.ts | /api/inbox | GET, POST |
| src/app/api/insights/route.ts | /api/insights | GET |
| src/app/api/items/[id]/habit-logs/route.ts | /api/items/[id]/habit-logs | GET, POST |
| src/app/api/items/[id]/links/route.ts | /api/items/[id]/links | GET, POST, DELETE |
| src/app/api/items/[id]/open/route.ts | /api/items/[id]/open | PUT, DELETE |
| src/app/api/items/[id]/route.ts | /api/items/[id] | GET, PATCH, DELETE |
| src/app/api/items/route.ts | /api/items | GET, POST |
| src/app/api/on-this-day/route.ts | /api/on-this-day | GET |
| src/app/api/preferences/route.ts | /api/preferences | GET, PATCH |
| src/app/api/projects/[id]/route.ts | /api/projects/[id] | GET, PATCH, DELETE |
| src/app/api/projects/route.ts | /api/projects | GET, POST |
| src/app/api/public-prefs/route.ts | /api/public-prefs | GET |
| src/app/api/reset-db/route.ts | /api/reset-db | POST |
| src/app/api/reviews/[id]/route.ts | /api/reviews/[id] | PATCH, DELETE |
| src/app/api/reviews/route.ts | /api/reviews | GET, POST |
| src/app/api/route.ts | /api | GET |
| src/app/api/scheduler/route.ts | /api/scheduler | POST |
| src/app/api/search/route.ts | /api/search | GET |
| src/app/api/seed/route.ts | /api/seed | POST |
| src/app/api/stats/route.ts | /api/stats | GET |
| src/app/api/tags/route.ts | /api/tags | GET, POST |
| src/app/app/page.tsx | /app | page |
| src/app/login/page.tsx | /login | page |
| src/app/page.tsx | / | page |
| src/app/sitemap.xml/route.ts | /sitemap.xml | page |

## UI controls

| Source | Element | Text / attributes / handler |
| --- | --- | --- |
| src/app/login/page.tsx:133 | button | Sign in onClick={() => { setMode("login"); setError(""); }} |
| src/app/login/page.tsx:139 | button | Create account onClick={() => { setMode("register"); setError(""); }} |
| src/app/login/page.tsx:147 | form |  {mode === "register" && ( <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}> <Label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Name</Label> <div className="relative"> <Brain className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" /> <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="h-11 pl-10" /> </div> </motion.div> )} {error && ( <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-500"> {error} </motion.p> )} {mode === "login" && ( <div className="space-y-2"> <Button type="button" variant="outline" disabled={loading} onClick={fillDemoCredentials} className="h-11 w-full gap-2" > <PlayCircle className="h-4 w-4" /> Fill demo credentials </Button> <p className="text-center text-[10px] text-muted-foreground"> Uses demo@gmail.com with Password123 </p> </div> )} onSubmit={handleSubmit} |
| src/app/login/page.tsx:178 | button |  {showPassword ? <X className="h-4 w-4" /> : <Shield className="h-4 w-4" />} type="button" onClick={() => setShowPassword(!showPassword)} |
| src/app/login/page.tsx:191 | Button |  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : ( <> {mode === "login" ? "Sign in" : "Create account"} <ArrowRight className="h-5 w-5" /> </> )} type="submit" disabled={loading} |
| src/app/login/page.tsx:205 | Button |  Fill demo credentials type="button" variant="outline" disabled={loading} onClick={fillDemoCredentials} |
| src/app/login/page.tsx:254 | form |  {error && <p className="text-center text-sm text-rose-500">{error}</p>} onSubmit={handleVerify} |
| src/app/login/page.tsx:265 | Button |  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify <ArrowRight className="h-5 w-5" /></>} type="submit" disabled={loading \|\| verifyCode.length !== 6} |
| src/app/login/page.tsx:269 | button | ← Back to sign in onClick={() => { setStep("auth"); setError(""); setVerifyCode(""); }} |
| src/app/login/page.tsx:285 | form |  {error && <p className="text-sm text-rose-500">{error}</p>} onSubmit={async (e) => { e.preventDefault(); setLoading(true); setError(""); try { const res = await fetch("/api/auth/qr-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", token: qrConfirmToken, email, password }), }); const data = await res.json(); if (!res.ok) { setError(data.error \|\| "Failed to confirm"); return; } setStep("done"); setTimeout(() => { window.location.href = "/app"; }, 800); } catch { setError("Network error"); } finally { setLoading(false); } }} |
| src/app/login/page.tsx:311 | Button |  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Confirm login <ArrowRight className="h-5 w-5" /></>} type="submit" disabled={loading} |
| src/app/login/page.tsx:315 | button | ← Cancel onClick={() => { setStep("auth"); window.history.replaceState({}, "", "/login"); }} |
| src/app/page.tsx:119 | SmoothScrollLink | Features href="#features" |
| src/app/page.tsx:120 | SmoothScrollLink | Domains href="#domains" |
| src/app/page.tsx:121 | SmoothScrollLink | Philosophy href="#philosophy" |
| src/app/page.tsx:124 | Button |  variant="outline" asChild |
| src/app/page.tsx:125 | a |  href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" aria-label="View bearing.now on GitHub" |
| src/app/page.tsx:130 | Link |  href="/app" |
| src/app/page.tsx:131 | Button | Open app  |
| src/app/page.tsx:172 | Link |  href="/app" |
| src/app/page.tsx:173 | Button | Enter your brain size="lg" |
| src/app/page.tsx:177 | SmoothScrollLink |  href="#features" |
| src/app/page.tsx:178 | Button | Explore features size="lg" variant="outline" |
| src/app/page.tsx:182 | Button |  size="lg" variant="ghost" asChild |
| src/app/page.tsx:183 | a |  View source href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" |
| src/app/page.tsx:628 | Link |  href="/app" |
| src/app/page.tsx:629 | Button | Open bearing.now size="lg" |
| src/app/page.tsx:633 | Button |  size="lg" variant="outline" asChild |
| src/app/page.tsx:634 | a |  GitHub href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" |
| src/app/page.tsx:652 | SmoothScrollLink | Features href="#features" |
| src/app/page.tsx:653 | SmoothScrollLink | Domains href="#domains" |
| src/app/page.tsx:654 | SmoothScrollLink | Philosophy href="#philosophy" |
| src/app/page.tsx:655 | a |  GitHub href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" |
| src/app/page.tsx:658 | Link | Open app href="/app" |
| src/components/bearing/admin-quick-actions.tsx:41 | button |  Add a task onClick={() => openItemEditor({ type: "task" })} |
| src/components/bearing/admin-quick-actions.tsx:68 | motion.button |  {g.dueDate && ( <span className={cn("text-[10px]", dateColor(g.dueDate))}>{smartDate(g.dueDate)}</span> )} key={g.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(g.id)} |
| src/components/bearing/admin-quick-actions.tsx:104 | button |  {m.dueDate && <span className={cn("text-[10px]", dateColor(m.dueDate))}>{smartDate(m.dueDate)}</span>} key={m.id} onClick={() => openItemDetail(m.id)} |
| src/components/bearing/admin-quick-actions.tsx:134 | button |  key={d.id} onClick={() => openItemDetail(d.id)} |
| src/components/bearing/admin-quick-actions.tsx:162 | button |  {t.title} key={t.id} onClick={() => openItemDetail(t.id)} |
| src/components/bearing/bucket-list.tsx:70 | button |  onClick={(e) => { e.stopPropagation(); update.mutate({ id: item.id, revision: item.revision, status: "done" }, { onSuccess: () => notify.success("Achieved!") }); }} title="Mark as done" |
| src/components/bearing/bucket-list.tsx:80 | button |  {item.dueDate && ( <span className="text-[10px] text-muted-foreground"> {new Date(item.dueDate).getFullYear()} </span> )} onClick={() => openItemDetail(item.id)} |
| src/components/bearing/bucket-list.tsx:108 | motion.button |  key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} onClick={() => openItemDetail(item.id)} |
| src/components/bearing/bucket-list.tsx:129 | button |  Add to bucket list onClick={() => openItemEditor({ type: "goal" })} |
| src/components/bearing/follow-up-due.tsx:52 | button |  Add a contact onClick={() => openItemEditor({ type: "contact" })} |
| src/components/bearing/follow-up-due.tsx:88 | motion.button |  key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(c.id)} |
| src/components/bearing/follow-up-due.tsx:123 | motion.button |  key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (dueContacts.length + i) * 0.05 }} onClick={() => openItemDetail(c.id)} |
| src/components/bearing/health-overview.tsx:37 | button |  Log a symptom onClick={() => openItemEditor({ type: "symptom" })} |
| src/components/bearing/health-overview.tsx:72 | motion.button |  key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(a.id)} |
| src/components/bearing/health-overview.tsx:99 | button |  {m.metadata?.dose && <span className="text-[10px] text-muted-foreground">{m.metadata.dose}</span>} key={m.id} onClick={() => openItemDetail(m.id)} |
| src/components/bearing/health-overview.tsx:122 | motion.button |  {streak > 0 && ( <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600"> <Icon name="Flame" className="h-2.5 w-2.5" /> {streak} </span> )} key={h.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(h.id)} |
| src/components/bearing/health-overview.tsx:154 | motion.button |  key={s.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(s.id)} |
| src/components/bearing/idea-vault.tsx:38 | button |  Capture an idea onClick={() => openItemEditor({ type: "idea" })} |
| src/components/bearing/idea-vault.tsx:72 | motion.button |  {idea.status === "inbox" && ( <span className="flex-shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">NEW</span> )} key={idea.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(idea.id)} |
| src/components/bearing/idea-vault.tsx:107 | button |  {m.metadata?.rating > 0 && ( <span className="flex items-center gap-0.5 text-[10px] text-amber-500"> <Icon name="Star" className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {m.metadata.rating} </span> )} key={m.id} onClick={() => openItemDetail(m.id)} |
| src/components/bearing/idea-vault.tsx:137 | button |  key={e.id} onClick={() => openItemDetail(e.id)} |
| src/components/bearing/idea-vault.tsx:165 | button |  key={ms.id} onClick={() => openItemDetail(ms.id)} |
| src/components/bearing/item-card.tsx:34 | motion.div |  {/* type accent stripe */} {/* checkbox or type icon */} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} onClick={onClick} |
| src/components/bearing/item-card.tsx:53 | button |  onClick={toggleDone} aria-label="toggle complete" |
| src/components/bearing/item-detail-sheet.tsx:234 | button |  Edit onClick={() => { setContentRevision(item.revision); setContentDraft(item.content \|\| ""); setEditingContent(true); }} |
| src/components/bearing/item-detail-sheet.tsx:242 | button | Cancel onClick={() => setEditingContent(false)} |
| src/components/bearing/item-detail-sheet.tsx:243 | button | Save onClick={saveContent} |
| src/components/bearing/item-detail-sheet.tsx:303 | button |  key={i.id} onClick={() => addLink(i.id)} |
| src/components/bearing/item-detail-sheet.tsx:326 | ConnectionRow |  key={l.id} icon={m.icon} color={m.color} title={l.to.title} type={m.name} direction="out" onClick={() => useBearing.getState().openItemDetail(l.to.id)} onRemove={() => removeLink(l.to.id, "out", l.type, item.revision)} |
| src/components/bearing/item-detail-sheet.tsx:341 | ConnectionRow |  key={l.id} icon={m.icon} color={m.color} title={l.from.title} type={m.name} direction="in" onClick={() => useBearing.getState().openItemDetail(l.from.id)} onRemove={() => removeLink(l.from.id, "in", l.type, l.from.revision)} |
| src/components/bearing/item-detail-sheet.tsx:376 | Button |  {isDone ? "Reopen" : "Complete"} size="sm" variant={isDone ? "outline" : "default"} onClick={() => { update.mutate({ id: item.id, revision: item.revision, status: isDone ? "active" : "done" }, { onSuccess: () => notify.success(isDone ? "Reopened" : "Completed") }); }} |
| src/components/bearing/item-detail-sheet.tsx:386 | Button |  Edit size="sm" variant="outline" onClick={() => { openItemEditor(item); closeItemDetail(); }} |
| src/components/bearing/item-detail-sheet.tsx:396 | AlertDialogTrigger |  asChild |
| src/components/bearing/item-detail-sheet.tsx:397 | Button |  size="sm" variant="ghost" |
| src/components/bearing/item-detail-sheet.tsx:410 | AlertDialogAction | Archive onClick={handleDelete} |
| src/components/bearing/item-detail-sheet.tsx:552 | a |  {m.url.replace(/^https?:\/\//, "").slice(0, 40)} href={m.url} target="_blank" rel="noopener noreferrer" |
| src/components/bearing/item-detail-sheet.tsx:676 | button | Cancel onClick={onCancel} |
| src/components/bearing/item-detail-sheet.tsx:677 | button | Save onClick={onSave} |
| src/components/bearing/item-detail-sheet.tsx:708 | button |  {content ? "Edit" : "Write"} onClick={onEdit} |
| src/components/bearing/item-detail-sheet.tsx:714 | button |  Full editor onClick={() => useBearing.getState().openJournalEditor(itemId)} |
| src/components/bearing/item-detail-sheet.tsx:729 | button |  onClick={onEdit} |
| src/components/bearing/item-detail-sheet.tsx:766 | input |  type="number" min={0} max={totalPages} value={pageInput} onChange={(e) => setPageDraft({ value: e.target.value, revision: pageDraft?.revision ?? item.revision })} onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v !== currentPage) updatePage(v, pageDraft?.revision ?? item.revision); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} |
| src/components/bearing/item-detail-sheet.tsx:783 | button | −10 onClick={() => updatePage(Math.max(0, currentPage - 10))} title="Go back 10 pages" |
| src/components/bearing/item-detail-sheet.tsx:790 | button | +10 onClick={() => updatePage(Math.min(totalPages, currentPage + 10))} title="Forward 10 pages" |
| src/components/bearing/item-detail-sheet.tsx:797 | button | Done onClick={() => updatePage(totalPages)} title="Mark as finished" |
| src/components/bearing/item-detail-sheet.tsx:850 | button |  onClick={onClick} |
| src/components/bearing/item-detail-sheet.tsx:861 | button |  onClick={onRemove} title="Remove connection" |
| src/components/bearing/item-detail-sheet.tsx:899 | Button |  {doneToday ? "Done today" : "Mark today"} size="sm" variant={doneToday ? "secondary" : "default"} onClick={() => toggle.mutate({ id: itemId, date: todayKey })} |
| src/components/bearing/item-editor.tsx:197 | button |  {t.name} key={t.type} onClick={() => set("type", t.type)} |
| src/components/bearing/item-editor.tsx:233 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:247 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:268 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:278 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:317 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:333 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:353 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:379 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:430 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:441 | SelectTrigger |   |
| src/components/bearing/item-editor.tsx:511 | button |  onClick={() => set("tagNames", form.tagNames.filter((x: string) => x !== t))} |
| src/components/bearing/item-editor.tsx:516 | input |  value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" \|\| e.key === ",") { e.preventDefault(); addTag(); } }} list="tag-suggestions" placeholder="add tag…" |
| src/components/bearing/item-editor.tsx:541 | Button | Cancel variant="ghost" onClick={closeItemEditor} |
| src/components/bearing/item-editor.tsx:542 | Button |  {form.id ? "Save changes" : "Create"} onClick={save} disabled={create.isPending \|\| update.isPending} |
| src/components/bearing/layout.tsx:91 | Button |  {action.label} size="sm" onClick={action.onClick} |
| src/components/bearing/mood-check-in.tsx:109 | motion.button |  key={m.value} whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => setMood(m.value)} |
| src/components/bearing/mood-check-in.tsx:133 | motion.button |  {e.label} key={e.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setEnergy(e.value)} |
| src/components/bearing/mood-check-in.tsx:150 | button |  {create.isPending ? "Saving…" : "Save check-in"} onClick={save} disabled={create.isPending} |
| src/components/bearing/on-this-day.tsx:62 | motion.button |  {j.content && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{j.content}</p>} key={j.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(j.id)} |
| src/components/bearing/on-this-day.tsx:106 | motion.button |  key={c.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (journals.length + reviews.length + i) * 0.05 }} onClick={() => openItemDetail(c.id)} |
| src/components/bearing/onboarding-flow.tsx:133 | button |  key={i} onClick={() => setStep(i)} |
| src/components/bearing/onboarding-flow.tsx:142 | Button | Skip variant="ghost" size="sm" onClick={skip} |
| src/components/bearing/onboarding-flow.tsx:144 | Button |  {step < STEPS.length - 1 ? "Next" : "Get started"} size="sm" onClick={next} |
| src/components/bearing/quick-capture.tsx:132 | textarea |  ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !(e.metaKey \|\| e.ctrlKey)) { e.preventDefault(); submit(); } if (e.key === "Enter" && (e.metaKey \|\| e.ctrlKey)) { e.preventDefault(); submit(false); } // Number keys 1-6 to switch type when not holding modifiers if (!e.metaKey && !e.ctrlKey && !e.altKey) { const num = parseInt(e.key); if (num >= 1 && num <= QUICK_TYPES.length) { e.preventDefault(); setType(QUICK_TYPES[num - 1]); } } }} placeholder="What's on your mind? Press Enter to capture to inbox…" rows={3} |
| src/components/bearing/quick-capture.tsx:165 | button |  {m.name} key={t} onClick={() => setType(t)} |
| src/components/bearing/quick-capture.tsx:189 | select |  {domains.map((d: any) => ( <option key={d.id} value={d.id}>{d.name}</option> ))} value={domainId} onChange={(e) => setDomainId(e.target.value)} |
| src/components/bearing/quick-capture.tsx:199 | select |  {projects.map((p: any) => ( <option key={p.id} value={p.id}>{p.name}</option> ))} value={projectId} onChange={(e) => setProjectId(e.target.value)} |
| src/components/bearing/quick-capture.tsx:209 | button | More fields → onClick={() => { setQuickCaptureOpen(false); openItemEditor({ title: text, type }); }} |
| src/components/bearing/quick-capture.tsx:236 | button | Create active onClick={() => submit(false)} disabled={!text.trim()} |
| src/components/bearing/quick-capture.tsx:243 | button |  {capture.isPending ? "Capturing…" : "Capture to inbox"} onClick={() => submit(true)} disabled={!text.trim() \|\| capture.isPending} |
| src/components/bearing/reading-tracker.tsx:33 | button |  Add a book onClick={() => openItemEditor({ type: "bookmark" })} |
| src/components/bearing/reading-tracker.tsx:74 | motion.button |  key={b.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(b.id)} |
| src/components/bearing/reading-tracker.tsx:97 | motion.button |  key={b.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (reading.length + i) * 0.05 }} onClick={() => openItemDetail(b.id)} |
| src/components/bearing/reading-tracker.tsx:120 | motion.button |  {b.metadata?.rating && ( <span className="flex items-center gap-0.5 text-[10px] text-amber-500"> <Icon name="Star" className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> {b.metadata.rating} </span> )} key={b.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (reading.length + queued.length + i) * 0.05 }} onClick={() => openItemDetail(b.id)} |
| src/components/bearing/shell.tsx:147 | button |  command onClick={onCommand} |
| src/components/bearing/shell.tsx:158 | button |  Quick Capture onClick={onQuickCapture} |
| src/components/bearing/sidebar.tsx:63 | button |  {active && ( <motion.span layoutId="nav-active" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-emerald-500" /> )} {badge && ( <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">{badge}</span> )} key={n.key} onClick={() => nav(n.key)} |
| src/components/bearing/sidebar.tsx:90 | button |  {count ? <span className="text-[10px] text-muted-foreground/60">{count}</span> : null} key={d.key} onClick={() => nav(d.key)} |
| src/components/bearing/sidebar.tsx:111 | button |  Settings onClick={() => nav("settings")} |
| src/components/bearing/sidebar.tsx:121 | button |  Sign out onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }} |
| src/components/bearing/sidebar.tsx:148 | button |  onClick={() => setMobileOpen(true)} aria-label="Open menu" |
| src/components/bearing/subscriptions-overview.tsx:39 | button |  Add a transaction onClick={() => openItemEditor({ type: "finance" })} |
| src/components/bearing/subscriptions-overview.tsx:104 | motion.button |  key={s.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} onClick={() => openItemDetail(s.id)} |
| src/components/bearing/subscriptions-overview.tsx:145 | motion.button |  key={g.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(g.id)} |
| src/components/bearing/time-action-overview.tsx:52 | button |  Add a task onClick={() => openItemEditor({ type: "task" })} |
| src/components/bearing/time-action-overview.tsx:104 | TaskRow |  key={t.id} task={t} delay={i * 0.04} onClick={() => openItemDetail(t.id)} |
| src/components/bearing/time-action-overview.tsx:116 | TaskRow |  key={t.id} task={t} delay={(overdue.length + i) * 0.04} onClick={() => openItemDetail(t.id)} |
| src/components/bearing/time-action-overview.tsx:128 | TaskRow |  key={t.id} task={t} delay={(overdue.length + dueToday.length + i) * 0.04} onClick={() => openItemDetail(t.id)} |
| src/components/bearing/time-action-overview.tsx:148 | motion.button |  {/* 7-day dots */} {streak > 0 && ( <span className="flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600"> <Icon name="Flame" className="h-2.5 w-2.5" /> {streak} </span> )} key={h.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} onClick={() => openItemDetail(h.id)} |
| src/components/bearing/time-action-overview.tsx:187 | motion.button |  {task.priority > 0 && ( <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: ["#71717a", "#3b82f6", "#eab308", "#f59e0b", "#f43f5e"][task.priority] }} /> )} {task.dueDate && ( <span className={cn("flex-shrink-0 text-[10px]", dateColor(task.dueDate))}>{smartDate(task.dueDate)}</span> )} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay }} onClick={onClick} |
| src/components/bearing/topbar.tsx:70 | button |  key={p.id} onClick={() => { useBearing.getState().openProject(p.id); setOpen(false); setQ(""); }} |
| src/components/bearing/topbar.tsx:87 | button |  {i.domainId && DOMAIN_MAP[i.domainId] && ( <span className="text-[10px] text-muted-foreground">{DOMAIN_MAP[i.domainId].short}</span> )} key={i.id} onClick={() => { openItemDetail(i.id); setOpen(false); setQ(""); }} |
| src/components/bearing/topbar.tsx:109 | Button |  variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} disabled={!mounted} aria-label={mounted && resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"} |
| src/components/bearing/topbar.tsx:120 | Button |  onClick={() => setQuickCaptureOpen(true)} |
| src/components/bearing/views/agenda-view.tsx:46 | Button |  variant="outline" size="icon" onClick={() => setWeekStart(subWeeks(weekStart, 1))} |
| src/components/bearing/views/agenda-view.tsx:49 | Button | This week variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} |
| src/components/bearing/views/agenda-view.tsx:52 | Button |  variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))} |
| src/components/bearing/views/agenda-view.tsx:138 | motion.button |  {time && ( <span className="mt-0.5 flex-shrink-0 text-[9px] font-semibold tabular-nums text-muted-foreground"> {time} </span> )} key={item.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} onClick={() => openItemDetail(item.id)} |
| src/components/bearing/views/all-items-view.tsx:40 | Button |  New item onClick={() => openItemEditor()} |
| src/components/bearing/views/all-items-view.tsx:56 | button |  {s} key={s} onClick={() => setStatusFilter(s === "all" ? "active,done,archived,inbox,snoozed" : s)} |
| src/components/bearing/views/all-items-view.tsx:66 | SelectTrigger |  aria-label="Sort items" |
| src/components/bearing/views/all-items-view.tsx:80 | button | All types onClick={() => setTypeFilter(null)} |
| src/components/bearing/views/all-items-view.tsx:89 | button |  {t.name} key={t.type} onClick={() => setTypeFilter(t.type)} |
| src/components/bearing/views/all-items-view.tsx:112 | ItemCard |  key={item.id} item={item} showProject onClick={() => openItemDetail(item.id)} |
| src/components/bearing/views/calendar-view.tsx:61 | Button |  variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))} |
| src/components/bearing/views/calendar-view.tsx:64 | Button | Today variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelectedDay(new Date()); }} |
| src/components/bearing/views/calendar-view.tsx:67 | Button |  variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))} |
| src/components/bearing/views/calendar-view.tsx:113 | button |  key={i} onClick={() => setSelectedDay(day)} |
| src/components/bearing/views/calendar-view.tsx:162 | button | By type onClick={() => setCalendarLayerMode("type")} |
| src/components/bearing/views/calendar-view.tsx:168 | button | By domain onClick={() => setCalendarLayerMode("domain")} |
| src/components/bearing/views/calendar-view.tsx:179 | button |  {l.name} key={l.id} onClick={() => toggleLayer(l.id)} |
| src/components/bearing/views/calendar-view.tsx:194 | button | clear onClick={() => calendarLayers.forEach(toggleLayer)} |
| src/components/bearing/views/calendar-view.tsx:216 | motion.button |  key={it.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} onClick={() => openItemDetail(it.id)} |
| src/components/bearing/views/dashboard-view.tsx:203 | button |  onClick={() => setView("inbox")} |
| src/components/bearing/views/dashboard-view.tsx:206 | button |  onClick={() => setView("calendar")} |
| src/components/bearing/views/dashboard-view.tsx:209 | button |  onClick={() => setView("calendar")} |
| src/components/bearing/views/dashboard-view.tsx:212 | button |  onClick={() => setView("projects")} |
| src/components/bearing/views/dashboard-view.tsx:224 | Button |  Add task variant="ghost" size="sm" onClick={() => openItemEditor({ type: "task" })} |
| src/components/bearing/views/dashboard-view.tsx:243 | ItemCard |  key={t.id} item={t} showProject onClick={() => openItemDetail(t.id)} |
| src/components/bearing/views/dashboard-view.tsx:253 | ItemCard |  key={t.id} item={t} showProject onClick={() => openItemDetail(t.id)} |
| src/components/bearing/views/dashboard-view.tsx:263 | ItemCard |  key={t.id} item={t} showProject onClick={() => openItemDetail(t.id)} |
| src/components/bearing/views/dashboard-view.tsx:276 | Button | View all variant="ghost" size="sm" onClick={() => setView("projects")} |
| src/components/bearing/views/dashboard-view.tsx:283 | button |  key={p.id} onClick={() => openProject(p.id)} |
| src/components/bearing/views/dashboard-view.tsx:372 | Button |  Start reflection size="sm" onClick={() => setView("reviews")} |
| src/components/bearing/views/domain-view.tsx:64 | Button |  key={t} variant="outline" size="sm" onClick={() => openItemEditor({ type: t, domainId: domainRecord?.id })} |
| src/components/bearing/views/domain-view.tsx:103 | motion.button |  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => useBearing.getState().setView("sanctuary")} |
| src/components/bearing/views/domain-view.tsx:138 | button | All ( {items.length} ) onClick={() => setTypeFilter(null)} |
| src/components/bearing/views/domain-view.tsx:147 | button |  {m.name} ( {byType[t].length} ) key={t} onClick={() => setTypeFilter(t)} |
| src/components/bearing/views/domain-view.tsx:174 | ItemCard |  key={item.id} item={item} showProject onClick={() => openItemDetail(item.id)} |
| src/components/bearing/views/focus-view.tsx:263 | Button |  variant="outline" size="sm" onClick={toggleSound} |
| src/components/bearing/views/focus-view.tsx:276 | button |  {PRESETS[m].label} key={m} onClick={() => switchMode(m)} |
| src/components/bearing/views/focus-view.tsx:304 | button |  {m} key={m} onClick={() => applyCustomMins(m)} |
| src/components/bearing/views/focus-view.tsx:355 | Button |  {running ? "Pause" : remaining === 0 ? "Done" : "Start"} size="lg" onClick={() => setRunning((r) => !r)} disabled={remaining === 0} |
| src/components/bearing/views/focus-view.tsx:365 | Button |  size="lg" variant="outline" onClick={() => { setRunning(false); setRemaining(duration); }} title="Reset" |
| src/components/bearing/views/focus-view.tsx:374 | Button |  size="lg" variant="ghost" onClick={() => switchMode(mode)} title="Skip" |
| src/components/bearing/views/focus-view.tsx:424 | SelectTrigger |   |
| src/components/bearing/views/focus-view.tsx:441 | SelectTrigger |   |
| src/components/bearing/views/focus-view.tsx:454 | Button |  New task variant="outline" size="sm" onClick={() => openItemEditor({ type: "task" })} |
| src/components/bearing/views/graph-view.tsx:244 | Button |  Reset variant="outline" size="sm" onClick={() => setFilterKinds(new Set())} |
| src/components/bearing/views/graph-view.tsx:336 | g |  {(focused \|\| hovered === n.id) && ( <circle r={n.r + 8} fill={n.color} opacity={0.15} /> )} {isSearchMatch && ( <circle r={n.r + 5} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" opacity={0.8} /> )} {isSearchMatch && ( <text textAnchor="middle" dy={-n.r - 12} className="pointer-events-none fill-amber-500 text-[10px] font-semibold"> {truncate(n.title, 22)} </text> )} {isProject ? ( <> <rect x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} rx={4} fill={n.color} stroke="white" strokeWidth={2} /> <text textAnchor="middle" dy={n.r + 14} className="pointer-events-none fill-foreground text-[10px] font-semibold"> {truncate(n.title, 16)} </text> </> ) : ( <> <circle r={n.r} fill={n.color} stroke="white" strokeWidth={1.5} /> {(hovered === n.id \|\| focused) && ( <text textAnchor="middle" dy={-n.r - 8} className="pointer-events-none fill-foreground text-[10px] font-medium"> {truncate(n.title, 22)} </text> )} </> )} {n.status === "done" && ( <circle r={n.r + 3} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="2 2" /> )} key={n.id} transform={'translate(${n.x}, ${n.y})'} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)} onClick={() => handleClick(n)} |
| src/components/bearing/views/graph-view.tsx:396 | button |  onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="Zoom in" |
| src/components/bearing/views/graph-view.tsx:403 | button |  onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} title="Zoom out" |
| src/components/bearing/views/graph-view.tsx:410 | button |  onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Reset view" |
| src/components/bearing/views/graph-view.tsx:430 | input |  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search nodes…" |
| src/components/bearing/views/graph-view.tsx:437 | button |  onClick={() => setSearchQuery("")} |
| src/components/bearing/views/graph-view.tsx:479 | button |  {t.name} key={t.type} onClick={() => { setFilterKinds((s) => { const n = new Set(s); if (n.has(t.type)) n.delete(t.type); else n.add(t.type); return n; }); }} |
| src/components/bearing/views/graph-view.tsx:501 | button | clear onClick={() => setFilterKinds(new Set())} |
| src/components/bearing/views/inbox-view.tsx:109 | Button |  variant="outline" size="sm" onClick={runAiSmartProcess} disabled={aiLoading} |
| src/components/bearing/views/inbox-view.tsx:120 | Button |  Capture onClick={() => setQuickCaptureOpen(true)} |
| src/components/bearing/views/inbox-view.tsx:135 | select |  {ITEM_TYPES.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)} onChange={(e) => e.target.value && processAll("type", e.target.value)} defaultValue="" |
| src/components/bearing/views/inbox-view.tsx:139 | select |  {domains.map((d: any) => <option key={d.id} value={d.id}>{DOMAINS.find((dd) => dd.key === d.key)?.name}</option>)} onChange={(e) => e.target.value && processAll("domainId", e.target.value)} defaultValue="" |
| src/components/bearing/views/inbox-view.tsx:143 | select |  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)} onChange={(e) => e.target.value && processAll("projectId", e.target.value)} defaultValue="" |
| src/components/bearing/views/inbox-view.tsx:147 | Button |  Activate all {selected.size ? ' (${selected.size})' : ""} size="sm" variant="default" onClick={() => processAll("status", "active")} |
| src/components/bearing/views/inbox-view.tsx:195 | button |  {selected.has(item.id) && <Icon name="Check" className="h-3 w-3" strokeWidth={3} />} onClick={() => toggle(item.id)} |
| src/components/bearing/views/inbox-view.tsx:204 | ItemCard |  item={item} showProject onClick={() => openItemDetail(item.id)} |
| src/components/bearing/views/inbox-view.tsx:221 | button | Apply onClick={() => applyAiSuggestion(item.id)} |
| src/components/bearing/views/inbox-view.tsx:231 | button |  onClick={() => { update.mutate({ id: item.id, revision: item.revision, status: "active" }, { onSuccess: () => notify.success("Activated") }); }} title="Activate" |
| src/components/bearing/views/inbox-view.tsx:238 | button |  onClick={() => { openItemEditor(item); }} title="Edit" |
| src/components/bearing/views/inbox-view.tsx:245 | button |  onClick={() => { del.mutate({ id: item.id, revision: item.revision }, { onSuccess: () => notify.success("Archived") }); }} title="Archive" |
| src/components/bearing/views/insights-view.tsx:75 | Button |  variant="outline" size="sm" onClick={() => { runScheduler.mutate(); notify.info("Running scheduler…"); }} disabled={runScheduler.isPending} title="Advance recurring items and reset stale habit streaks" |
| src/components/bearing/views/insights-view.tsx:86 | Button |  variant="outline" size="sm" onClick={() => downloadCSV("finance")} |
| src/components/bearing/views/insights-view.tsx:89 | Button |  variant="outline" size="sm" onClick={() => downloadCSV("reviews")} |
| src/components/bearing/views/insights-view.tsx:92 | Button |  variant="outline" size="sm" onClick={() => downloadCSV("items")} |
| src/components/bearing/views/insights-view.tsx:249 | motion.button |  {p.targetDate && ( <p className="mt-2 text-[10px] text-muted-foreground">Target: {smartDate(p.targetDate)}</p> )} key={p.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} onClick={() => openProject(p.id)} |
| src/components/bearing/views/journal-editor-view.tsx:236 | button |  Back onClick={() => setView(journalEditId ? "mind_soul" : "mind_soul")} |
| src/components/bearing/views/journal-editor-view.tsx:250 | AlertDialogTrigger |  asChild |
| src/components/bearing/views/journal-editor-view.tsx:251 | Button |  variant="ghost" size="sm" |
| src/components/bearing/views/journal-editor-view.tsx:264 | AlertDialogAction | Archive onClick={handleDelete} |
| src/components/bearing/views/journal-editor-view.tsx:271 | Button |  {showPreview ? "Edit" : "Preview"} variant="ghost" size="sm" onClick={() => setShowPreview((p) => !p)} |
| src/components/bearing/views/journal-editor-view.tsx:280 | Button |  {saved ? "Saved" : journalEditId ? "Save" : "Publish"} size="sm" onClick={save} disabled={create.isPending \|\| update.isPending} |
| src/components/bearing/views/journal-editor-view.tsx:315 | button |  key={m.v} onClick={() => setMood(m.v)} |
| src/components/bearing/views/journal-editor-view.tsx:331 | input |  value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your entry a title…" autoFocus={!journalEditId} |
| src/components/bearing/views/journal-editor-view.tsx:367 | SelectTrigger |   |
| src/components/bearing/views/journal-editor-view.tsx:382 | input |  type="number" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleGoalSave()} min={1} autoFocus |
| src/components/bearing/views/journal-editor-view.tsx:392 | button | Set onClick={handleGoalSave} |
| src/components/bearing/views/journal-editor-view.tsx:393 | button | Cancel onClick={() => setShowGoalInput(false)} |
| src/components/bearing/views/journal-editor-view.tsx:396 | button |  onClick={() => setShowGoalInput(true)} title="Click to change daily writing goal" |
| src/components/bearing/views/projects-view.tsx:50 | button |  {f} key={f} onClick={() => setFilter(f)} |
| src/components/bearing/views/projects-view.tsx:59 | Button |  New onClick={() => setCreateOpen(true)} |
| src/components/bearing/views/projects-view.tsx:101 | motion.button |  key={p.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => openProject(p.id)} |
| src/components/bearing/views/projects-view.tsx:172 | button |  onClick={() => setView("projects")} |
| src/components/bearing/views/projects-view.tsx:191 | Button |  Add item variant="outline" size="sm" onClick={() => openItemEditor({ type: "task", projectId: id })} |
| src/components/bearing/views/projects-view.tsx:223 | Button |  Add variant="ghost" size="sm" onClick={() => openItemEditor({ type: "task", projectId: id })} |
| src/components/bearing/views/projects-view.tsx:228 | ItemCard |  key={t.id} item={t} onClick={() => openItemDetail(t.id)} |
| src/components/bearing/views/projects-view.tsx:236 | ItemCard |  key={n.id} item={n} onClick={() => openItemDetail(n.id)} |
| src/components/bearing/views/projects-view.tsx:244 | ItemCard |  key={o.id} item={o} onClick={() => openItemDetail(o.id)} |
| src/components/bearing/views/projects-view.tsx:261 | ItemCard |  key={f.id} item={f} compact onClick={() => openItemDetail(f.id)} |
| src/components/bearing/views/projects-view.tsx:270 | button |  {j.content && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{j.content}</p>} key={j.id} onClick={() => openItemDetail(j.id)} |
| src/components/bearing/views/projects-view.tsx:283 | ItemCard |  key={h.id} item={h} compact onClick={() => openItemDetail(h.id)} |
| src/components/bearing/views/projects-view.tsx:334 | SelectTrigger |   |
| src/components/bearing/views/projects-view.tsx:359 | button |  key={c} onClick={() => setForm({ ...form, color: c })} |
| src/components/bearing/views/projects-view.tsx:372 | button |  key={ic} onClick={() => setForm({ ...form, icon: ic })} |
| src/components/bearing/views/projects-view.tsx:385 | Button | Cancel variant="ghost" onClick={() => onOpenChange(false)} |
| src/components/bearing/views/projects-view.tsx:386 | Button | Create onClick={save} disabled={create.isPending} |
| src/components/bearing/views/reviews-view.tsx:39 | Button |  New reflection onClick={() => setDrafting(true)} |
| src/components/bearing/views/reviews-view.tsx:47 | TabsTrigger |  Daily value="daily" |
| src/components/bearing/views/reviews-view.tsx:48 | TabsTrigger |  Weekly value="weekly" |
| src/components/bearing/views/reviews-view.tsx:171 | ReviewField |  label={prompts.wins} icon="Trophy" color="#f59e0b" value={form.wins} onChange={(v) => set("wins", v)} placeholder="Even small wins count…" |
| src/components/bearing/views/reviews-view.tsx:172 | ReviewField |  label={prompts.challenges} icon="AlertCircle" color="#f43f5e" value={form.challenges} onChange={(v) => set("challenges", v)} placeholder="What got in the way?" |
| src/components/bearing/views/reviews-view.tsx:173 | ReviewField |  label={prompts.learnings} icon="Lightbulb" color="#3b82f6" value={form.learnings} onChange={(v) => set("learnings", v)} placeholder="A lesson, an insight…" |
| src/components/bearing/views/reviews-view.tsx:174 | ReviewField |  label={prompts.gratitude} icon="Heart" color="#ec4899" value={form.gratitude} onChange={(v) => set("gratitude", v)} placeholder="Who or what are you thankful for?" |
| src/components/bearing/views/reviews-view.tsx:192 | ReviewField |  label="Anything else?" icon="PenLine" color="#71717a" value={form.notes} onChange={(v) => set("notes", v)} placeholder="Free-form notes…" |
| src/components/bearing/views/reviews-view.tsx:195 | Button | Cancel variant="ghost" onClick={onDone} |
| src/components/bearing/views/reviews-view.tsx:196 | Button |  Save reflection onClick={save} disabled={create.isPending} |
| src/components/bearing/views/reviews-view.tsx:228 | button |  onClick={() => setExpanded((e) => !e)} |
| src/components/bearing/views/reviews-view.tsx:271 | Button |  variant="ghost" size="sm" onClick={() => { del.mutate(review.id); notify.success("Deleted"); }} |
| src/components/bearing/views/sanctuary-view.tsx:80 | Button |  Write journal variant="outline" size="sm" onClick={() => openJournalEditor(null)} |
| src/components/bearing/views/sanctuary-view.tsx:83 | Button |  Back variant="outline" size="sm" onClick={() => setView("mind_soul")} |
| src/components/bearing/views/sanctuary-view.tsx:160 | Button |  Write journal variant="outline" size="sm" onClick={() => openJournalEditor(null)} |
| src/components/bearing/views/sanctuary-view.tsx:163 | Button |  Back variant="outline" size="sm" onClick={() => setView("mind_soul")} |
| src/components/bearing/views/sanctuary-view.tsx:193 | Button |  Reflect on this variant="outline" size="sm" onClick={() => openItemDetail(dailyAffirmation.id)} |
| src/components/bearing/views/sanctuary-view.tsx:196 | Button |  Add affirmation variant="ghost" size="sm" onClick={() => openItemEditor({ type: "affirmation", domainId: dailyAffirmation.domainId })} |
| src/components/bearing/views/sanctuary-view.tsx:255 | Button |  Begin breathing onClick={() => setBreathing(true)} |
| src/components/bearing/views/sanctuary-view.tsx:259 | Button |  End session variant="outline" onClick={stopBreathing} |
| src/components/bearing/views/sanctuary-view.tsx:269 | Button |  Add variant="ghost" size="sm" onClick={() => openItemEditor({ type: "vision" })} |
| src/components/bearing/views/sanctuary-view.tsx:277 | Button | Write a vision variant="outline" size="sm" onClick={() => openItemEditor({ type: "vision" })} |
| src/components/bearing/views/sanctuary-view.tsx:284 | motion.button |  key={v.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openItemDetail(v.id)} |
| src/components/bearing/views/sanctuary-view.tsx:313 | Button |  Write variant="ghost" size="sm" onClick={() => openJournalEditor(null)} |
| src/components/bearing/views/sanctuary-view.tsx:319 | button |  onClick={() => openJournalEditor(null)} |
| src/components/bearing/views/sanctuary-view.tsx:330 | motion.button |  {j.content && ( <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{j.content}</p> )} key={j.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => openJournalEditor(j.id)} |
| src/components/bearing/views/settings-view.tsx:213 | Button |  Save profile size="sm" onClick={async () => { const res = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); if (res.ok) notify.success("Profile updated"); }} |
| src/components/bearing/views/settings-view.tsx:223 | ToggleRow |  icon="Smartphone" color="#10b981" title="Two-factor authentication" desc={twoFAEnabled ? "Enabled — requires code on login" : "Off — password only"} checked={twoFAEnabled} onChange={toggle2FA} |
| src/components/bearing/views/settings-view.tsx:233 | Button | {loading ? <Icon name="Loader2" className="h-3.5 w-3.5 animate-spin" /> : "Confirm"} size="sm" onClick={confirm2FA} disabled={loading \|\| verifyCode.length !== 6} |
| src/components/bearing/views/settings-view.tsx:234 | Button | Cancel size="sm" variant="ghost" onClick={() => { setShow2FASetup(false); setVerifyCode(""); }} |
| src/components/bearing/views/settings-view.tsx:245 | Button |  Generate QR size="sm" variant="outline" onClick={startQrLogin} disabled={qrLoading} |
| src/components/bearing/views/settings-view.tsx:275 | ToggleRow |  icon="Bot" color="#a78bfa" title="Enable AI features" desc="Master toggle for all AI-powered features" checked={prefs?.aiEnabled ?? true} onChange={(v) => updatePrefs({ aiEnabled: v })} |
| src/components/bearing/views/settings-view.tsx:279 | ToggleRow |  icon="Inbox" color="#f59e0b" title="Smart Inbox Processing" desc="AI suggests type, domain & project for inbox items" checked={prefs?.aiSmartInbox ?? true} onChange={(v) => updatePrefs({ aiSmartInbox: v })} |
| src/components/bearing/views/settings-view.tsx:284 | SelectTrigger |   |
| src/components/bearing/views/settings-view.tsx:326 | SelectTrigger |   |
| src/components/bearing/views/settings-view.tsx:335 | Button | Enable size="sm" variant="outline" onClick={async () => { const g = await requestNotificationPermission(); if (g) { notify.success("Notifications enabled"); sendNotification("bearing.now", "Enabled!"); } else notify.error("Permission denied"); }} |
| src/components/bearing/views/settings-view.tsx:355 | a | Supabase href="https://supabase.com" target="_blank" |
| src/components/bearing/views/settings-view.tsx:364 | Button |  Seed test data variant="outline" size="sm" onClick={seedData} |
| src/components/bearing/views/settings-view.tsx:369 | AlertDialogTrigger |  asChild |
| src/components/bearing/views/settings-view.tsx:370 | Button |  Reset database variant="outline" size="sm" |
| src/components/bearing/views/settings-view.tsx:381 | AlertDialogAction | Reset everything onClick={async () => { const res = await fetch("/api/reset-db", { method: "POST" }); const data = await res.json(); if (res.ok) { notify.success("Database reset. Reloading…"); setTimeout(() => window.location.reload(), 1500); } else notify.error(data.error \|\| "Reset failed"); }} |
| src/components/bearing/views/settings-view.tsx:395 | Button |  Export CSV variant="outline" size="sm" onClick={() => window.open("/api/export?type=items", "_blank")} |
| src/components/bearing/views/settings-view.tsx:396 | Button |  Full backup (JSON) variant="outline" size="sm" onClick={async () => { const res = await fetch("/api/backup"); const data = await res.json(); const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = 'bearing-backup-${new Date().toISOString().slice(0, 10)}.json'; a.click(); URL.revokeObjectURL(url); notify.success("Backup downloaded"); }} |
| src/components/bearing/views/settings-view.tsx:403 | Button |  Restore backup variant="outline" size="sm" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".json"; input.onchange = async (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return; const text = await file.text(); try { const data = JSON.parse(text); const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); if (res.ok) { notify.success("Backup restored"); setTimeout(() => window.location.reload(), 1000); } else notify.error("Restore failed"); } catch { notify.error("Invalid file"); } }; input.click(); }} |
| src/components/bearing/views/settings-view.tsx:424 | Button |  Sign out variant="outline" size="sm" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }} |
| src/components/quick-capture.tsx:72 | Button | Cancel variant="ghost" size="sm" onClick={() => onOpenChange(false)} |
| src/components/quick-capture.tsx:75 | Button | Save size="sm" |
| src/components/smooth-scroll-link.tsx:57 | a |  href={href} onClick={handleClick} {...props} |
| src/components/ui/alert-dialog.tsx:19 | AlertDialogPrimitive.Trigger |  data-slot="alert-dialog-trigger" {...props} |
| src/components/ui/alert-dialog.tsx:126 | AlertDialogPrimitive.Action |  {...props} |
| src/components/ui/dialog.tsx:18 | DialogPrimitive.Trigger |  data-slot="dialog-trigger" {...props} |
| src/components/ui/input.tsx:7 | input |  type={type} data-slot="input" {...props} |
| src/components/ui/popover.tsx:17 | PopoverPrimitive.Trigger |  data-slot="popover-trigger" {...props} |
| src/components/ui/select.tsx:36 | SelectPrimitive.Trigger |  {children} data-slot="select-trigger" data-size={size} {...props} |
| src/components/ui/sheet.tsx:16 | SheetPrimitive.Trigger |  data-slot="sheet-trigger" {...props} |
| src/components/ui/tabs.tsx:42 | TabsPrimitive.Trigger |  data-slot="tabs-trigger" {...props} |
| src/components/ui/textarea.tsx:7 | textarea |  data-slot="textarea" {...props} |
| src/components/ui/toast.tsx:62 | ToastPrimitives.Action |  ref={ref} {...props} |

## Client fetches and navigation targets

```text
src/app/login/page.tsx:27 fetch("/api/auth/session").then(r => r.json()).then(d => {
src/app/login/page.tsx:28 if (d.authenticated) window.location.href = "/app";
src/app/login/page.tsx:31 const params = new URLSearchParams(window.location.search);
src/app/login/page.tsx:45 const res = await fetch(endpoint, {
src/app/login/page.tsx:53 else if (data.authenticated) { setStep("done"); setTimeout(() => { window.location.href = "/app"; }, 800); }
src/app/login/page.tsx:63 const res = await fetch("/api/auth/verify", {
src/app/login/page.tsx:71 setTimeout(() => { window.location.href = "/app"; }, 800);
src/app/login/page.tsx:290 const res = await fetch("/api/auth/qr-login", {
src/app/login/page.tsx:298 setTimeout(() => { window.location.href = "/app"; }, 800);
src/app/page.tsx:119 <SmoothScrollLink href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</SmoothScrollLink>
src/app/page.tsx:120 <SmoothScrollLink href="#domains" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Domains</SmoothScrollLink>
src/app/page.tsx:121 <SmoothScrollLink href="#philosophy" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Philosophy</SmoothScrollLink>
src/app/page.tsx:125 <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" aria-label="View bearing.now on GitHub">
src/app/page.tsx:130 <Link href="/app">
src/app/page.tsx:172 <Link href="/app">
src/app/page.tsx:177 <SmoothScrollLink href="#features">
src/app/page.tsx:183 <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer">
src/app/page.tsx:628 <Link href="/app">
src/app/page.tsx:634 <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer">
src/app/page.tsx:652 <SmoothScrollLink href="#features" className="hover:text-foreground">Features</SmoothScrollLink>
src/app/page.tsx:653 <SmoothScrollLink href="#domains" className="hover:text-foreground">Domains</SmoothScrollLink>
src/app/page.tsx:654 <SmoothScrollLink href="#philosophy" className="hover:text-foreground">Philosophy</SmoothScrollLink>
src/app/page.tsx:655 <a href={siteConfig.repositoryUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
src/app/page.tsx:658 <Link href="/app" className="hover:text-foreground">Open app</Link>
src/components/bearing/item-detail-sheet.tsx:553 href={m.url}
src/components/bearing/shell.tsx:80 fetch("/api/scheduler", { method: "POST" }).catch(() => {});
src/components/bearing/sidebar.tsx:122 onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
src/components/bearing/views/inbox-view.tsx:30 fetch("/api/preferences").then(r => r.json()).then(d => {
src/components/bearing/views/inbox-view.tsx:40 const res = await fetch("/api/ai/smart-inbox", { method: "POST" });
src/components/bearing/views/settings-view.tsx:55 fetch("/api/auth/session").then(r => r.json()).then(d => setEmail(d.email || ""));
src/components/bearing/views/settings-view.tsx:56 fetch("/api/preferences").then(r => r.json()).then(d => { setPrefs(d); setName(d.name || ""); setLoading(false); });
src/components/bearing/views/settings-view.tsx:57 fetch("/api/auth/2fa-status").then(r => r.json()).then(d => { setTwoFAEnabled(d.enabled); setName(d.name || ""); });
src/components/bearing/views/settings-view.tsx:61 const res = await fetch("/api/preferences", {
src/components/bearing/views/settings-view.tsx:76 const res = await fetch("/api/auth/setup-2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
src/components/bearing/views/settings-view.tsx:85 const res = await fetch("/api/auth/disable-2fa", { method: "POST" });
src/components/bearing/views/settings-view.tsx:93 const res = await fetch("/api/auth/setup-2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", token: verifyCode }) });
src/components/bearing/views/settings-view.tsx:110 const res = await fetch("/api/auth/qr-login", {
src/components/bearing/views/settings-view.tsx:129 const res = await fetch(`/api/auth/qr-login?token=${token}`);
src/components/bearing/views/settings-view.tsx:148 const res = await fetch("/api/seed", { method: "POST" });
src/components/bearing/views/settings-view.tsx:150 if (res.ok) { notify.success("Seed data created!"); setTimeout(() => window.location.reload(), 1500); }
src/components/bearing/views/settings-view.tsx:214 const res = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
src/components/bearing/views/settings-view.tsx:382 const res = await fetch("/api/reset-db", { method: "POST" });
src/components/bearing/views/settings-view.tsx:384 if (res.ok) { notify.success("Database reset. Reloading…"); setTimeout(() => window.location.reload(), 1500); }
src/components/bearing/views/settings-view.tsx:395 <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open("/api/export?type=items", "_blank")}><Icon name="Download" className="h-3.5 w-3.5" /> Export CSV</Button>
src/components/bearing/views/settings-view.tsx:397 const res = await fetch("/api/backup"); const data = await res.json();
src/components/bearing/views/settings-view.tsx:410 const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
src/components/bearing/views/settings-view.tsx:411 if (res.ok) { notify.success("Backup restored"); setTimeout(() => window.location.reload(), 1000); }
src/components/bearing/views/settings-view.tsx:424 <Button variant="outline" size="sm" className="gap-1.5 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
src/components/smooth-scroll-link.tsx:32 if (updateUrl && window.location.hash !== hash) {
src/components/smooth-scroll-link.tsx:57 return <a href={href} onClick={handleClick} {...props} />;
src/components/smooth-scroll-link.tsx:62 if (!window.location.hash) return;
src/components/smooth-scroll-link.tsx:64 const hash = window.location.hash;
src/hooks/use-open-item.ts:10 const send = (method: string) => fetch(url, {
src/lib/ai-provider.ts:60 const res = await fetch(`${baseUrl}/chat/completions`, {
src/lib/hooks.ts:24 async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
src/lib/hooks.ts:25 const res = await fetch(url, {
src/lib/hooks.ts:46 queryFn: () => jfetch<{ items: any[] }>(`/api/items${qs ? `?${qs}` : ""}`),
src/lib/hooks.ts:53 queryFn: () => jfetch<any>(`/api/items/${id}`),
src/lib/hooks.ts:61 mutationFn: (body: any) => jfetch<any>("/api/items", { method: "POST", body: JSON.stringify(body) }),
src/lib/hooks.ts:76 jfetch<any>(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
src/lib/hooks.ts:92 jfetch<any>(`/api/items/${id}`, { method: "DELETE", body: JSON.stringify({ revision }) }),
src/lib/hooks.ts:105 return useQuery({ queryKey: qk.inbox, queryFn: () => jfetch<{ items: any[] }>("/api/inbox") });
src/lib/hooks.ts:111 mutationFn: (body: any) => jfetch<any>("/api/inbox", { method: "POST", body: JSON.stringify(body) }),
src/lib/hooks.ts:121 return useQuery({ queryKey: qk.projects, queryFn: () => jfetch<{ projects: any[] }>("/api/projects") });
src/lib/hooks.ts:127 queryFn: () => jfetch<any>(`/api/projects/${id}`),
src/lib/hooks.ts:135 mutationFn: (body: any) => jfetch<any>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
src/lib/hooks.ts:144 jfetch<any>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
src/lib/hooks.ts:155 mutationFn: (id: string) => jfetch<any>(`/api/projects/${id}`, { method: "DELETE" }),
src/lib/hooks.ts:163 return useQuery({ queryKey: qk.calendar(params), queryFn: () => jfetch<any>(`/api/calendar?${qs}`) });
src/lib/hooks.ts:169 return useQuery({ queryKey: qk.reviews(type), queryFn: () => jfetch<{ reviews: any[] }>(`/api/reviews${qs}`) });
src/lib/hooks.ts:175 mutationFn: (body: any) => jfetch<any>("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
src/lib/hooks.ts:187 jfetch<any>(`/api/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
src/lib/hooks.ts:195 mutationFn: (id: string) => jfetch<any>(`/api/reviews/${id}`, { method: "DELETE" }),
src/lib/hooks.ts:202 return useQuery({ queryKey: qk.stats, queryFn: () => jfetch<any>("/api/stats") });
src/lib/hooks.ts:207 return useQuery({ queryKey: qk.tags, queryFn: () => jfetch<{ tags: any[] }>("/api/tags") });
src/lib/hooks.ts:212 return useQuery({ queryKey: qk.domains, queryFn: () => jfetch<{ domains: any[] }>("/api/domains") });
src/lib/hooks.ts:217 return useQuery({ queryKey: qk.insights, queryFn: () => jfetch<any>("/api/insights") });
src/lib/hooks.ts:223 return useQuery({ queryKey: qk.graph(params), queryFn: () => jfetch<any>(`/api/graph?${qs}`) });
src/lib/hooks.ts:238 return useQuery({ queryKey: qk.onThisDay, queryFn: () => jfetch<any>("/api/on-this-day") });
src/lib/hooks.ts:245 mutationFn: () => jfetch<any>("/api/scheduler", { method: "POST" }),
src/lib/hooks.ts:259 queryFn: () => jfetch<any>(`/api/search?q=${encodeURIComponent(q)}`),
src/lib/hooks.ts:269 jfetch<any>(`/api/items/${id}/habit-logs`, { method: "POST", body: JSON.stringify({ date, value }) }),
src/lib/hooks.ts:284 jfetch<any>(`/api/items/${fromId}/links`, { method: "POST", body: JSON.stringify(body) }),
src/lib/hooks.ts:300 jfetch<any>(`/api/items/${fromId}/links?${new URLSearchParams({ toId, type: type || "related_to", revision: String(revision) })}`, { method: "DELETE" }),
```

## Missing route audit

All literal internal href/fetch targets resolve to existing routes. Sidebar destinations are Zustand views under `/app`, not missing Next.js pages. Dynamic item/project/review IDs must refer to existing records. External URLs, user bookmark URLs and landing-page anchors are not application routes. See README findings for runtime failures.
