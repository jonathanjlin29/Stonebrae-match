"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { Camera, Check, Loader2, X } from "lucide-react"
import { getMyProfile, saveMyProfile, type MyProfile } from "@/app/actions/profile"
import type { Player } from "@/lib/types"
import { initials, shortLabel } from "@/lib/util"
import { Button, PlayerAvatar } from "./ui"

export function ProfileSettings({ player }: { player: Player }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [saved])
  function close() {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  return (
    <>
      <button ref={trigger} type="button" onClick={() => { setSaved(false); setOpen(true) }} aria-haspopup="dialog" aria-label={`Profile settings for ${shortLabel(player)}`}
        className="flex min-w-0 items-center gap-2 rounded-full bg-[var(--color-surface-2)] px-2 py-1.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] sm:px-3">
        <PlayerAvatar player={player} size="sm" />
        <span className="max-w-20 truncate sm:max-w-32">{shortLabel(player)}</span>
      </button>
      {open && createPortal(<ProfileDialog player={player} onClose={close} onSaved={() => { setSaved(true); close() }} />, document.body)}
      {saved && createPortal(<div role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-primary-foreground)] shadow-lg"><Check className="h-4 w-4" /> Profile saved</div>, document.body)}
    </>
  )
}

function ProfileDialog({ player, onClose, onSaved }: { player: Player; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const { data, error, isValidating, mutate } = useSWR(["my-profile", player.id], () => getMyProfile(), { revalidateOnFocus: false, revalidateOnReconnect: false })
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { element?.close(); document.body.style.overflow = previousOverflow }
  }, [])
  return (
    <dialog ref={dialog} aria-labelledby="profile-title" aria-describedby="profile-description" onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-foreground)] shadow-2xl backdrop:bg-[var(--color-background)]/80 backdrop:backdrop-blur-sm">
      <div className="flex items-start justify-between border-b border-[var(--color-border)] p-6">
        <div>
          <h2 id="profile-title" className="font-display text-2xl text-balance">Profile settings</h2>
          <p id="profile-description" className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">Make your player profile your own.</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close profile settings" className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-40"><X className="h-5 w-5" /></button>
      </div>
      {!data || isValidating ? (
        <div className="p-6" role="status">{error ? <><p>Could not load your profile.</p><Button onClick={() => mutate()} variant="outline" className="mt-4">Try again</Button></> : <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…</p>}</div>
      ) : <ProfileForm key={`${data.id}-${data.version}-${data.nickname}`} profile={data} player={player} onClose={onClose} onSaved={onSaved} saving={saving} setSaving={setSaving} />}
    </dialog>
  )
}

function ProfileForm({ profile, player, onClose, onSaved, saving, setSaving }: {
  profile: MyProfile; player: Player; onClose: () => void; onSaved: () => void
  saving: boolean; setSaving: (value: boolean) => void
}) {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    if (!photo) { setPreview(null); return }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  function choosePhoto(file?: File) {
    if (!file) return
    setPhotoError(null)
    if (file.size > 3 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Choose a JPEG, PNG, or WebP image smaller than 3 MB.")
      if (fileInput.current) fileInput.current.value = ""
      return
    }
    setImageFailed(false)
    setPhoto(file)
    setRemovePhoto(false)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || photoError) return
    const form = new FormData(event.currentTarget)
    form.set("expectedPlayer", String(profile.id))
    form.set("version", profile.version)
    form.set("removePhoto", String(removePhoto))
    if (photo) form.set("photo", photo)
    setSaving(true)
    setError(null)
    try {
      const result = await saveMyProfile(form)
      if (!result.ok) { setError(result.error); return }
      router.refresh()
      onSaved()
    } catch {
      setError("Could not save your profile. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }
  const photoUrl = preview ?? (removePhoto ? null : profile.photoUrl)
  const inputClass = "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3 text-base text-[var(--color-foreground)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
  return (
    <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }}>
      <fieldset disabled={saving} className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-5">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-surface-2)] font-display text-2xl text-[var(--color-primary)] ring-1 ring-[var(--color-border)]">
            {photoUrl && !imageFailed ? <img src={photoUrl} alt="Your profile photo preview" className="h-full w-full object-cover" onError={() => setImageFailed(true)} /> : initials(player)}
          </span>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Profile photo <span className="font-normal text-[var(--color-muted)]">(optional)</span></span>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}><Camera className="h-4 w-4" /> {photoUrl ? "Change photo" : "Upload photo"}</Button>
              {(photoUrl || photo) && <button type="button" className="text-sm text-[var(--color-danger)] underline underline-offset-4" onClick={() => { setPhoto(null); setRemovePhoto(true); setPhotoError(null); if (fileInput.current) fileInput.current.value = "" }}>Remove</button>}
            </div>
            <p id="photo-help" className="text-sm text-[var(--color-muted)]">JPG, PNG or WebP · Max 3 MB</p>
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" aria-describedby="photo-help" className="sr-only" tabIndex={-1} onChange={(event) => choosePhoto(event.target.files?.[0])} />
          </div>
        </div>
        {photoError && <p role="alert" className="text-sm text-[var(--color-danger)]">{photoError}</p>}
        <div className="flex flex-col gap-2">
          <label htmlFor="profile-username" className="text-sm font-semibold">Username</label>
          <input id="profile-username" name="nickname" autoComplete="nickname" defaultValue={profile.nickname} placeholder={player.name} maxLength={20} aria-describedby="username-help" className={inputClass} />
          <p id="username-help" className="text-sm leading-relaxed text-[var(--color-muted)]">Your display name on scorecards and leaderboards. Leave blank to use your name.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="profile-email" className="text-sm font-semibold">Email <span className="font-normal text-[var(--color-muted)]">(optional)</span></label>
          <input id="profile-email" name="email" type="email" autoComplete="email" defaultValue={profile.email} placeholder="you@example.com" maxLength={254} aria-describedby="email-help" className={inputClass} />
          <p id="email-help" className="text-sm leading-relaxed text-[var(--color-muted)]">Not shown on public pages or used for sign-in. Anyone who selects your name can access these settings.</p>
        </div>
        {error && <p role="alert" className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">{error}</p>}
      </fieldset>
      <div className="flex justify-end gap-3 border-t border-[var(--color-border)] p-6">
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || !!photoError}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  )
}
