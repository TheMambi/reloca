"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createNoticeDraft,
  updateNoticeDraft,
  markNoticeSent,
} from "@/app/lease/actions";
import { settle } from "@/lib/settle-action";
import { renderNoticeTemplate } from "./notice-template";
import { noticeTerm } from "@/lib/lease/notice-term";
import { addDaysIso, isoDateInZone, isoToPickerDate, pickerDateToIso, todayInZoneIso } from "@/lib/dates";
import type { LeaseTerms, NoticeDraft } from "@/schemas/lease";

interface NoticeComposerProps {
  lease: LeaseTerms;
  draft: NoticeDraft | null;
}

// "2027-10-25" → "Monday, Oct 25" for the calendar trigger button.
function formatTriggerDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "2027-10-25" → "2027-10-25" (already ISO; keep as-is for the locked-state pill).
function formatLockedDate(iso: string): string {
  return iso.slice(0, 10);
}

// Build a `mailto:` URL with proper URL-encoding. Recipient is encoded per RFC.
function buildMailtoUrl(
  recipient: string,
  subject: string,
  body: string,
): string {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
}

// "today + N days" as a Date object, used for the calendar's `disabled` predicate.
function addDaysDate(iso: string, days: number): Date {
  return isoToPickerDate(addDaysIso(iso, days));
}

