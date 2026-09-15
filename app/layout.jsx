import './globals.css'
import Sidebar from '@/components/Sidebar'
import ActingAs from '@/components/ActingAs'
import { currentUser, listUsers } from '@/lib/current-user'
import { googleConfigStatus } from '@/lib/google'

export const metadata = {
  title: 'Reserves at Park Creek Enforcement',
  description: 'HOA rules enforcement case management',
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }) {
  const { configured } = googleConfigStatus()
  const [user, users] = configured ? await Promise.all([currentUser(), listUsers()]) : [null, []]

  return (
    <html lang="en">
      <body className="flex min-h-full flex-col md:flex-row">
        <Sidebar user={user} />
        <div className="flex-1 min-w-0">
          <header className="flex items-center justify-end gap-3 border-b border-ink-200 bg-white px-4 py-2 md:px-8">
            <ActingAs user={user} users={users} />
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
