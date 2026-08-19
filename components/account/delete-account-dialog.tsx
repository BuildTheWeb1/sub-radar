'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from '@/components/ui/alert-dialog'

export function DeleteAccountDialog() {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      // The account is already gone server-side; signing out just clears the
      // now-stale session cookie and sends the user somewhere that doesn't
      // assume a signed-in user.
      await signOut({ callbackUrl: '/login' })
    } catch {
      toast.error('Could not delete your account. Try again in a moment.')
      setDeleting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete account
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your campaigns, collected leads, and credit history. Your
            remaining credit balance is not refunded. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose disabled={deleting}>Cancel</AlertDialogClose>
          <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
            {deleting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete permanently'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