export function NoticeComposer({ lease, draft }: NoticeComposerProps) {
  // ── state ────────────────────────────────────────────────────────────────
  const today = todayInZoneIso();
  const minMoveOutDate = useMemo(
    () => addDaysDate(today, lease.notice_days_required),
    [today, lease.notice_days_required],
  );

  const initialMoveOut =
    draft?.move_out_date ?? lease.target_move_out_date ?? lease.lease_end_date;
  const [moveOut, setMoveOut] = useState<string>(initialMoveOut);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Subject + body: pre-populate from draft if it exists, else from the template.
  const initialRender = useMemo(
    () => renderNoticeTemplate(lease, initialMoveOut),
    [lease, initialMoveOut],
  );
  const [subject, setSubject] = useState<string>(
    draft?.subject_line ?? initialRender.subject,
  );
  const [body, setBody] = useState<string>(
    draft?.body_plaintext ?? initialRender.plaintext,
  );

  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [isCreatePending, startCreate] = useTransition();
  const [isSavePending, startSave] = useTransition();
  const [isSendPending, startSend] = useTransition();

  const locked = Boolean(draft?.sent_at);
  const sentDate = draft?.sent_at
    ? formatLockedDate(isoDateInZone(new Date(draft.sent_at)))
    : null;

  // ── actions ──────────────────────────────────────────────────────────────
  function onMoveOutSelect(d: Date | undefined) {
    if (!d) return;
    const iso = pickerDateToIso(d);
    setMoveOut(iso);
    setCalendarOpen(false);
    // Re-render template only if the user hasn't manually edited (best-effort:
    // we always regenerate when the date changes — user can hit Reset).
    const next = renderNoticeTemplate(lease, iso);
    setSubject(next.subject);
    setBody(next.plaintext);
  }

  function onReset() {
    const next = renderNoticeTemplate(lease, moveOut);
    setSubject(next.subject);
    setBody(next.plaintext);
    setErrorMsg(null);
  }

  function onCopy() {
    void navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  function onCreate() {
    setErrorMsg(null);
    startCreate(async () => {
      const res = await settle(
        createNoticeDraft(lease.id, {
          subject_line: subject,
          body_markdown: body,
          body_plaintext: body,
          recipient_email: lease.landlord_email,
          move_out_date: moveOut,
        }),
      );
      if (!res.ok) setErrorMsg(res.error);
    });
  }

  function onSave() {
    if (!draft) return;
    setErrorMsg(null);
    startSave(async () => {
      const res = await settle(
        updateNoticeDraft(draft.id, {
          subject_line: subject,
          body_markdown: body,
          body_plaintext: body,
          move_out_date: moveOut,
        }),
      );
      if (!res.ok) setErrorMsg(res.error);
    });
  }

  function onConfirmSend() {
    if (!draft) return;
    setSendError(null);
    startSend(async () => {
      const res = await settle(markNoticeSent(draft.id));
      if (res.ok) setConfirmOpen(false);
      else setSendError(res.error);
    });
  }

  function handleDialogChange(open: boolean) {
    setConfirmOpen(open);
    if (!open) setSendError(null);
  }

  // ── empty state: no draft yet ───────────────────────────────────────────
  if (!draft) {
    return (
      <section
        aria-labelledby="notice-composer-heading"
        className="rounded-[var(--radius-md)] border border-border bg-card"
      >
        <header className="border-b border-border px-6 py-4">
          <span
            id="notice-composer-heading"
            className="label-cap text-[10px] text-muted-foreground"
          >
            MOVE-OUT NOTICE
          </span>
          <p className="mt-1 text-sm font-medium text-foreground">
            Write your {noticeTerm(lease.notice_days_required)} to the landlord
          </p>
          <p className="text-xs text-muted-foreground">
            We&rsquo;ll fill the email subject and body from your lease info.
            You can edit anything before sending.
          </p>
        </header>
        <div className="flex flex-col items-center gap-3 px-6 py-12">
          <p className="label-cap text-[10px] text-muted-foreground">
            NOT YET WRITTEN
          </p>
          <Button
            type="button"
            onClick={onCreate}
            disabled={isCreatePending}
            className="bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)]"
          >
            {isCreatePending ? "Writing…" : "Write the notice"}
          </Button>
          {errorMsg && (
            <p className="label-cap text-[10px] text-[var(--danger)]">
              {errorMsg}
            </p>
          )}
        </div>
      </section>
    );
  }

  // ── full editor + locked state share the same 2-column shell ────────────
  const previewBody = locked ? draft.body_plaintext : body;
  const mailtoHref = buildMailtoUrl(lease.landlord_email, subject, body);

  return (
    <section
      aria-labelledby="notice-composer-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="border-b border-border px-6 py-4">
        <span
          id="notice-composer-heading"
          className="label-cap text-[10px] text-muted-foreground"
        >
          NOTICE COMPOSER
        </span>
        <p className="mt-1 text-sm font-medium text-foreground">
          {lease.notice_days_required > 0
            ? `${noticeTerm(lease.notice_days_required)} to vacate`
            : "Notice to vacate"}
        </p>
        <p className="text-xs text-muted-foreground">
          Render, review, then open in your mail client. Mailto only — no SMTP.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
        {/* ── LEFT: form ──────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 px-6 py-5">
          {/* Move-out date */}
          <div className="flex flex-col gap-1.5">
            <label className="label-cap text-[10px] text-muted-foreground">
              MOVE-OUT DATE
            </label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  className="mono-num h-8 w-full justify-between text-xs"
                >
                  <span>{moveOut}</span>
                  <span className="label-cap text-[9px] text-muted-foreground">
                    {formatTriggerDate(moveOut)}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-auto p-0"
              >
                <Calendar
                  mode="single"
                  selected={isoToPickerDate(moveOut)}
                  onSelect={onMoveOutSelect}
                  disabled={(d) => d < minMoveOutDate}
                  defaultMonth={isoToPickerDate(moveOut)}
                />
              </PopoverContent>
            </Popover>
            <p className="label-cap text-[9px] text-muted-foreground">
              EARLIEST: {pickerDateToIso(minMoveOutDate)} · TODAY +{" "}
              {lease.notice_days_required}D
            </p>
          </div>

          {/* Read-only summary */}
          <dl className="grid grid-cols-1 gap-2 rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-3 py-2.5">
            <SummaryRow
              k="RESIDENTS"
              v={lease.residents.map((r) => r.name).join(", ")}
            />
            <SummaryRow k="UNIT" v={`${lease.unit_address}, ${lease.city}`} />
            <SummaryRow k="RECIPIENT" v={lease.landlord_email} />
          </dl>

          {/* Editable subject */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="notice-subject"
              className="label-cap text-[10px] text-muted-foreground"
            >
              SUBJECT
            </label>
            <Input
              id="notice-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={locked}
              className="text-xs"
            />
          </div>

          {/* Editable body */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="notice-body"
              className="label-cap text-[10px] text-muted-foreground"
            >
              BODY
            </label>
            <textarea
              id="notice-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={locked}
              className="min-h-[16rem] w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs leading-relaxed text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30"
            />
          </div>

          {!locked && (
            <div className="flex flex-row items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onReset}
                className="text-xs"
              >
                Reset to template
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSave}
                disabled={isSavePending}
                className="text-xs"
              >
                {isSavePending ? "Saving…" : "Save changes"}
              </Button>
              {errorMsg && (
                <span className="label-cap text-[10px] text-[var(--danger)]">
                  {errorMsg}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: preview + actions ───────────────────────────────── */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-start justify-between gap-2">
            <span className="label-cap text-[10px] text-muted-foreground">
              PREVIEW & ACTIONS
            </span>
            {locked && sentDate && (
              <span className="label-cap inline-flex items-center rounded-[var(--radius-sm)] border border-[oklch(var(--ok-raw)/0.3)] bg-[oklch(var(--ok-raw)/0.12)] px-2 py-0.5 text-[10px] tracking-wider text-[var(--ok)]">
                NOTICE SENT · {sentDate}
              </span>
            )}
          </div>

          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] border border-border/60 bg-background/40 px-4 py-3 font-mono text-xs leading-relaxed text-foreground">
            {previewBody}
          </pre>

          {!locked && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={onCopy}
                className="w-full bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)]"
              >
                Copy notice text
              </Button>
              {copied && (
                <p className="label-cap -mt-1 text-center text-[10px] text-[var(--ok)]">
                  COPIED
                </p>
              )}

              <Button
                type="button"
                variant="outline"
                asChild
                className="w-full"
              >
                <a
                  href={mailtoHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in mail client
                </a>
              </Button>
              <p className="text-center text-[10px] text-muted-foreground">
                Opens your default mail app pre-filled. Review, then send.
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                className="w-full border-[oklch(var(--danger-raw)/0.4)] text-[var(--danger)] hover:bg-[oklch(var(--danger-raw)/0.1)]"
              >
                Mark notice as sent
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirm-send dialog */}
      <Dialog open={confirmOpen} onOpenChange={handleDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark notice as sent?</DialogTitle>
            <DialogDescription>
              Record today&rsquo;s date{" "}
              <span className="mono-num text-foreground">({today})</span> as
              when you sent the notice. The text will lock — if you need to
              change something later, you can start a new one.
            </DialogDescription>
          </DialogHeader>
          {sendError && (
            <p className="mt-3 rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-3 py-2 text-xs text-[var(--danger)]">
              {sendError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogChange(false)}
              disabled={isSendPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirmSend}
              disabled={isSendPending}
              className="bg-[var(--brand)] text-[var(--brand-foreground)] hover:bg-[oklch(var(--brand-raw)/0.9)]"
            >
              {isSendPending ? "Saving…" : "Yes, mark it sent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="label-cap shrink-0 text-[10px] text-muted-foreground sm:w-24">
        {k}
      </dt>
      <dd className="break-words text-xs text-foreground">{v}</dd>
    </div>
  );
}
